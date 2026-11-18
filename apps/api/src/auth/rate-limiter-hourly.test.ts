import { describe, expect, it } from 'vitest';
import { RateLimiterService, RATE_RULES, SystemRateClock, MAX_RATE_KEYS } from './rate-limiter.service';

const HOUR = 60 * 60 * 1000;

/**
 * The hourly mail buckets must keep their OWN expiry. A 15-minute eviction
 * sweep must not treat an hour-long bucket as reclaimable: doing so both resets
 * the hourly limit and lets an attacker free capacity by waiting 15 minutes.
 */
describe('hourly buckets keep their own expiry (mail rate limiting)', () => {
  it('does not reclaim an hourly bucket after only 15 minutes', () => {
    const clock = new SystemRateClock();
    const limiter = new RateLimiterService(clock);
    const hourly = RATE_RULES.mailIpPerHour;
    expect(hourly.windowMs).toBe(HOUR);

    // Fill the whole capacity with still-active hourly buckets.
    for (let i = 0; i < MAX_RATE_KEYS; i += 1) limiter.check(`mail-${i}`, hourly);
    expect(() => limiter.check('new', hourly)).toThrow();

    // 16 minutes later the hourly buckets are still active: no capacity is freed.
    clock.advance(16 * 60 * 1000);
    let rejected = false;
    try {
      limiter.check('new', hourly);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);

    // Their history is intact: one hit already used, so only limit-1 remain.
    for (let i = 0; i < hourly.limit - 1; i += 1) limiter.check('mail-0', hourly);
    expect(() => limiter.check('mail-0', hourly)).toThrow();

    // Only after a full hour do the buckets expire and capacity is reclaimed.
    clock.advance(HOUR - 16 * 60 * 1000 + 1);
    expect(() => limiter.check('new', hourly)).not.toThrow();
  });

  it('applies the hourly limit to a single key regardless of 15-minute sweeps', () => {
    const clock = new SystemRateClock();
    const limiter = new RateLimiterService(clock);
    const hourly = RATE_RULES.mailUserPerHour;
    for (let i = 0; i < hourly.limit; i += 1) limiter.check('user-1', hourly);
    clock.advance(20 * 60 * 1000);
    expect(() => limiter.check('user-1', hourly)).toThrow();
    clock.advance(HOUR - 20 * 60 * 1000 + 1);
    expect(() => limiter.check('user-1', hourly)).not.toThrow();
  });
});
