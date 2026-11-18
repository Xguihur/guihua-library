import { z } from 'zod';

/** Error codes from docs/contracts/errors.md. M1 only emits a subset. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_USERNAME',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'IDENTITY_CONFLICT',
  'LAST_LOGIN_METHOD',
  'RATE_LIMITED',
  'UNPROCESSABLE_ENTITY',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface FieldIssue {
  field: string;
  reason: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: FieldIssue[];
    requestId: string;
  };
}

export const fieldIssueSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
});

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string().min(1),
    details: z.array(fieldIssueSchema),
    requestId: z.string().min(1),
  }),
});
