# BnF Broker Call-Log Analysis
- Rows: **27,778** calls
- Window: **2026-06-24 22:20:25 → 07:53:35 UTC** (9.55 h, 573 min wall-clock)
- Hosts: openapiproext.bnf.fr (25,099), oai.bnf.fr (2,651), catalogue.bnf.fr (21), data.bnf.fr (7)
- Buckets: global (24,987), external (2,679), manifest (112)
- Status: 200 (25,079), 429 (2,434), 502 (150), 500 (115)
- Notes: ok (25,194), shed (2,025), freeze (409), upstream_error (150)

## 1. Throughput
- Global successful (200) calls: **22,400**
- Active global minutes (≥1 attempt): **226**
- Mean achieved global rate (active minutes): **99.1/min** (cap 180)
- Median: **101/min**; p90 **103**; p95 **103**; max **125/min**
- Minutes at ≥95% of cap (≥171/min): **0** (0% of active minutes)
- Minutes at ≥90% of cap (≥162/min): **0**
- Utilisation = mean_achieved / cap = **55%**
- external bucket (cap 120): mean **33.1/min**, max **120/min** over 81 active min

## 2. 429 Analysis (shed vs freeze)
- Global attempts: **24,987**
- 429s total on global: **2,431** (**9.7%** of global attempts)
  - shed (self-throttle, not sent to BnF): **2,023** (8.1%)
  - freeze (real BnF 429): **408** (1.6%)
- shed:freeze ratio = **5.0 : 1** — the overwhelming majority of 429s are self-inflicted by our own bucket, not BnF.
- Freeze time-of-minute offset: mean **31.8s**, median **27.7s**, p10 **27.4s**, p90 **43.6s**, min **27.0s**, max **60.0s**
- Distinct clock-minutes containing ≥1 freeze: **209**
- First-freeze-of-minute offset: mean **31.8s**, median **27.7s** (this is when BnF's window actually tips over)

## 3. Freeze Cost (wall-clock stalled)
- **Caveat:** global (partner-API) traffic is one ingest burst **22:20–02:05** (~225 min). The 02:05–07:53 tail is low-rate ungated metadata only. Freeze cost is measured against the **active ingest window**, not the full run.
- Freeze episodes (consecutive freeze runs, gap>90s splits): **17**
- Distinct clock-minutes with ≥1 freeze: **209** of **226** active minutes = **92% of every ingest minute frozen**
- Idle time lost = Σ(60s − first-freeze-offset) per frozen minute: **98.3 min** = **43.7% of the 225-min ingest window** sat frozen and idle
- Per-freeze advertised Retry-After stall: median **32s**, max **33s** (the 198-min episode-sum OVERSTATES: BnF pushes the reopen later each time we re-probe during a freeze).

Freeze episodes:

| start | advertised reopen | stall (s) | # freezes |
|---|---|---|---|
| 22:20:27 | 22:23:00 | 152 | 6 |
| 22:24:28 | 22:28:00 | 211 | 7 |
| 22:28:59 | 22:39:00 | 600 | 21 |
| 22:40:46 | 22:51:00 | 613 | 22 |
| 22:52:27 | 23:00:00 | 452 | 16 |
| 23:01:36 | 23:26:00 | 1464 | 50 |
| 23:27:34 | 00:23:00 | 3326 | 109 |
| 00:24:33 | 00:46:00 | 1286 | 43 |
| 00:47:53 | 00:54:00 | 366 | 14 |
| 00:56:33 | 01:00:00 | 206 | 8 |
| 01:01:34 | 01:03:00 | 86 | 4 |
| 01:04:35 | 01:09:00 | 265 | 10 |
| 01:10:42 | 01:29:00 | 1098 | 35 |
| 01:30:29 | 01:43:00 | 751 | 26 |
| 01:44:34 | 01:55:00 | 625 | 21 |
| 01:56:33 | 02:00:00 | 206 | 8 |
| 02:01:40 | 02:05:00 | 199 | 8 |

## 4. Wait-time distribution (rate-limit latency added)
| bucket | n | mean | p50 | p90 | p95 | p99 | max | % with wait>0 |
|---|---|---|---|---|---|---|---|---|
| global | 24,987 | 640 | 574 | 1260 | 1270 | 2585 | 10217 | 72% |
| manifest | 112 | 494 | 0 | 1162 | 1902 | 4213 | 9581 | 40% |
| external | 2,679 | 1864 | 1974 | 1976 | 1976 | 2217 | 2976 | 94% |

Upstream fetch latency (sent calls only): median **73ms**, p95 **243ms**, max **3233ms**.

## 5. Redundancy (repeated host,path = retry waste proxy)
- Distinct (host,path) endpoints: **22,916**
- Endpoints fetched more than once: **1,089** (4.8% of distinct endpoints)
- Redundant calls (total calls − distinct endpoints): **4,862** (**17.5%** of all calls)
- Max repeats on a single endpoint: **2651**
- Of the 5,951 calls hitting a repeated endpoint, **2,699** were non-200 (45%) — these are the retries after shed/freeze/5xx.
- Endpoints that returned **200 more than once** (genuinely wasted successful work): **3** endpoints, **2,676** redundant successful fetches (**10.7%** of all successful calls).

Top repeated endpoints:

| count | endpoint |
|---|---|
| 2651 | `oai.bnf.fr /oai2/OAIHandler` |
| 36 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k1321420w/manifest.json` |
| 28 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k1321472m/manifest.json` |
| 24 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k1321271h/manifest.json` |
| 24 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k1321229x/manifest.json` |
| 21 | `catalogue.bnf.fr /api/SRU` |
| 7 | `data.bnf.fr /sparql` |
| 3 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k48102547/f177/alto.xml` |
| 3 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k3365925f/f48/alto.xml` |
| 3 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k33555622/f52/alto.xml` |
| 3 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k33555622/f51/alto.xml` |
| 3 | `openapiproext.bnf.fr /iiif/presentation/v3/ark:/12148/bpt6k3365925f/f49/alto.xml` |

## 6. Evidence on BnF's real ceiling
- 200s sent in the 60s immediately *before* each freeze trigger: median **109**, mean **126**, max **191** (n=17 episodes) — this approximates the rate at which BnF tipped us over.
- Best clean minute (no freeze) achieved: **125 200s/min**; clean-minute mean **77.3/min**.
- Our cap is 180. BnF documented 300, observed real ceiling ~150–185.

## 7. Intra-minute burst shape (root cause of the freezes)
The token bucket (180/min) permits a **burst**: in a frozen minute the successful calls are front-loaded into the first ~27 s, then BnF 429-freezes us for the remainder. Avg successful calls per frozen-minute, by second-of-minute:

| 0–10s | 10–20s | 20–30s | 30–40s | 40–50s | 50–60s |
|---|---|---|---|---|---|
| 44.2 | 26.6 | 21.5 | 5.5 | 2.3 | 0.8 |

- Last successful call of a frozen minute: median **:27s** → we go silent at ~:27 because we're frozen, not because work ran out.
- ~**92** of ~**101** calls/min are crammed into the first 30 s. That instantaneous rate (~265/min in the opening 10 s) is what trips BnF's fixed clock-minute window.
