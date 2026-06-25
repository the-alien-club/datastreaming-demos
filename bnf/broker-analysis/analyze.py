"""BnF broker call-log analysis.

Reads broker-calls.csv (one row per upstream call, oldest first) and produces:
  - throughput time-series per bucket + global-vs-cap
  - 429 (shed vs freeze) analysis incl. freeze time-of-minute offsets
  - freeze cost (parsed French Retry-After) and wall-clock lost
  - wait_ms percentile distributions per bucket
  - redundancy (repeated host,path) accounting
  - a written summary (summary.md) with the key numbers

Charts land in this directory as PNGs.
"""

from __future__ import annotations

import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
CSV = HERE.parent / "broker-calls.csv"
GLOBAL_CAP = 180  # calls/min, partner API
MANIFEST_CAP = 40  # calls/min, IIIF manifest sub-cap
EXTERNAL_CAP = 120  # calls/min, ungated politeness

FRENCH_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}
# "mer., 24 juin 2026 22:21:00 GMT"
RETRY_RE = re.compile(
    r"(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*GMT", re.IGNORECASE
)


def parse_french_retry(val: str):
    if not isinstance(val, str) or not val.strip():
        return pd.NaT
    m = RETRY_RE.search(val)
    if not m:
        return pd.NaT
    day, month_name, year, hh, mm, ss = m.groups()
    month = FRENCH_MONTHS.get(month_name.lower())
    if month is None:
        return pd.NaT
    return pd.Timestamp(
        year=int(year), month=month, day=int(day),
        hour=int(hh), minute=int(mm), second=int(ss), tz="UTC",
    )


def load() -> pd.DataFrame:
    df = pd.read_csv(CSV)
    df["ts"] = pd.to_datetime(df["timestamp_iso"], utc=True)
    df["authed"] = df["authed"].astype(str).str.lower() == "true"
    df["minute"] = df["ts"].dt.floor("min")
    df["sec_of_min"] = df["ts"].dt.second + df["ts"].dt.microsecond / 1e6
    df["retry_dt"] = df["retry_after"].apply(parse_french_retry)
    df = df.sort_values("ts").reset_index(drop=True)
    return df


def section(title: str) -> str:
    return f"\n## {title}\n"


