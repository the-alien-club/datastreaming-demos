"""Analysis of the prod 150-document run (2026-06-25 14:01–14:51 UTC).

Unlike the rate-limit runs, this one has ZERO 429s — the story is the upstream
error rate (HTTP 400/500) and an observability gap (errors logged note=ok).
Produces a throughput chart and an error-breakdown chart (seaborn).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

HERE = Path(__file__).resolve().parent

_p = argparse.ArgumentParser()
_p.add_argument("--csv", default="prod-150doc-run-2026-06-25.csv", help="CSV filename (under broker-analysis/)")
_p.add_argument("--prefix", default="prod_150doc", help="output filename prefix")
ARGS, _ = _p.parse_known_args()
CSV = HERE / ARGS.csv

sns.set_theme(style="whitegrid", context="talk", font_scale=0.9)
ALIEN = "#2563eb"
BNF_RED = "#c1121f"
GREEN = "#059669"
AMBER = "#d97706"


def kind(p: str) -> str:
    if "alto.xml" in p:
        return "alto"
    if "/iiif/image/" in p:
        return "image"
    if "manifest.json" in p:
        return "manifest"
    if "SRU" in p:
        return "sru"
    if "OAIHandler" in p:
        return "oai"
    return "other"


def main() -> None:
    df = pd.read_csv(CSV)
    df["ts"] = pd.to_datetime(df.timestamp_iso, utc=True)
    df["minute"] = df.ts.dt.floor("min")
    df["kind"] = df.path.map(kind)
    df["ark"] = df.path.str.extract(r"(ark:/12148/[^/\"]+)")
    df["ok"] = df.status == 200
    span = (df.ts.max() - df.ts.min()).total_seconds() / 60

    n = len(df)
    err = df[df.status != 200]
    n_429 = int((df.status == 429).sum())
    ok_paths = set(df[df.ok].path)

    print(f"================ PROD RUN — {ARGS.csv} ================")
    print(f"Window: {df.ts.min():%Y-%m-%d %H:%M} – {df.ts.max():%H:%M} UTC ({span:.0f} min)")
    counts = df.status.value_counts().sort_index()
    print("Calls: " + " | ".join(f"{s}: {c:,}" for s, c in counts.items()))
    print(f"Upstream error rate: {100*len(err)/n:.1f}%  |  rate-limiting (429): "
          f"{n_429 if n_429 else 'none'}")
    print(f"Mean throughput: {df.ok.sum()/span:.0f} successful/min")

    # generic per-status-class breakdown: kinds, docs, retry & recovery
    for st in sorted(s for s in err.status.unique()):
        sub = err[err.status == st]
        sub_paths = set(sub.path)
        recovered = len(sub_paths & ok_paths)
        kinds = dict(sub.kind.value_counts())
        burst = sub.minute.value_counts()
        print(f"\nHTTP {st}: {len(sub)} calls | kinds={kinds} | "
              f"{sub.ark.nunique()} doc(s) | {len(sub_paths)} distinct path(s), "
              f"~{len(sub)/max(len(sub_paths),1):.1f} attempts/path")
        print(f"  recovered to 200 later: {recovered}/{len(sub_paths)} paths "
              f"({len(sub_paths)-recovered} never recovered)")
        if len(burst):
            print(f"  time-concentration: {burst.iloc[0]}/{len(sub)} in busiest minute "
                  f"({burst.index[0]:%H:%M} UTC)")
        print(f"  top docs: {sub.ark.value_counts().head(3).to_dict()}")

    bad_tag = err[err.note != "upstream_error"]
    print(f"\nObservability: {len(err)} errors → "
          f"{dict(err.note.value_counts(dropna=False))}. "
          + (f"{len(bad_tag)} still mis-tagged note=ok ({dict(bad_tag.status.value_counts())})."
             if len(bad_tag) else "all errors correctly tagged."))
    print("==================================================")

    # ---- CHART 1: throughput over time, stacked by kind ----------------------
    piv = (
        df[df.ok].groupby(["minute", "kind"]).size().unstack(fill_value=0)
        .reindex(pd.date_range(df.minute.min(), df.minute.max(), freq="min"), fill_value=0)
    )
    order = [k for k in ["alto", "image", "manifest", "oai"] if k in piv.columns]
    fig, ax = plt.subplots(figsize=(13, 6))
    palette = {"alto": ALIEN, "image": GREEN, "manifest": AMBER, "oai": "#6b7280"}
    ax.stackplot(piv.index, *[piv[k] for k in order], labels=order,
                 colors=[palette[k] for k in order], alpha=0.85)
    rl = "no rate-limiting (0×429)" if not n_429 else f"{n_429}×429"
    ax.set_title(f"Successful throughput per minute by request type — {df.ok.sum()/span:.0f}/min, {rl}",
                 fontsize=13)
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("successful calls / min")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
    ax.legend(loc="upper right", fontsize=10)
    sns.despine()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(HERE / f"{ARGS.prefix}_01_throughput.png", dpi=140)
    plt.close(fig)

    # ---- CHART 2: outcome by request type ------------------------------------
    ct = (
        df.assign(outcome=df.status.map(lambda s: "200 OK" if s == 200 else f"{s} ERROR"))
        .groupby(["kind", "outcome"]).size().reset_index(name="calls")
    )
    err_colors = {400: BNF_RED, 500: AMBER, 502: "#7c3aed", 404: "#db2777",
                  429: "#0891b2", 403: "#dc2626", 401: "#ca8a04"}
    fallback = ["#475569", "#9333ea", "#0d9488", "#e11d48"]
    pal = {"200 OK": GREEN}
    for i, s in enumerate(sorted(err.status.unique())):
        pal[f"{s} ERROR"] = err_colors.get(s, fallback[i % len(fallback)])
    hue_order = ["200 OK"] + [f"{s} ERROR" for s in sorted(err.status.unique())]
    fig, ax = plt.subplots(figsize=(11, 6))
    sns.barplot(data=ct, x="kind", y="calls", hue="outcome", palette=pal,
                hue_order=hue_order, order=["alto", "image", "manifest", "oai"], ax=ax)
    err_summary = ", ".join(f"{c}×{s}" for s, c in err.status.value_counts().sort_index().items())
    ax.set_title(f"Outcome by request type — {100*len(err)/n:.1f}% errors ({err_summary})", fontsize=12)
    ax.set_xlabel("request type")
    ax.set_ylabel("number of calls")
    ax.legend(title="", fontsize=10)
    for c in ax.containers:
        ax.bar_label(c, fmt=lambda v: f"{int(v)}" if v else "", fontsize=9, padding=2)
    sns.despine()
    fig.tight_layout()
    fig.savefig(HERE / f"{ARGS.prefix}_02_errors.png", dpi=140)
    plt.close(fig)

    print(f"\nCharts: {ARGS.prefix}_01_throughput.png, {ARGS.prefix}_02_errors.png")


if __name__ == "__main__":
    main()
