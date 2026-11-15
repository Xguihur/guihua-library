import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, apiErrorBodySchema } from './errors';

const body = {
  error: {
    code: 'NOT_FOUND',
    message: 'Resource not found.',
    details: [],
    requestId: 'req-1',
  },
};

describe('error body contract', () => {
  it('accepts the documented envelope', () => {
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts field details', () => {
    const parsed = apiErrorBodySchema.parse({
      error: {
        ...body.error,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'pageSize', reason: 'out_of_range' }],
      },
    });
    expect(parsed.error.details[0]?.reason).toBe('out_of_range');
  });

  it('rejects unknown codes and missing request ids', () => {
    expect(() => apiErrorBodySchema.parse({ error: { ...body.error, code: 'OOPS' } })).toThrow();
    expect(() =>
      apiErrorBodySchema.parse({ error: { code: 'NOT_FOUND', message: 'x', details: [] } }),
    ).toThrow();
  });

  it('keeps the documented code list in sync', () => {
    expect(API_ERROR_CODES).toContain('UNAUTHORIZED');
    expect(API_ERROR_CODES).toContain('SERVICE_UNAVAILABLE');
    expect(API_ERROR_CODES).toContain('VALIDATION_ERROR');
  });
});