def main() -> None:
    df = load()
    out: list[str] = []
    span = df["ts"].max() - df["ts"].min()
    span_min = span.total_seconds() / 60.0

    out.append("# BnF Broker Call-Log Analysis\n")
    out.append(
        f"- Rows: **{len(df):,}** calls\n"
        f"- Window: **{df['ts'].min():%Y-%m-%d %H:%M:%S} → {df['ts'].max():%H:%M:%S} UTC** "
        f"({span_min/60:.2f} h, {span_min:.0f} min wall-clock)\n"
        f"- Hosts: " + ", ".join(f"{h} ({n:,})" for h, n in df["host"].value_counts().items()) + "\n"
        f"- Buckets: " + ", ".join(f"{b} ({n:,})" for b, n in df["bucket"].value_counts().items()) + "\n"
        f"- Status: " + ", ".join(f"{s} ({n:,})" for s, n in df["status"].value_counts().items()) + "\n"
        f"- Notes: " + ", ".join(f"{x} ({n:,})" for x, n in df["note"].value_counts().items()) + "\n"
    )

    # ---- per-minute aggregates -------------------------------------------------
    df["is200"] = df["status"] == 200
    df["is429"] = df["status"] == 429
    df["is_shed"] = df["note"] == "shed"
    df["is_freeze"] = df["note"] == "freeze"
    df["is_err"] = df["note"] == "upstream_error"

    g = df[df["bucket"] == "global"]
    # per-minute counts for the global bucket
    per_min = (
        g.groupby("minute")
        .agg(
            attempts=("status", "size"),
            ok=("is200", "sum"),
            shed=("is_shed", "sum"),
            freeze=("is_freeze", "sum"),
            err=("is_err", "sum"),
            sent=("fetch_ms", lambda s: (s > 0).sum()),
        )
        .reset_index()
    )

    # ---- THROUGHPUT ------------------------------------------------------------
    ok_per_min_by_bucket = (
        df[df["is200"]].groupby(["minute", "bucket"]).size().unstack(fill_value=0)
    )
    # Reindex to a gap-free minute axis with NaN so plotted lines BREAK over idle
    # gaps instead of drawing a misleading diagonal across them.
    full_idx = pd.date_range(df["minute"].min(), df["minute"].max(), freq="min")
    ok_plot = ok_per_min_by_bucket.reindex(full_idx)
    # only minutes that are "active" for global (>=1 attempt) to avoid idle-gap dilution
    active = per_min[per_min["attempts"] > 0]
    g_ok = active["ok"]
    out.append(section("1. Throughput"))
    out.append(
        f"- Global successful (200) calls: **{int(g['is200'].sum()):,}**\n"
        f"- Active global minutes (≥1 attempt): **{len(active)}**\n"
        f"- Mean achieved global rate (active minutes): **{g_ok.mean():.1f}/min** "
        f"(cap {GLOBAL_CAP})\n"
        f"- Median: **{g_ok.median():.0f}/min**; p90 **{g_ok.quantile(.9):.0f}**; "
        f"p95 **{g_ok.quantile(.95):.0f}**; max **{g_ok.max():.0f}/min**\n"
        f"- Minutes at ≥95% of cap (≥{int(0.95*GLOBAL_CAP)}/min): "
        f"**{(g_ok >= 0.95*GLOBAL_CAP).sum()}** "
        f"({100*(g_ok >= 0.95*GLOBAL_CAP).mean():.0f}% of active minutes)\n"
        f"- Minutes at ≥90% of cap (≥{int(0.90*GLOBAL_CAP)}/min): "
        f"**{(g_ok >= 0.90*GLOBAL_CAP).sum()}**\n"
        f"- Utilisation = mean_achieved / cap = **{100*g_ok.mean()/GLOBAL_CAP:.0f}%**\n"
    )
    for b, cap in [("manifest", MANIFEST_CAP), ("external", EXTERNAL_CAP)]:
        if b in ok_per_min_by_bucket.columns:
            s = ok_per_min_by_bucket[b]
            s = s[s > 0]
            out.append(
                f"- {b} bucket (cap {cap}): mean **{s.mean():.1f}/min**, "
                f"max **{s.max():.0f}/min** over {len(s)} active min\n"
            )

    # throughput chart
    fig, ax = plt.subplots(figsize=(14, 6))
    for b in ["global", "external", "manifest"]:
        if b in ok_plot.columns:
            ax.plot(ok_plot.index, ok_plot[b], lw=0.9, label=f"{b} (200s/min)")
    ax.axhline(GLOBAL_CAP, color="red", ls="--", lw=1, label=f"global cap {GLOBAL_CAP}")
    ax.axhline(MANIFEST_CAP, color="purple", ls=":", lw=1, label=f"manifest cap {MANIFEST_CAP}")
    ax.set_title("Successful throughput per minute, by bucket")
    ax.set_ylabel("successful calls / min")
    ax.legend(loc="upper right", fontsize=8)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(HERE / "01_throughput.png", dpi=110)
    plt.close(fig)

    # ---- 429 ANALYSIS ----------------------------------------------------------
    total_global = len(g)
    n_shed = int(g["is_shed"].sum())
    n_freeze = int(g["is_freeze"].sum())
    out.append(section("2. 429 Analysis (shed vs freeze)"))
    out.append(
        f"- Global attempts: **{total_global:,}**\n"
        f"- 429s total on global: **{int(g['is429'].sum()):,}** "
        f"(**{100*g['is429'].mean():.1f}%** of global attempts)\n"
        f"  - shed (self-throttle, not sent to BnF): **{n_shed:,}** "
        f"({100*n_shed/total_global:.1f}%)\n"
        f"  - freeze (real BnF 429): **{n_freeze:,}** "
        f"({100*n_freeze/total_global:.1f}%)\n"
        f"- shed:freeze ratio = **{n_shed/max(n_freeze,1):.1f} : 1** — "
        f"the overwhelming majority of 429s are self-inflicted by our own bucket, "
        f"not BnF.\n"
    )

    # freeze time-of-minute offsets
    freezes = g[g["is_freeze"]].copy()
    if len(freezes):
        offs = freezes["sec_of_min"]
        out.append(
            f"- Freeze time-of-minute offset: mean **{offs.mean():.1f}s**, "
            f"median **{offs.median():.1f}s**, "
            f"p10 **{offs.quantile(.1):.1f}s**, p90 **{offs.quantile(.9):.1f}s**, "
            f"min **{offs.min():.1f}s**, max **{offs.max():.1f}s**\n"
        )
        # which clock-minutes had a freeze (the 'first freeze' of each minute is the trigger)
        first_freeze = freezes.groupby("minute")["sec_of_min"].min()
        out.append(
            f"- Distinct clock-minutes containing ≥1 freeze: **{freezes['minute'].nunique()}**\n"
            f"- First-freeze-of-minute offset: mean **{first_freeze.mean():.1f}s**, "
            f"median **{first_freeze.median():.1f}s** "
            f"(this is when BnF's window actually tips over)\n"
        )

    # 429 rate over time chart
    fig, (axA, axB) = plt.subplots(2, 1, figsize=(14, 8), sharex=True)
    axA.plot(per_min["minute"], per_min["ok"], color="green", lw=0.8, label="ok (200)")
    axA.plot(per_min["minute"], per_min["shed"], color="orange", lw=0.8, label="shed")
    axA.plot(per_min["minute"], per_min["freeze"], color="red", lw=0.8, label="freeze")
    axA.axhline(GLOBAL_CAP, color="red", ls="--", lw=0.8)
    axA.set_title("Global bucket per-minute: ok vs shed vs freeze")
    axA.set_ylabel("calls/min")
    axA.legend(fontsize=8)
    # freeze offset histogram
    if len(freezes):
        axB2 = axB
        axB2.hist(freezes["sec_of_min"], bins=60, range=(0, 60), color="red", alpha=0.7)
        axB2.set_title("Freeze events by second-of-minute (0–60s)")
        axB2.set_xlabel("second within clock-minute")
        axB2.set_ylabel("# freeze events")
    fig.tight_layout()
    fig.savefig(HERE / "02_429_analysis.png", dpi=110)
    plt.close(fig)

    # standalone freeze-offset histogram (clearer)
    if len(freezes):
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.hist(freezes["sec_of_min"], bins=60, range=(0, 60), color="crimson", alpha=0.8)
        ax.axvline(freezes["sec_of_min"].median(), color="black", ls="--",
                   label=f"median {freezes['sec_of_min'].median():.0f}s")
        ax.set_title("When do real BnF 429s (freezes) land within the clock-minute?")
        ax.set_xlabel("second within clock-minute (window resets at :00)")
        ax.set_ylabel("# freeze events")
        ax.legend()
        fig.tight_layout()
        fig.savefig(HERE / "03_freeze_offset_hist.png", dpi=110)
        plt.close(fig)

    # ---- FREEZE COST -----------------------------------------------------------
    out.append(section("3. Freeze Cost (wall-clock stalled)"))
    # group consecutive freezes into episodes: a new episode when gap to prev freeze > 90s
    freezes_sorted = freezes.sort_values("ts")
    episodes = []
    if len(freezes_sorted):
        cur_start = None
        cur_rows = []
        prev_ts = None
        for _, r in freezes_sorted.iterrows():
            if prev_ts is None or (r["ts"] - prev_ts).total_seconds() > 90:
                if cur_rows:
                    episodes.append(cur_rows)
                cur_rows = [r]
            else:
                cur_rows.append(r)
            prev_ts = r["ts"]
        if cur_rows:
            episodes.append(cur_rows)

    # per-freeze: stall = retry_dt - ts (time until BnF says window reopens)
    freezes_sorted = freezes_sorted.assign(
        stall_s=(freezes_sorted["retry_dt"] - freezes_sorted["ts"]).dt.total_seconds()
    )
    valid_stall = freezes_sorted["stall_s"].dropna()
    # episode-level stall: from first freeze ts to the max retry_dt in the episode
    ep_stats = []
    for rows in episodes:
        sub = pd.DataFrame(rows)
        start = sub["ts"].min()
        reopen = sub["retry_dt"].max()
        stall = (reopen - start).total_seconds() if pd.notna(reopen) else np.nan
        ep_stats.append({"start": start, "reopen": reopen, "stall_s": stall, "n_freezes": len(sub)})
    ep_df = pd.DataFrame(ep_stats)
    total_stall = ep_df["stall_s"].dropna().sum() if len(ep_df) else 0.0

    # The honest freeze-cost metric: idle seconds lost per frozen clock-minute.
    # Global (partner-API) traffic is a single ingest burst; measure against THAT
    # active window, not the full 573-min run (which is mostly idle metadata tail).
    g_active_s = (g["ts"].max() - g["ts"].min()).total_seconds()
    first_freeze_min = freezes.groupby("minute")["sec_of_min"].min()
    idle_lost_s = (60.0 - first_freeze_min).clip(lower=0).sum()
    out.append(
        f"- **Caveat:** global (partner-API) traffic is one ingest burst "
        f"**{g['ts'].min():%H:%M}–{g['ts'].max():%H:%M}** (~{g_active_s/60:.0f} min). "
        f"The 02:05–07:53 tail is low-rate ungated metadata only. Freeze cost is "
        f"measured against the **active ingest window**, not the full run.\n"
        f"- Freeze episodes (consecutive freeze runs, gap>90s splits): **{len(ep_df)}**\n"
        f"- Distinct clock-minutes with ≥1 freeze: **{freezes['minute'].nunique()}** of "
        f"**{len(active)}** active minutes = "
        f"**{100*freezes['minute'].nunique()/len(active):.0f}% of every ingest minute frozen**\n"
        f"- Idle time lost = Σ(60s − first-freeze-offset) per frozen minute: "
        f"**{idle_lost_s/60:.1f} min** = **{100*idle_lost_s/g_active_s:.1f}% of the "
        f"{g_active_s/60:.0f}-min ingest window** sat frozen and idle\n"
        f"- Per-freeze advertised Retry-After stall: median **{valid_stall.median():.0f}s**, "
        f"max **{valid_stall.max():.0f}s** (the {total_stall/60:.0f}-min episode-sum "
        f"OVERSTATES: BnF pushes the reopen later each time we re-probe during a freeze).\n"
    )
    if len(ep_df):
        ep_show = ep_df.copy()
        ep_show["start"] = ep_show["start"].dt.strftime("%H:%M:%S")
        ep_show["reopen"] = ep_show["reopen"].dt.strftime("%H:%M:%S")
        out.append("\nFreeze episodes:\n\n")
        out.append("| start | advertised reopen | stall (s) | # freezes |\n|---|---|---|---|\n")
        for _, r in ep_show.iterrows():
            out.append(f"| {r['start']} | {r['reopen']} | {r['stall_s']:.0f} | {int(r['n_freezes'])} |\n")

    # ---- WAIT-TIME DISTRIBUTION ------------------------------------------------
    out.append(section("4. Wait-time distribution (rate-limit latency added)"))
    out.append("| bucket | n | mean | p50 | p90 | p95 | p99 | max | % with wait>0 |\n|---|---|---|---|---|---|---|---|---|\n")
    for b in ["global", "manifest", "external"]:
        sub = df[df["bucket"] == b]["wait_ms"]
        if len(sub):
            out.append(
                f"| {b} | {len(sub):,} | {sub.mean():.0f} | {sub.quantile(.5):.0f} | "
                f"{sub.quantile(.9):.0f} | {sub.quantile(.95):.0f} | {sub.quantile(.99):.0f} | "
                f"{sub.max():.0f} | {100*(sub>0).mean():.0f}% |\n"
            )
    # fetch latency for context (only sent calls)
    sent = df[df["fetch_ms"] > 0]["fetch_ms"]
    out.append(
        f"\nUpstream fetch latency (sent calls only): median **{sent.median():.0f}ms**, "
        f"p95 **{sent.quantile(.95):.0f}ms**, max **{sent.max():.0f}ms**.\n"
    )

    fig, ax = plt.subplots(figsize=(11, 6))
    for b, c in [("global", "steelblue"), ("external", "seagreen"), ("manifest", "purple")]:
        sub = df[(df["bucket"] == b) & (df["wait_ms"] > 0)]["wait_ms"]
        if len(sub):
            ax.hist(sub, bins=60, alpha=0.55, label=f"{b} (n={len(sub):,}, wait>0)", color=c)
    ax.set_yscale("log")
    ax.set_title("wait_ms distribution (waits >0 only, log y)")
    ax.set_xlabel("wait_ms (queue/freeze pressure)")
    ax.set_ylabel("count (log)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(HERE / "04_wait_hist.png", dpi=110)
    plt.close(fig)

    # ---- REDUNDANCY ------------------------------------------------------------
    out.append(section("5. Redundancy (repeated host,path = retry waste proxy)"))
    key = df["host"] + " " + df["path"]
    counts = key.value_counts()
    dup_keys = counts[counts > 1]
    wasted = int((counts[counts > 1] - 1).sum())
    out.append(
        f"- Distinct (host,path) endpoints: **{counts.size:,}**\n"
        f"- Endpoints fetched more than once: **{len(dup_keys):,}** "
        f"({100*len(dup_keys)/counts.size:.1f}% of distinct endpoints)\n"
        f"- Redundant calls (total calls − distinct endpoints): **{wasted:,}** "
        f"(**{100*wasted/len(df):.1f}%** of all calls)\n"
        f"- Max repeats on a single endpoint: **{counts.max()}**\n"
    )
    # redundancy split by outcome: are repeats mostly re-fetches of failed (429/5xx) calls?
    df["key"] = key
    rep = df[df["key"].isin(dup_keys.index)]
    # for repeated keys, how many of the calls were non-200?
    out.append(
        f"- Of the {len(rep):,} calls hitting a repeated endpoint, "
        f"**{int((rep['status']!=200).sum()):,}** were non-200 "
        f"({100*(rep['status']!=200).mean():.0f}%) — these are the retries after shed/freeze/5xx.\n"
    )
    # successful redundancy: same endpoint returned 200 more than once (true wasted work)
    ok_counts = df[df["is200"]].groupby("key").size()
    ok_dup = ok_counts[ok_counts > 1]
    ok_wasted = int((ok_dup - 1).sum())
    out.append(
        f"- Endpoints that returned **200 more than once** (genuinely wasted successful work): "
        f"**{len(ok_dup):,}** endpoints, **{ok_wasted:,}** redundant successful fetches "
        f"(**{100*ok_wasted/int(df['is200'].sum()):.1f}%** of all successful calls).\n"
    )
    top = counts.head(12)
    out.append("\nTop repeated endpoints:\n\n| count | endpoint |\n|---|---|\n")
    for k, c in top.items():
        out.append(f"| {c} | `{k[:90]}` |\n")

    # ---- ceiling evidence: what rate did we sustain right before a freeze? ------
    out.append(section("6. Evidence on BnF's real ceiling"))
    # For each freeze episode, the # of 200s sent in the 60s window ending at the first freeze
    ceiling_samples = []
    for rows in episodes:
        sub = pd.DataFrame(rows)
        t0 = sub["ts"].min()
        window = g[(g["ts"] >= t0 - pd.Timedelta(seconds=60)) & (g["ts"] < t0) & (g["is200"])]
        ceiling_samples.append(len(window))
    cs = pd.Series(ceiling_samples)
    # Also: best sustained minute we ever achieved without a freeze in it
    freeze_minutes = set(freezes["minute"])
    clean = per_min[(~per_min["minute"].isin(freeze_minutes)) & (per_min["attempts"] > 0)]["ok"]
    out.append(
        f"- 200s sent in the 60s immediately *before* each freeze trigger: "
        f"median **{cs.median():.0f}**, mean **{cs.mean():.0f}**, max **{cs.max():.0f}** "
        f"(n={len(cs)} episodes) — this approximates the rate at which BnF tipped us over.\n"
        f"- Best clean minute (no freeze) achieved: **{clean.max():.0f} 200s/min**; "
        f"clean-minute mean **{clean.mean():.1f}/min**.\n"
        f"- Our cap is {GLOBAL_CAP}. BnF documented 300, observed real ceiling ~150–185.\n"
    )

    # ---- INTRA-MINUTE BURST SHAPE (the root cause) ----------------------------
    out.append(section("7. Intra-minute burst shape (root cause of the freezes)"))
    frozen_mins = set(freezes["minute"])
    gm = g[g["minute"].isin(frozen_mins)].copy()
    okm = gm[gm["is200"]]
    bins = pd.cut(okm["sec_of_min"], bins=[0, 10, 20, 30, 40, 50, 60])
    per_bin = (okm.groupby(bins, observed=True).size() / max(len(frozen_mins), 1)).round(1)
    last_ok = okm.groupby("minute")["sec_of_min"].max()
    out.append(
        "The token bucket (180/min) permits a **burst**: in a frozen minute the "
        "successful calls are front-loaded into the first ~27 s, then BnF 429-freezes "
        "us for the remainder. Avg successful calls per frozen-minute, by second-of-minute:\n\n"
        "| 0–10s | 10–20s | 20–30s | 30–40s | 40–50s | 50–60s |\n|---|---|---|---|---|---|\n"
        f"| {' | '.join(f'{v:.1f}' for v in per_bin.values)} |\n\n"
        f"- Last successful call of a frozen minute: median **:{last_ok.median():.0f}s** "
        f"→ we go silent at ~:27 because we're frozen, not because work ran out.\n"
        f"- ~**{per_bin.iloc[:3].sum():.0f}** of ~**{per_bin.sum():.0f}** calls/min are "
        f"crammed into the first 30 s. That instantaneous rate (~{per_bin.iloc[0]*6:.0f}/min "
        f"in the opening 10 s) is what trips BnF's fixed clock-minute window.\n"
    )

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5))
    centers = [5, 15, 25, 35, 45, 55]
    a1.bar(centers, per_bin.values, width=9, color="steelblue", alpha=0.85)
    a1.axvline(last_ok.median(), color="red", ls="--", label=f"median last-200 :{last_ok.median():.0f}s")
    a1.set_title("Successful calls per frozen-minute, by second-of-minute")
    a1.set_xlabel("second within clock-minute")
    a1.set_ylabel("avg successful calls")
    a1.legend()
    # cumulative within-minute emission vs an even-pacing reference
    cum = per_bin.cumsum()
    a2.step([0] + centers, [0] + list(cum.values), where="post", color="steelblue", lw=2, label="actual (bursty)")
    even_total = per_bin.sum()
    a2.plot([0, 60], [0, even_total], color="green", ls="--", label=f"even pacing ({even_total:.0f}/min)")
    a2.axvspan(last_ok.median(), 60, color="red", alpha=0.12, label="frozen / idle")
    a2.set_title("Cumulative emission within the minute: burst vs even pacing")
    a2.set_xlabel("second within clock-minute")
    a2.set_ylabel("cumulative successful calls")
    a2.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(HERE / "05_burst_shape.png", dpi=110)
    plt.close(fig)

    (HERE / "summary.md").write_text("".join(out), encoding="utf-8")
    print("".join(out))
    print(f"\nCharts written to {HERE}/*.png")


if __name__ == "__main__":
    main()
