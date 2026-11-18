import { Inject, Injectable } from '@nestjs/common';
import { rateLimitedError } from '../common/api-exception';

/** String tokens keep the test harness decoupled from implementation imports. */
export const RATE_LIMITER_TOKEN = 'RATE_LIMITER';
export const RATE_CLOCK_TOKEN = 'RATE_CLOCK';

/** Hard cap on distinct tracked keys. Reaching it fails closed instead of evicting an active key. */
export const MAX_RATE_KEYS = 1024;

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export const RATE_RULES = {
  register: { limit: 5, windowMs: FIFTEEN_MINUTES },
  loginIp: { limit: 30, windowMs: FIFTEEN_MINUTES },
  loginIdentifier: { limit: 10, windowMs: FIFTEEN_MINUTES },
  oauth: { limit: 20, windowMs: FIFTEEN_MINUTES },
  // Verification mail: per IP 10, per user 5, per normalized email 5, per hour.
  mailIpPerHour: { limit: 10, windowMs: ONE_HOUR },
  mailUserPerHour: { limit: 5, windowMs: ONE_HOUR },
  mailEmailPerHour: { limit: 5, windowMs: ONE_HOUR },
  // Submit / identity recheck per session within 15 minutes.
  sensitiveSession: { limit: 10, windowMs: FIFTEEN_MINUTES },
} as const;

export interface RateRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateClock {
  now(): number;
  advance(milliseconds: number): void;
}

@Injectable()
export class SystemRateClock implements RateClock {
  private offset = 0;

  now(): number {
    return Date.now() + this.offset;
  }

  advance(milliseconds: number): void {
    this.offset += milliseconds;
  }
}

/**
 * Single-instance, bounded, in-memory limiter. State resets on restart and is not
 * shared across processes; a multi-instance deployment must replace this with a
 * shared store before going online. Only a real socket IP is used here, never an
 * arbitrary X-Forwarded-For header.
 */
interface Bucket {
  /** Timestamps of admitted hits inside this bucket's own window. */
  hits: number[];
  /** This bucket expires at last-hit + its own windowMs, not a global 15 minutes. */
  expiresAt: number;
}

@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(@Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock) {}

  check(key: string, rule: RateRule): void {
    const now = this.clock.now();
    const cutoff = now - rule.windowMs;
    const existing = this.buckets.get(key);
    const hits = (existing?.hits ?? []).filter((timestamp) => timestamp > cutoff);

    if (hits.length >= rule.limit) {
      const oldest = hits[0] ?? now;
      throw rateLimitedError(Math.ceil((oldest + rule.windowMs - now) / 1000));
    }

    // A new key may only be admitted if there is a free slot. Reclaim buckets
    // whose OWN expiry has passed first; never drop a still-active bucket to make
    // room, otherwise an attacker could reset a limit by flooding distinct keys.
    // When all slots hold active traffic we fail closed with 429.
    if (!existing && this.buckets.size >= MAX_RATE_KEYS) {
      this.evictExpired(now);
      if (this.buckets.size >= MAX_RATE_KEYS) {
        throw rateLimitedError(Math.ceil(rule.windowMs / 1000));
      }
    }

    hits.push(now);
    this.buckets.set(key, { hits, expiresAt: now + rule.windowMs });
  }

  reset(): void {
    this.buckets.clear();
  }

  /** Removes only buckets whose own window has fully elapsed. */
  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }
}
