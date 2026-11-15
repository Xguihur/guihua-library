import { z, type ZodError, type ZodIssue } from 'zod';
import { BOOK_STATUSES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type BookStatus } from './status';
import type { FieldIssue } from './errors';

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface BookListQuery extends PaginationQuery {
  status?: BookStatus;
}

export interface BookListQueryInput {
  status?: BookStatus;
  page?: number;
  pageSize?: number;
}

/** Thrown by the pure query parsers; the API maps it to 400 VALIDATION_ERROR. */
export class ContractValidationError extends Error {
  readonly details: FieldIssue[];

  constructor(details: FieldIssue[]) {
    super('Request parameters do not match the contract.');
    this.name = 'ContractValidationError';
    this.details = details;
  }
}

const decimalInteger = /^[0-9]+$/;

/**
 * Digits alone are not enough: a 400-digit string parses to Infinity, and
 * values above MAX_SAFE_INTEGER lose precision before the offset is computed.
 */
function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function isSafePageSize(value: number): boolean {
  return isSafePositiveInteger(value) && value <= MAX_PAGE_SIZE;
}

const pageField = z
  .string()
  .regex(decimalInteger, 'not_a_decimal_integer')
  .default('1')
  .transform((value) => Number(value))
  .refine(isSafePositiveInteger, 'out_of_range');

const pageSizeField = z
  .string()
  .regex(decimalInteger, 'not_a_decimal_integer')
  .default(String(DEFAULT_PAGE_SIZE))
  .transform((value) => Number(value))
  .refine(isSafePositiveInteger, 'out_of_range')
  .refine((value) => value <= MAX_PAGE_SIZE, 'out_of_range');

/**
 * The database skip is `(page - 1) * pageSize`; it must stay a safe integer
 * even when both individual values are in range. The issue is reported on
 * `page`, the value the caller controls, so the API answers
 * `400 VALIDATION_ERROR` with `{ field: "page", reason: "out_of_range" }`.
 */
function requireSafePageOffset(value: { page?: unknown; pageSize?: unknown }, ctx: z.RefinementCtx): void {
  if (typeof value.page !== 'number' || typeof value.pageSize !== 'number') return;
  if (!isSafePositiveInteger(value.page) || !isSafePageSize(value.pageSize)) return;
  const offset = (value.page - 1) * value.pageSize;
  if (!Number.isSafeInteger(offset)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['page'], message: 'out_of_range' });
  }
}

export const bookListQuerySchema = z
  .object({
    status: z.enum(BOOK_STATUSES).optional(),
    page: pageField,
    pageSize: pageSizeField,
  })
  .strict()
  .superRefine(requireSafePageOffset);

export const commentsQuerySchema = z
  .object({
    page: pageField,
    pageSize: pageSizeField,
  })
  .strict()
  .superRefine(requireSafePageOffset);

function toFieldIssue(issue: ZodIssue): FieldIssue {
  if (issue.code === 'unrecognized_keys') {
    return { field: issue.keys[0] ?? 'query', reason: 'unknown_query_parameter' };
  }
  const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'query';
  switch (issue.code) {
    case 'invalid_enum_value':
      return { field, reason: field === 'status' ? 'must_be_reading_or_finished' : 'invalid_value' };
    case 'invalid_string':
      return { field, reason: issue.message };
    case 'custom':
      return { field, reason: issue.message };
    case 'too_small':
    case 'too_big':
      return { field, reason: 'out_of_range' };
    case 'invalid_type':
      return {
        field,
        reason: field === 'status' ? 'must_be_reading_or_finished' : 'not_a_string',
      };
    default:
      return { field, reason: 'invalid_value' };
  }
}

export function fieldIssuesFromZodError(error: ZodError): FieldIssue[] {
  const seen = new Set<string>();
  const issues: FieldIssue[] = [];
  for (const issue of error.issues) {
    const mapped = toFieldIssue(issue);
    const key = `${mapped.field}:${mapped.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(mapped);
  }
  return issues;
}

interface SafeParser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: ZodError };
}

function parseWith<T>(schema: SafeParser<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error));
  }
  return result.data;
}

export function parseBookListQuery(input: unknown): BookListQuery {
  return parseWith(bookListQuerySchema, input);
}

export function parseCommentsQuery(input: unknown): PaginationQuery {
  return parseWith(commentsQuerySchema, input);
}

/** Web-side query builders so the browser and the API share one contract. */
export function buildBookListQuery(input: BookListQueryInput = {}): string {
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.page !== undefined) params.set('page', String(input.page));
  if (input.pageSize !== undefined) params.set('pageSize', String(input.pageSize));
  return params.toString();
}

export function buildCommentsQuery(input: { page?: number; pageSize?: number } = {}): string {
  const params = new URLSearchParams();
  if (input.page !== undefined) params.set('page', String(input.page));
  if (input.pageSize !== undefined) params.set('pageSize', String(input.pageSize));
  return params.toString();
}
