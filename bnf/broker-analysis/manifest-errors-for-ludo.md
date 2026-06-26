# BnF IIIF manifest errors — for Ludovic

**Endpoint:** `https://openapiproext.bnf.fr/iiif/presentation/v3/ark:/12148/<ARK>/manifest.json`
**Auth:** partner OAuth (client_credentials), our shared credential
**Context:** observed during two corpus-ingestion runs on 2026-06-25 (all times **UTC**).
Each ingest needs the IIIF manifest to learn a document's page/canvas count; when
the manifest fails, that document cannot be ingested at all.

Two distinct failure modes.

---

## 1. HTTP 500 — persistent, document-specific  ⚠️ (the actionable one)

Same documents fail on **every** attempt, hours apart. Response body is always:

```json
{"error":"An error occured while performing query. Please contact admin for more information."}
```

This looks like server-side manifest generation failing for these specific ARKs
(not rate-limiting, not auth — our credential succeeds on neighbouring docs in the
same second).

| ARK | manifest URL | 500s seen | window (UTC) |
|---|---|---|---|
| `ark:/12148/btv1b9068353m` | …/v3/ark:/12148/btv1b9068353m/manifest.json | 12 | 14:34:57 – 14:51:10 |
| `ark:/12148/btv1b90076098` | …/v3/ark:/12148/btv1b90076098/manifest.json | 8 | 14:41:34 – 14:47:55 |
| `ark:/12148/btv1b10026273b` | …/v3/ark:/12148/btv1b10026273b/manifest.json | 4 | 15:50:28 – 15:50:47 |

`btv1b9068353m` re-tested live at ~16:01 UTC → **still 500** (persistent).

---

## 2. HTTP 502 — transient, recovers on retry  ℹ️ (FYI)

Bad-gateway responses, **clustered at the start of a run** (a burst as many
fetches ramp up) and gone within seconds on retry — likely gateway/load, not
document-specific.

| ARK | 502s seen | window (UTC) | retest |
|---|---|---|---|
| `ark:/12148/bpt6k209864x` | 4 | 15:43:42 – 15:44:03 | now **200** ✅ |
| `ark:/12148/btv1b105600484` | 4 | 15:43:47 – 15:44:05 | recovers |
| `ark:/12148/btv1b10036419m` | 2 | 15:43:51 – 15:44:04 | recovers |

We retry 502s automatically, so they mostly self-heal — flagging only in case the
start-of-run 502 burst points at a gateway capacity limit worth knowing about.

---

## Summary for BnF

- **Please look at the HTTP 500s** on `btv1b9068353m`, `btv1b90076098`,
  `btv1b10026273b` — the manifest service returns *"An error occured while
  performing query. Please contact admin"* for these documents, consistently.
  These docs are un-ingestable for us until their manifests build.
- The **502s are transient** and we absorb them with retries — informational only.
- No 429s / no rate issues — our credential is within quota throughout.
