"""Proof of the enforced rate limit on openapiproext.bnf.fr.

Measures, per clock-minute, how many successful (200) responses the BnF partner
API delivered before it began returning real HTTP 429s (Retry-After → next
clock-minute). Produces two publication-quality seaborn charts for the BnF
message and prints the exact figures.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from analyze import load

HERE = Path(__file__).resolve().parent
DOCUMENTED = 300  # req/min communicated by BnF
CLIENT_CAP = 180  # our own broker token-bucket cap

sns.set_theme(style="whitegrid", context="talk", font_scale=0.9)
ALIEN = "#2563eb"
BNF_RED = "#c1121f"
GREY = "#6b7280"


def per_minute_proof(df: pd.DataFrame) -> pd.DataFrame:
    """One row per clock-minute on the partner API (global bucket)."""
    g = df[(df.host == "openapiproext.bnf.fr") & (df.bucket == "global")].copy()
    g["is200"] = g.status == 200
    rows = []
    for m, sub in g.groupby("minute"):
        sub = sub.sort_values("ts")
        fz = sub[sub.note == "freeze"]
        n200 = int(sub.is200.sum())
        if len(fz):
            t0 = fz.ts.min()
            before = sub[sub.ts < t0]
            rows.append(
                {
                    "minute": m,
                    "frozen": True,
                    "n200_total": n200,
                    "accepted_before_429": int(before.is200.sum()),
                    "first_429_offset_s": (t0 - m).total_seconds(),
                    "n_429": len(fz),
                }
            )
        else:
            rows.append(
                {
                    "minute": m,
                    "frozen": False,
                    "n200_total": n200,
                    "accepted_before_429": n200,
                    "first_429_offset_s": float("nan"),
                    "n_429": 0,
                }
            )
    return pd.DataFrame(rows)


def main() -> None:
    df = load()
    pm = per_minute_proof(df)
    frozen = pm[pm.frozen]
    acc = frozen.accepted_before_429

    # ---- exact figures for the message ---------------------------------------
    g = df[(df.host == "openapiproext.bnf.fr") & (df.bucket == "global")]
    n_200 = int((g.status == 200).sum())
    n_freeze = int((g.note == "freeze").sum())
    win_start, win_end = g.ts.min(), g.ts.max()
    band = acc.quantile([0.05, 0.5, 0.95])
    print("================ FIGURES FOR THE BnF MESSAGE ================")
    print(f"Window (partner API traffic): {win_start:%Y-%m-%d %H:%M} – {win_end:%H:%M} UTC")
    print(f"Successful (200) responses delivered: {n_200:,}")
    print(f"Real 429 responses from BnF: {n_freeze:,}")
    print(f"Distinct clock-minutes in which BnF returned 429: {len(frozen)}")
    print("Successful responses delivered each minute BEFORE the first 429:")
    print(f"  median {acc.median():.0f}  |  mean {acc.mean():.1f}  |  std {acc.std():.1f}")
    print(f"  IQR {acc.quantile(.25):.0f}–{acc.quantile(.75):.0f}  |  "
          f"5th–95th pct {band.iloc[0]:.0f}–{band.iloc[2]:.0f}")
    pct_100_103 = 100 * acc.between(100, 103).mean()
    print(f"  {pct_100_103:.0f}% of minutes fell in 100–103")
    print(f"First-429 offset within the minute: median {frozen.first_429_offset_s.median():.0f}s, "
          f"min {frozen.first_429_offset_s.min():.0f}s (a hard floor — no 429 before this)")
    print(f"Mean sustained successful throughput: {pm[pm.frozen].n200_total.mean():.0f}/min "
          f"(documented {DOCUMENTED}, our client cap {CLIENT_CAP})")
    print("============================================================")

    # ---- CHART 1: the proof — accepted-before-429 distribution ---------------
    fig, ax = plt.subplots(figsize=(11, 6))
    sns.histplot(acc, binwidth=1, color=ALIEN, edgecolor="white", ax=ax)
    med = acc.median()
    ax.axvline(med, color=BNF_RED, lw=2.5, ls="--")
    ax.text(med + 1, ax.get_ylim()[1] * 0.92, f"median {med:.0f} req/min",
            color=BNF_RED, fontweight="bold")
    ax.set_title("BnF partner API: requests accepted per minute before HTTP 429\n"
                 f"({len(frozen)} distinct clock-minutes, single OAuth client)",
                 fontsize=14)
    ax.set_xlabel("successful (200) responses delivered before the first 429")
    ax.set_ylabel("number of clock-minutes")
    ax.set_xlim(85, 130)
    sns.despine()
    fig.tight_layout()
    fig.savefig(HERE / "proof_01_limit_histogram.png", dpi=140)
    plt.close(fig)

    # ---- CHART 2: sustained throughput vs documented quota -------------------
    ts = (
        g.assign(is200=g.status == 200)
        .groupby("minute")["is200"].sum()
        .rename("ok")
        .reset_index()
    )
    full = pd.date_range(ts.minute.min(), ts.minute.max(), freq="min")
    ts = ts.set_index("minute").reindex(full).reset_index(names="minute")

    fig, ax = plt.subplots(figsize=(13, 6))
    sns.lineplot(data=ts, x="minute", y="ok", color=ALIEN, lw=1.4, ax=ax, label="delivered 200s/min")
    ax.axhline(DOCUMENTED, color=BNF_RED, ls="--", lw=2, label=f"documented quota ({DOCUMENTED}/min)")
    ax.axhline(CLIENT_CAP, color=GREY, ls=":", lw=2, label=f"our client cap ({CLIENT_CAP}/min)")
    ax.axhline(med, color="#059669", ls="-", lw=1.5, label=f"measured ceiling ({med:.0f}/min)")
    ax.set_ylim(0, DOCUMENTED + 20)
    ax.set_title("Sustained successful throughput vs documented quota — pinned at ~100/min",
                 fontsize=14)
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("successful responses / min")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
    ax.legend(loc="center right", fontsize=10, framealpha=0.95)
    sns.despine()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(HERE / "proof_02_throughput_vs_quota.png", dpi=140)
    plt.close(fig)

    print(f"\nCharts: {HERE}/proof_01_limit_histogram.png, proof_02_throughput_vs_quota.png")


if __name__ == "__main__":
    main()
