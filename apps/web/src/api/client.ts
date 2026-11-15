import {
  buildBookListQuery,
  buildCommentsQuery,
  type BookDetailDto,
  type BookListQueryInput,
  type BookListResponse,
  type CommentListResponse,
  type FieldIssue,
} from '@guihua/contracts';

export interface BooksApi {
  listBooks(params?: BookListQueryInput): Promise<BookListResponse>;
  getBook(bookId: string): Promise<BookDetailDto>;
  listComments(bookId: string, params?: { page?: number; pageSize?: number }): Promise<CommentListResponse>;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldIssue[];
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details: FieldIssue[] = [], requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

export function toApiClientError(value: unknown): ApiClientError {
  if (isApiClientError(value)) return value;
  return new ApiClientError(0, 'NETWORK_ERROR', '网络连接失败，请稍后重试。');
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: FieldIssue[];
    requestId?: string;
  };
}

async function readError(response: Response): Promise<ErrorPayload | null> {
  try {
    return (await response.json()) as ErrorPayload;
  } catch {
    return null;
  }
}

export function createHttpClient(baseUrl = ''): BooksApi {
  async function request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { headers: { accept: 'application/json' } });
    } catch {
      throw new ApiClientError(0, 'NETWORK_ERROR', '网络连接失败，请稍后重试。');
    }

    if (!response.ok) {
      const payload = await readError(response);
      throw new ApiClientError(
        response.status,
        payload?.error?.code ?? 'INTERNAL_ERROR',
        payload?.error?.message ?? '请求失败，请稍后重试。',
        payload?.error?.details ?? [],
        payload?.error?.requestId,
      );
    }

    return (await response.json()) as T;
  }

  return {
    listBooks(params = {}) {
      const query = buildBookListQuery(params);
      return request<BookListResponse>(`/api/books${query ? `?${query}` : ''}`);
    },
    getBook(bookId) {
      return request<BookDetailDto>(`/api/books/${encodeURIComponent(bookId)}`);
    },
    listComments(bookId, params = {}) {
      const query = buildCommentsQuery(params);
      return request<CommentListResponse>(
        `/api/books/${encodeURIComponent(bookId)}/comments${query ? `?${query}` : ''}`,
      );
    },
  };
}

export const booksApi: BooksApi = createHttpClient();
