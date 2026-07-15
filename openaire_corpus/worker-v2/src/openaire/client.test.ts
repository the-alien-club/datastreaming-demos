/**
 * OpenAIRE client tests with an injected fetch — no network. Covers the URL shape,
 * 404 → permanent, 5xx → transient-with-retry, response unwrapping, and the token
 * header.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { LiveOpenAireClient } from "./client.js";
import { PermanentOpenAireError, TransientOpenAireError } from "./errors.js";

function fetchStub(responses: Array<() => Response>): {
  fn: typeof fetch;
  urls: string[];
  headers: Array<Record<string, string>>;
} {
  const urls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  let i = 0;
  const fn = (async (url, init) => {
    urls.push(String(url));
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    const make = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return make();
  }) as typeof fetch;
  return { fn, urls, headers };
}

test("getById hits <base>/researchProducts/<id>?format=json and returns the product", async () => {
  const stub = fetchStub([() => new Response(JSON.stringify({ id: "oa::1", mainTitle: "T" }), { status: 200 })]);
  const client = new LiveOpenAireClient({ baseUrl: "https://api.test/graph/v1", fetchFn: stub.fn });
  const product = await client.getById("oa::1");
  assert.equal(product.mainTitle, "T");
  assert.equal(stub.urls[0], "https://api.test/graph/v1/researchProducts/oa%3A%3A1?format=json");
});

test("404 → PermanentOpenAireError (never retried)", async () => {
  const stub = fetchStub([() => new Response("not found", { status: 404 })]);
  const client = new LiveOpenAireClient({ baseUrl: "https://api.test", fetchFn: stub.fn, attempts: 3 });
  await assert.rejects(() => client.getById("gone"), PermanentOpenAireError);
  assert.equal(stub.urls.length, 1, "permanent → exactly one call");
});

test("5xx → transient, retried up to attempts", async () => {
  const stub = fetchStub([() => new Response("boom", { status: 503 })]);
  const client = new LiveOpenAireClient({ baseUrl: "https://api.test", fetchFn: stub.fn, attempts: 3 });
  await assert.rejects(() => client.getById("x"), TransientOpenAireError);
  assert.equal(stub.urls.length, 3, "retried up to attempts");
});

test("unwraps { results: [product] }", async () => {
  const stub = fetchStub([
    () => new Response(JSON.stringify({ results: [{ id: "oa::2", mainTitle: "Wrapped" }] }), { status: 200 }),
  ]);
  const client = new LiveOpenAireClient({ baseUrl: "https://api.test", fetchFn: stub.fn });
  const product = await client.getById("oa::2");
  assert.equal(product.mainTitle, "Wrapped");
});

test("attaches the bearer token when configured", async () => {
  const stub = fetchStub([() => new Response(JSON.stringify({ id: "oa::3" }), { status: 200 })]);
  const client = new LiveOpenAireClient({ baseUrl: "https://api.test", token: "tok", fetchFn: stub.fn });
  await client.getById("oa::3");
  assert.equal(stub.headers[0]!.authorization, "Bearer tok");
});
