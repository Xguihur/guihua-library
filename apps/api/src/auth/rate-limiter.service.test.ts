import { describe, expect, it } from 'vitest';
import { rateLimitedError } from '../common/api-exception';
import { RateLimiterService, RATE_RULES, SystemRateClock, MAX_RATE_KEYS } from './rate-limiter.service';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

describe('bounded in-memory rate limiter', () => {
  it('allows the configured limit then returns 429 with Retry-After, reset by a controllable clock', () => {
    const clock = new SystemRateClock();
    const limiter = new RateLimiterService(clock);
    const rule = RATE_RULES.register;

    for (let i = 0; i < rule.limit; i += 1) expect(() => limiter.check('ip:a', rule)).not.toThrow();

    let caught: ReturnType<typeof rateLimitedError> | undefined;
    try {
      limiter.check('ip:a', rule);
    } catch (error) {
      caught = error as ReturnType<typeof rateLimitedError>;
    }
    expect(caught?.getStatus()).toBe(429);
    expect(caught?.code).toBe('RATE_LIMITED');
    expect(Number(caught?.headers['Retry-After'])).toBeGreaterThan(0);

    clock.advance(FIFTEEN_MINUTES + 1);
    expect(() => limiter.check('ip:a', rule)).not.toThrow();

    limiter.reset();
    for (let i = 0; i < rule.limit; i += 1) expect(() => limiter.check('ip:a', rule)).not.toThrow();
  });

  it('keeps independent keys isolated', () => {
    const limiter = new RateLimiterService(new SystemRateClock());
    for (let i = 0; i < RATE_RULES.register.limit; i += 1) limiter.check('ip:a', RATE_RULES.register);
    expect(() => limiter.check('ip:b', RATE_RULES.register)).not.toThrow();
  });

  it('is truly capacity-bounded and never evicts an active key to admit a new one', () => {
    const clock = new SystemRateClock();
    const limiter = new RateLimiterService(clock);
    const rule = { limit: 5, windowMs: FIFTEEN_MINUTES };

    // Use up most of one active key's allowance first.
    for (let i = 0; i < rule.limit - 1; i += 1) limiter.check('active', rule);
    // Fill every remaining slot with distinct active keys.
    for (let i = 0; i < MAX_RATE_KEYS - 1; i += 1) limiter.check(`filler-${i}`, rule);

    // A brand-new key cannot be admitted by evicting an active one: fail closed.
    let rejected = false;
    try {
      limiter.check('overflow', rule);
    } catch (error) {
      rejected = true;
      expect((error as { getStatus(): number }).getStatus()).toBe(429);
    }
    expect(rejected).toBe(true);

    // The original active key kept its full history, so its limit still holds.
    expect(() => limiter.check('active', rule)).not.toThrow();
    expect(() => limiter.check('active', rule)).toThrow();
  });

  it('reclaims capacity once existing entries expire', () => {
    const clock = new SystemRateClock();
    const limiter = new RateLimiterService(clock);
    const rule = { limit: 5, windowMs: FIFTEEN_MINUTES };

    for (let i = 0; i < MAX_RATE_KEYS; i += 1) limiter.check(`old-${i}`, rule);
    expect(() => limiter.check('new', rule)).toThrow();

    clock.advance(FIFTEEN_MINUTES + 1);
    expect(() => limiter.check('new', rule)).not.toThrow();
  });
});
