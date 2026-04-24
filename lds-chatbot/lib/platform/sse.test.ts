// Run with: node --test lib/platform/sse.test.ts
//
// Uses Node's built-in test runner + `node:test` mock helpers — no new deps.
// Node 24 strips TS types natively, so this file runs as-is.

import { test } from "node:test"
import assert from "node:assert/strict"

// PLATFORM_API_URL is read at module load; set it before the import.
process.env.PLATFORM_API_URL = "http://platform.test"

// Indirect so TS doesn't try to validate the extension; Node 24 strips
// types and resolves `.ts` natively at runtime.
const ssePath = "./sse.ts"
const { streamJobSSE } = (await import(ssePath)) as typeof import("./sse")

// ─── Helpers ──────────────────────────────────────────────────────────────

type FetchImpl = (input: unknown, init?: unknown) => Promise<Response>

const ORIGINAL_FETCH = globalThis.fetch

function installFetch(impl: FetchImpl): { calls: number } {
  const counter = { calls: 0 }
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    counter.calls++
    return impl(input, init)
  }) as typeof fetch
  return counter
}

function restoreFetch(): void {
  globalThis.fetch = ORIGINAL_FETCH
}

/**
 * Builds a Response whose body is a ReadableStream that emits the given
 * SSE event payloads (already-stringified JSON), then optionally throws.
 *
 * Uses `pull` so enqueued chunks are actually consumed by the reader
 * before any subsequent `error()` is delivered — `controller.error()`
 * called synchronously from `start()` after enqueue will surface on the
 * very first `read()`, swallowing the queued events.
 */
function makeStreamingResponse(
  events: string[],
  opts: { throwAfter?: Error } = {}
): Response {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i < events.length) {
        controller.enqueue(encoder.encode(`data: ${events[i]}\n\n`))
        i++
        return
      }
      if (opts.throwAfter) {
        controller.error(opts.throwAfter)
      } else {
        controller.close()
      }
    },
  })
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })
}

function jsonEvent(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
}

// ─── Tests ────────────────────────────────────────────────────────────────

test("clean completion — yields all events then returns, no retry", async (t) => {
  t.after(restoreFetch)

  const counter = installFetch(async () =>
    makeStreamingResponse([
      jsonEvent({ type: "init", status: "running" }),
      jsonEvent({ type: "update", status: "running" }),
    ])
  )

  const collected: Record<string, unknown>[] = []
  for await (const ev of streamJobSSE(42, "tok")) {
    collected.push(ev)
  }

  assert.equal(collected.length, 2)
  assert.equal(collected[0].type, "init")
  assert.equal(collected[1].type, "update")
  assert.equal(counter.calls, 1, "should not retry on clean close")
})

test("mid-stream socket error recovers on 2nd attempt", async (t) => {
  t.after(restoreFetch)

  let call = 0
  const counter = installFetch(async () => {
    call++
    if (call === 1) {
      const err = new Error("socket hang up") as Error & { code?: string }
      err.code = "UND_ERR_SOCKET"
      return makeStreamingResponse(
        [jsonEvent({ type: "init", status: "running" })],
        { throwAfter: err }
      )
    }
    return makeStreamingResponse([
      jsonEvent({ type: "update", status: "running" }),
      jsonEvent({ type: "done", status: "completed" }),
    ])
  })

  const start = Date.now()
  const collected: Record<string, unknown>[] = []
  for await (const ev of streamJobSSE(42, "tok")) {
    collected.push(ev)
  }
  const elapsed = Date.now() - start

  assert.equal(collected.length, 3, "should yield 1 from attempt 1 + 2 from attempt 2")
  assert.equal(collected[0].type, "init")
  assert.equal(collected[1].type, "update")
  assert.equal(collected[2].type, "done")
  assert.equal(counter.calls, 2)
  // First backoff is ~500ms ± 20% jitter → at least ~300ms in practice.
  assert.ok(elapsed >= 300, `expected backoff to be observed, got ${elapsed}ms`)
})

test("persistent failure exceeds retry cap", { timeout: 60_000 }, async (t) => {
  t.after(restoreFetch)

  const counter = installFetch(async () => {
    const err = new Error("ECONNRESET: socket reset") as Error & { code?: string }
    err.code = "ECONNRESET"
    throw err
  })

  let thrown: unknown = null
  try {
    for await (const _ev of streamJobSSE(42, "tok")) {
      // never reached
    }
  } catch (e) {
    thrown = e
  }

  assert.ok(thrown instanceof Error, "should throw an Error")
  assert.match((thrown as Error).message, /gave up after 5 attempts/)
  assert.equal(counter.calls, 5, "should attempt exactly MAX_ATTEMPTS times")
})

test("fatal 404 on initial connect — throws immediately, no retry", async (t) => {
  t.after(restoreFetch)

  const counter = installFetch(
    async () =>
      new Response("not found", {
        status: 404,
        statusText: "Not Found",
      })
  )

  let thrown: unknown = null
  try {
    for await (const _ev of streamJobSSE(42, "tok")) {
      // never reached
    }
  } catch (e) {
    thrown = e
  }

  assert.ok(thrown instanceof Error, "should throw")
  assert.match((thrown as Error).message, /404/)
  assert.equal(counter.calls, 1, "must not retry on 404")
})

test("caller break — generator cleans up, no further fetch calls", async (t) => {
  t.after(restoreFetch)

  const counter = installFetch(async () =>
    makeStreamingResponse([
      jsonEvent({ type: "init", status: "running" }),
      jsonEvent({ type: "update", status: "running" }),
      jsonEvent({ type: "done", status: "completed" }),
    ])
  )

  let yielded = 0
  for await (const _ev of streamJobSSE(42, "tok")) {
    yielded++
    break // consumer breaks after first event
  }

  assert.equal(yielded, 1)
  assert.equal(counter.calls, 1, "must not retry after consumer break")
})
