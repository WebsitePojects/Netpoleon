import { AppError } from '../errors.js';

interface Window {
  count: number;
  resetAt: number;
}

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

// Bounds memory if someone sprays requests from many addresses: past this many tracked keys,
// expired windows are swept before a new key is added.
const SWEEP_AT = 10_000;

/**
 * Fixed-window counters held in this process. Correct for one API instance, which is the
 * deployment; running two instances would need a shared store (foundation spec, known limits).
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Counts one attempt against `key`; throws 429 with Retry-After once the limit is passed. */
  consume(key: string, limit: Limit): void {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      if (this.windows.size >= SWEEP_AT) this.sweep(now);
      window = { count: 0, resetAt: now + limit.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count > limit.max) {
      const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
      throw new AppError(
        429,
        'rate_limited',
        'Too many attempts. Wait a few minutes and try again.',
        `Retry after ${retryAfter} seconds`,
        { 'retry-after': String(retryAfter) },
      );
    }
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
