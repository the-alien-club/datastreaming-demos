/**
 * Per-host politeness gate — a lazily-populated Map<host, RateLimiter> so the PDF
 * fetch stage never hammers a single publisher/repository host, even when the
 * stage's own concurrency is high across many hosts. Each host gets its own token
 * bucket (default ~1 request/second, burst 1). A single shared Semaphore bounds
 * concurrency PER host to 1 in-flight request.
 *
 * Pure pacing, no I/O. The stage calls `run(host, fn)` which acquires the host's
 * token + its 1-slot semaphore, runs `fn`, and always releases.
 */
import { RateLimiter } from "./rate.js";
import { Semaphore } from "./semaphore.js";

export interface HostGateOpts {
  /** Requests per minute per host (default 60 ≈ 1 rps). */
  ratePerMin?: number;
  /** Injectable clock for the underlying limiters (tests). */
  now?: () => number;
}

export class HostGate {
  private readonly gates = new Map<string, { rate: RateLimiter; sem: Semaphore }>();
  private readonly ratePerMin: number;
  private readonly now: (() => number) | undefined;

  constructor(opts: HostGateOpts = {}) {
    this.ratePerMin = opts.ratePerMin ?? 60;
    this.now = opts.now;
  }

  private gate(host: string): { rate: RateLimiter; sem: Semaphore } {
    let g = this.gates.get(host);
    if (!g) {
      g = {
        rate: new RateLimiter({
          ratePerMin: this.ratePerMin,
          burst: 1,
          ...(this.now ? { now: this.now } : {}),
        }),
        sem: new Semaphore(1),
      };
      this.gates.set(host, g);
    }
    return g;
  }

  /** Run `fn` under the host's token bucket + 1-slot concurrency gate. */
  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const g = this.gate(host);
    return g.sem.run(async () => {
      await g.rate.acquire();
      return fn();
    });
  }

  /** Release all limiters (shutdown). */
  stop(): void {
    for (const g of this.gates.values()) g.rate.stop();
    this.gates.clear();
  }
}
