#!/usr/bin/env node
// Reproduce and dissect a streaming response without going through Next.js
// or the chat UI. Calls the platform's OpenAI Responses-API-compatible
// endpoint directly and prints, for every event:
//   - time since start
//   - SSE event type (e.g. response.output_text.delta)
//   - sequence_number (resume cursor)
//   - this event's JSON size
//   - cumulative bytes read from socket
//   - gap since previous event
//
// On termination it reports whether a clean response.completed arrived
// and, on error, the undici cause + code so we can distinguish a graceful
// close from a socket reset. Raw events are appended to
// /tmp/sse-debug-<ts>.ndjson for post-mortem.
//
// Usage:
//   PLATFORM_API_URL=https://api.alpha.alien.club \
//   ACCESS_TOKEN=<authentik-token> \
//   WORKFLOW_ID=62 \
//     node scripts/debug-sse.mjs "Draft an NDA between ACME and Beta"
//
// Resume test:
//   RESPONSE_ID=resp_abc... STARTING_AFTER=42 \
//     node scripts/debug-sse.mjs
//   (re-opens GET /agent/<WORKFLOW_ID>/responses/<RESPONSE_ID>?starting_after=<STARTING_AFTER>)
//
// ACCESS_TOKEN should be a valid Authentik OAuth access token issued for the
// user you want to call the platform as. Use `kubectl exec` into a dev pod
// and call `auth.api.getAccessToken()`, or grab one via your Authentik admin.
// Do NOT paste tokens into shared logs or chat — they grant full platform
// access for that user until expiry.

import { writeFileSync, appendFileSync } from "node:fs"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL
const ACCESS_TOKEN = process.env.ACCESS_TOKEN
const WORKFLOW_ID = process.env.WORKFLOW_ID ?? "62"
const PREVIOUS_RESPONSE_ID = process.env.PREVIOUS_RESPONSE_ID ?? null
const RESUME_RESPONSE_ID = process.env.RESPONSE_ID ?? null
const STARTING_AFTER = process.env.STARTING_AFTER ?? null
const PROMPT =
  process.argv.slice(2).join(" ") ||
  "Quelle est la durée légale de la période d'essai pour un cadre en convention SYNTEC ?"

if (!PLATFORM_API_URL || !ACCESS_TOKEN) {
  console.error("Missing env: PLATFORM_API_URL and ACCESS_TOKEN are required")
  process.exit(1)
}

const RAW_LOG = `/tmp/sse-debug-${Date.now()}.ndjson`
writeFileSync(RAW_LOG, "")

const t0 = Date.now()
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(2) + "s"
const fmtBytes = (n) => {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}
const pad = (s, w, right = false) => {
  s = String(s)
  return right ? s.padStart(w) : s.padEnd(w)
}

async function openStream() {
  if (RESUME_RESPONSE_ID) {
    const qs = STARTING_AFTER ? `?starting_after=${STARTING_AFTER}` : ""
    const url = `${PLATFORM_API_URL}/agent/${WORKFLOW_ID}/responses/${RESUME_RESPONSE_ID}${qs}`
    console.log(`[${elapsed()}] GET ${url}`)
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-oauth-access-token": ACCESS_TOKEN,
        Accept: "text/event-stream",
      },
    })
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "(no body)")
      throw new Error(`GET → ${res.status} ${res.statusText}: ${body}`)
    }
    return res
  }

  const url = `${PLATFORM_API_URL}/agent/${WORKFLOW_ID}/responses`
  console.log(`[${elapsed()}] POST ${url}`)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-oauth-access-token": ACCESS_TOKEN,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: "agent",
      input: PROMPT,
      stream: true,
      previous_response_id: PREVIOUS_RESPONSE_ID ?? undefined,
    }),
  })
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "(no body)")
    throw new Error(`POST → ${res.status} ${res.statusText}: ${body}`)
  }
  return res
}

function parseFrame(block) {
  let event = ""
  const dataLines = []
  for (const line of block.split("\n")) {
    if (line.startsWith(":") || line.length === 0) continue
    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""))
    }
  }
  if (!event || dataLines.length === 0) return null
  const dataStr = dataLines.join("\n")
  try {
    return { event, data: JSON.parse(dataStr), raw: dataStr }
  } catch {
    return { event, data: null, raw: dataStr }
  }
}

async function streamResponse() {
  const res = await openStream()
  console.log(`[${elapsed()}] SSE connected`)
  console.log(
    `${pad("time", 8)} | ${pad("event", 42)} | ${pad("seq", 5, true)} | ${pad("size", 8, true)} | ${pad("cum", 9, true)} | gap`,
  )
  console.log("".padEnd(96, "-"))

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let totalBytes = 0
  let events = 0
  let lastEventAt = Date.now()
  let terminalSeen = null
  let responseId = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      buf += dec.decode(value, { stream: true })

      const blocks = buf.split("\n\n")
      buf = blocks.pop() ?? ""

      for (const block of blocks) {
        if (!block.trim()) continue
        const parsed = parseFrame(block)
        if (!parsed) continue

        const now = Date.now()
        const gap = now - lastEventAt
        lastEventAt = now
        const eventSize = Buffer.byteLength(parsed.raw, "utf8")
        events++
        appendFileSync(RAW_LOG, JSON.stringify({ event: parsed.event, data: parsed.data }) + "\n")

        const seq = parsed.data?.sequence_number ?? "-"
        if (parsed.event === "response.created") responseId = parsed.data?.response?.id ?? null

        console.log(
          `${pad(elapsed(), 8)} | ${pad(parsed.event, 42)} | ${pad(seq, 5, true)} | ${pad(fmtBytes(eventSize), 8, true)} | ${pad(fmtBytes(totalBytes), 9, true)} | +${gap}ms`,
        )

        if (
          parsed.event === "response.completed" ||
          parsed.event === "response.failed" ||
          parsed.event === "response.incomplete"
        ) {
          terminalSeen = parsed.event
        }
      }
    }
  } catch (err) {
    printOutcome({ err, events, totalBytes, terminalSeen, responseId })
    process.exitCode = 1
    return
  }

  printOutcome({ err: null, events, totalBytes, terminalSeen, responseId })
}

function printOutcome({ err, events, totalBytes, terminalSeen, responseId }) {
  console.log("")
  if (err) {
    console.log(`[${elapsed()}] STREAM ERRORED`)
    console.log(`  message:    ${err?.message ?? err}`)
    console.log(`  cause.msg:  ${err?.cause?.message ?? "(none)"}`)
    console.log(`  cause.code: ${err?.cause?.code ?? "(none)"}`)
    if (err?.cause?.socket) {
      const s = err.cause.socket
      console.log(`  socket:     localPort=${s.localPort} remote=${s.remoteAddress}:${s.remotePort}`)
      console.log(`  bytesRead:  ${s.bytesRead} (${fmtBytes(s.bytesRead)})`)
      console.log(`  bytesWrit:  ${s.bytesWritten}`)
    }
  } else {
    console.log(`[${elapsed()}] stream ended cleanly`)
  }
  console.log(`  events:     ${events}`)
  console.log(`  bytesTotal: ${fmtBytes(totalBytes)} (${totalBytes})`)
  console.log(`  terminal:   ${terminalSeen ?? "<none>"}`)
  console.log(`  responseId: ${responseId ?? "<none>"}`)
  console.log(`  raw log:    ${RAW_LOG}`)
}

async function main() {
  try {
    await streamResponse()
  } catch (err) {
    console.error("fatal:", err)
    process.exit(1)
  }
}

main()
