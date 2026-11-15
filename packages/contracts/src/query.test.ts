import { describe, expect, it } from 'vitest';
import {
  ContractValidationError,
  buildBookListQuery,
  buildCommentsQuery,
  parseBookListQuery,
  parseCommentsQuery,
} from './query';

function expectRejected(input: unknown, field: string, reason: string): void {
  try {
    parseBookListQuery(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ContractValidationError);
    const details = (error as ContractValidationError).details;
    expect(details).toContainEqual({ field, reason });
    return;
  }
  throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
}

function expectCommentsRejected(input: unknown, field: string, reason: string): void {
  try {
    parseCommentsQuery(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ContractValidationError);
    const details = (error as ContractValidationError).details;
    expect(details).toContainEqual({ field, reason });
    return;
  }
  throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
}

describe('book list query contract', () => {
  it('applies documented defaults', () => {
    expect(parseBookListQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseBookListQuery(undefined)).toEqual({ page: 1, pageSize: 20 });
  });

  it('accepts both reading statuses and numeric strings', () => {
    expect(parseBookListQuery({ status: 'reading' })).toEqual({ status: 'reading', page: 1, pageSize: 20 });
    expect(parseBookListQuery({ status: 'finished', page: '3', pageSize: '100' })).toEqual({
      status: 'finished',
      page: 3,
      pageSize: 100,
    });
  });

  it('rejects an unknown status value', () => {
    expectRejected({ status: 'paused' }, 'status', 'must_be_reading_or_finished');
  });

  it('rejects unknown query parameters instead of ignoring them', () => {
    expectRejected({ sort: 'title' }, 'sort', 'unknown_query_parameter');
  });

  it('rejects non-decimal and non-positive paging values', () => {
    expectRejected({ page: '1.5' }, 'page', 'not_a_decimal_integer');
    expectRejected({ page: '-1' }, 'page', 'not_a_decimal_integer');
    expectRejected({ page: '0' }, 'page', 'out_of_range');
    expectRejected({ page: '' }, 'page', 'not_a_decimal_integer');
  });

  it('caps pageSize at 100 and rejects zero', () => {
    expectRejected({ pageSize: '101' }, 'pageSize', 'out_of_range');
    expectRejected({ pageSize: '0' }, 'pageSize', 'out_of_range');
  });

  it('rejects a page with too many digits to represent safely', () => {
    expectRejected({ page: '9'.repeat(400) }, 'page', 'out_of_range');
  });

  it('rejects a page above MAX_SAFE_INTEGER', () => {
    expectRejected({ page: String(Number.MAX_SAFE_INTEGER + 1) }, 'page', 'out_of_range');
  });

  it('rejects a page offset that exceeds MAX_SAFE_INTEGER', () => {
    expectRejected({ page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' }, 'page', 'out_of_range');
  });

  it('rejects repeated parameters', () => {
    expectRejected({ status: ['reading', 'finished'] }, 'status', 'must_be_reading_or_finished');
  });

  it('rejects non-string paging values', () => {
    expectRejected({ page: 2 }, 'page', 'not_a_string');
  });
});

describe('comments query contract', () => {
  it('applies defaults and accepts paging', () => {
    expect(parseCommentsQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseCommentsQuery({ page: '2', pageSize: '5' })).toEqual({ page: 2, pageSize: 5 });
  });

  it('rejects unknown parameters', () => {
    try {
      parseCommentsQuery({ status: 'reading' });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).details).toContainEqual({
        field: 'status',
        reason: 'unknown_query_parameter',
      });
    }
  });

  it('rejects a comment page with too many digits to represent safely', () => {
    expectCommentsRejected({ page: '9'.repeat(400) }, 'page', 'out_of_range');
  });

  it('rejects a comment page above MAX_SAFE_INTEGER', () => {
    expectCommentsRejected({ page: String(Number.MAX_SAFE_INTEGER + 1) }, 'page', 'out_of_range');
  });

  it('rejects a comment page offset that exceeds MAX_SAFE_INTEGER', () => {
    expectCommentsRejected({ page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' }, 'page', 'out_of_range');
  });
});

describe('query builders', () => {
  it('builds only present parameters', () => {
    expect(buildBookListQuery({})).toBe('');
    expect(buildBookListQuery({ status: 'finished', page: 2, pageSize: 5 })).toBe(
      'status=finished&page=2&pageSize=5',
    );
    expect(buildCommentsQuery({ page: 3 })).toBe('page=3');
  });

  it('round-trips through the parser', () => {
    const query = buildBookListQuery({ status: 'reading', page: 4, pageSize: 10 });
    const parsed = parseBookListQuery(Object.fromEntries(new URLSearchParams(query)));
    expect(parsed).toEqual({ status: 'reading', page: 4, pageSize: 10 });
  });
});
