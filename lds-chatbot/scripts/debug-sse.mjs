#!/usr/bin/env node
// Reproduce and dissect the "SSE terminated" failure without going through
// Next.js or the chat UI. Calls the platform directly and prints, for every
// event:
//   - time since start
//   - event type / status
//   - total chunk count in result.stream.agent.chunks (and delta since last)
//   - THIS event's JSON size
//   - cumulative bytes read from socket
//   - gap since previous event
//
// On termination it reports whether a clean "done" arrived and, on error, the
// undici cause + code so we can distinguish a graceful close from a socket
// reset. Raw events are appended to /tmp/sse-debug-<ts>.ndjson for post-mortem.
//
// Usage:
//   PLATFORM_API_URL=https://api.alpha.alien.club \
//   ACCESS_TOKEN=<authentik-token> \
//   WORKFLOW_ID=62 \
//     node scripts/debug-sse.mjs "Draft an NDA between ACME and Beta"
//
// Where to get ACCESS_TOKEN:
//   In the browser on the running chatbot, DevTools → Network → any /api/chat
//   request → Request Headers. The Next.js route reads the token from your
//   Authentik session; the simplest grab is to add a temporary
//   `console.log(accessToken)` in app/api/chat/route.ts and send one message,
//   then paste it here. (Revert the log after.)

import { writeFileSync, appendFileSync } from "node:fs"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL
const ACCESS_TOKEN = process.env.ACCESS_TOKEN
const WORKFLOW_ID = process.env.WORKFLOW_ID ?? "62"
const SESSION_ID = process.env.SESSION_ID ?? null
const PROMPT =
  process.argv.slice(2).join(" ") ||
  "Draft a standard mutual NDA between ACME Corp and Beta LLC, include typical carve-outs and a 3-year term."

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

async function runJob() {
  const url = `${PLATFORM_API_URL}/workflows/${WORKFLOW_ID}/run`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-oauth-access-token": ACCESS_TOKEN,
    },
    body: JSON.stringify({
      input: { user_prompt: PROMPT, session_id: SESSION_ID },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)")
    throw new Error(`POST /workflows/${WORKFLOW_ID}/run → ${res.status} ${res.statusText}: ${body}`)
  }
  const json = await res.json()
  const id = json?.data?.id ?? json?.id
  if (typeof id !== "number") throw new Error(`bad run response: ${JSON.stringify(json).slice(0, 200)}`)
  return id
}

async function streamJob(jobId) {
  console.log(`[${elapsed()}] opening SSE for job ${jobId}`)
  const res = await fetch(`${PLATFORM_API_URL}/jobs/${jobId}/stream`, {
    method: "GET",
    headers: {
      "x-oauth-access-token": ACCESS_TOKEN,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "(no body)")
    throw new Error(`GET /jobs/${jobId}/stream → ${res.status} ${res.statusText}: ${body}`)
  }

  console.log(`[${elapsed()}] SSE connected`)
  console.log(
    `${pad("time", 8)} | ${pad("type", 8)} | ${pad("status", 11)} | ${pad("chunks", 7, true)} | ${pad("Δ", 4, true)} | ${pad("event", 8, true)} | ${pad("cum", 9, true)} | gap`
  )
  console.log("".padEnd(90, "-"))

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let totalBytes = 0
  let events = 0
  let lastEventAt = Date.now()
  let lastChunks = 0
  let doneSeen = false
  let lastStatus = null

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
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "))
        if (!dataLine) continue
        const jsonStr = dataLine.slice(6).trim()
        if (!jsonStr || jsonStr === "[DONE]") continue

        const now = Date.now()
        const gap = now - lastEventAt
        lastEventAt = now
        const eventSize = Buffer.byteLength(jsonStr, "utf8")
        events++
        appendFileSync(RAW_LOG, jsonStr + "\n")

        let parsed
        try {
          parsed = JSON.parse(jsonStr)
        } catch {
          console.log(`${elapsed()} | <unparseable> ${fmtBytes(eventSize)}`)
          continue
        }

        const type = parsed.type ?? "?"
        const status = parsed.status ?? "?"
        lastStatus = status
        const chunks = parsed.result?.stream?.agent?.chunks?.length ?? 0
        const delta = chunks - lastChunks
        lastChunks = chunks

        console.log(
          `${pad(elapsed(), 8)} | ${pad(type, 8)} | ${pad(status, 11)} | ${pad(chunks, 7, true)} | ${pad(delta ? "+" + delta : "", 4, true)} | ${pad(fmtBytes(eventSize), 8, true)} | ${pad(fmtBytes(totalBytes), 9, true)} | +${gap}ms`
        )

        if (type === "done") doneSeen = true
      }
    }
  } catch (err) {
    printOutcome({ err, events, totalBytes, lastChunks, lastStatus, doneSeen })
    process.exitCode = 1
    return
  }

  printOutcome({ err: null, events, totalBytes, lastChunks, lastStatus, doneSeen })
}

function printOutcome({ err, events, totalBytes, lastChunks, lastStatus, doneSeen }) {
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
  console.log(`  chunks:     ${lastChunks}`)
  console.log(`  lastStatus: ${lastStatus}`)
  console.log(`  doneSeen:   ${doneSeen}`)
  console.log(`  raw log:    ${RAW_LOG}`)
}

async function main() {
  try {
    const jobId = await runJob()
    console.log(`[${elapsed()}] job started: ${jobId}`)
    await streamJob(jobId)
  } catch (err) {
    console.error("fatal:", err)
    process.exit(1)
  }
}

main()
