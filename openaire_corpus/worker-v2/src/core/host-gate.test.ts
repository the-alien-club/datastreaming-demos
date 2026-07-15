/**
 * HostGate tests — per-host serialisation (1 concurrent per host) and that
 * different hosts run independently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { HostGate } from "./host-gate.js";

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

test("serialises calls to the same host (max 1 in-flight)", async () => {
  // High rate so the token bucket never gates — we're testing the concurrency slot.
  const gate = new HostGate({ ratePerMin: 6_000_000 });
  let inFlight = 0;
  let maxInFlight = 0;
  const body = async (): Promise<void> => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick();
    inFlight--;
  };

  await Promise.all([gate.run("h", body), gate.run("h", body), gate.run("h", body)]);
  assert.equal(maxInFlight, 1, "same host never runs two calls at once");
  gate.stop();
});

test("different hosts run concurrently", async () => {
  const gate = new HostGate({ ratePerMin: 6_000_000 });
  let inFlight = 0;
  let maxInFlight = 0;
  const body = async (): Promise<void> => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick();
    inFlight--;
  };

  await Promise.all([gate.run("a", body), gate.run("b", body), gate.run("c", body)]);
  assert.ok(maxInFlight >= 2, "distinct hosts overlap");
  gate.stop();
});
