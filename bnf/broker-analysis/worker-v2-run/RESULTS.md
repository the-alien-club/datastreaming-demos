# Worker V2 — end-to-end live results (2026-06-26)

Worker V2 is the staged dataflow-pipeline rewrite of the ingest worker (design:
`ai-memories/tech/repos/bnf/worker-v2-pipeline/`). Code: `bnf/worker-v2/`. This is
the live proof it works end-to-end and that **the BnF broker's 300/min rate is the
binding ceiling — not the worker.**

## TL;DR

- **80/80 docs ingested end-to-end, 0 failures, state reconciles** (metadata →
  broker fetch → fan-in → assemble → embed (RunPod bge-m3, 1024-d) → register in
  the data cluster). Wall-clock **590 s (~9.8 min)** ⇒ **~8.1 docs/min ≈ 488
  docs/hour** for this corpus (text lane, 30-page cap).
- **Fetch rate pins at the broker ceiling**: sustained **~275/min** against the
  300/min cap, flat for 8 minutes, with the fetch gate saturated and a backlog that
  peaked at **1900 queued folios** — the worker wanted to go faster and the broker
  held it.
- **Proven the worker is NOT the bottleneck**: doubling worker fetch concurrency
  (12 → 24) left the served rate unchanged (**275 → 282/min**) and only increased
  per-request wait (`wait_ms` p50 122 → 148 ms). Extra parallelism just queues
  longer against the same token bucket. **To go faster we need the broker's
  per-IP cap raised (the 1000/min Ludo raise), not worker changes.**

## Runs

| Run | Docs | Result | Notes |
|---|---|---|---|
| 1-doc gate | 3 (text/vision/mistral) | text+vision **done**; mistral `bpt6k1294885` terminal-**failed** | manifest-500 ARK, isolated + failed cleanly (no retry storm) |
| 10-doc mixed | 10 | 7 done, 1 failed (manifest-500), 2 in-flight | 1 vision finishing + 1 mistral in its ~25-min Batch-API wait (off critical path) |
| **80-doc** | **80 text** | **80 done, 0 failed, reconciles** | the ceiling run below |

## 80-doc fetch trace (broker `/calls.csv`, run window)

2611 broker calls over a 553 s fetch window. Per-minute served rate:

```
min 0: 349   (token-bucket burst as the gate fills)
min 1: 266
min 2: 270
min 3: 283
min 4: 280
min 5: 286
min 6: 284
min 7: 268
min 8: 265
min 9:  60   (drain tail)
sustained mid-run: ~275/min   (cap = 300)
wait_ms  p50 122  p90 347  max 1329     ← requests blocking on broker rate tokens
notes: ok=2461, upstream_error=150       ← transient BnF 5xx, absorbed by retry; 0 doc failures
```

Chart: `run80-ceiling.png`. Raw: `run80-calls.csv`, `run80-rate-per-min.csv`,
`run80-ceiling-analysis.txt`.

## Ceiling proof — concurrency 12 vs 24 (same broker, same corpus shape)

| Worker fetch concurrency | Gate in-flight | Sustained served rate | wait_ms p50 |
|---|---|---|---|
| 12 | 12/12 (full) | **~275/min** | 122 ms |
| 24 | 24/24 (full) | **~282/min** | 148 ms |

Throughput is flat while wait climbs ⇒ the **broker's 300/min token bucket is the
ceiling**. The worker had a 1900-folio backlog it could not drain faster. Raw:
`conc24-calls.csv`.

## Why this is the win over V1

V1 (monolithic per-doc job) measured **40.6 docs/hour** with a sawtooth fetch rate
(convoy: all slots fetch, then all embed at fetch=0) and 16 Mistral docs each
holding a worker slot for 90–166 min on doomed manifest-500 retries (~40% of
capacity). V2:

- **Fetch is continuous** — a dedicated 300/min stage with a saturated gate, never
  idle (the flat ~275/min plateau vs V1's sawtooth).
- **Failures are isolated + cheap** — the manifest-500 ARKs terminal-fail in
  seconds at their own stage and never hold a fetch/embed slot (V1's killer).
- **Mistral's ~25-min batch waits live in a poll bucket**, not a worker slot.
- **Re-ingest is free** — S3-artifact skip-resume (verified live: a re-seed
  cache-hit through fetch/describe/embed, emitting under the new job's identity).

## Bugs found + fixed during the live gate (all with regression tests)

1. **Orphan-doc on transient exhaustion** — a transient error that exhausted
   pg-boss retries left the doc row non-terminal forever. Fix: metadata/manifest/
   register convert the last attempt to a terminal doc-fail.
2. **Outcome-cache replayed stale job identity** — the base artifact cache
   re-emitted a prior job's `docJobId` on re-ingest → fan-in hung. Fix: resume from
   the heavy S3 artifact, rebuild the emit from the incoming message's identity.
3. **Entry `name` = raw BnF title (>255)** — tripped the cluster→backend batch-sync
   422. Fix: entry `name = ark` (title kept in metadata).
4. **Dual-undici multipart hang (the register "timeout")** — worker-v2 imported
   worker/'s `ClusterHttp` (a *second* undici install) but built the `FormData`
   with worker-v2's undici. undici's `request` serializes a multipart body only
   when `body instanceof <its own> FormData`; the foreign instance failed the check
   so the body was silently dropped — the request never left the client and the
   data-api never saw it (looked like an infra hang; it was not). Fix: vendored a
   self-contained `ClusterHttp` in worker-v2 using its own undici end to end.

## Caveats (honest)

- The 80-doc corpus is **text lane, capped at 30 folios/doc**, and most ARKs were
  previously digitized so BnF served them fast. The `~488 docs/hour` figure is for
  this shape; a Mistral-heavy or large-doc corpus trails by the ~25-min batch tail
  and the per-doc folio count. The **fetch ceiling (~275–300/min)** is the
  shape-independent result.
- Sustained ~275 vs the 300 nominal cap = token-bucket + per-request latency
  overhead; the first minute burst to 349 (initial bucket capacity). Both are
  expected token-bucket behavior, not lost capacity.
- Run on the **dev egress IP (~300/min)**. The prod IP `51.15.218.49` is where the
  1000/min raise would apply — retune `BNF_GLOBAL_RPM` + concurrency there and the
  same pipeline scales with no code change.
