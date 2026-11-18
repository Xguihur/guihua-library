import {
  buildBookListQuery,
  buildCommentsQuery,
  type AuthorizationUrlDto,
  type BookDetailDto,
  type BookListQueryInput,
  type BookListResponse,
  type CommentListResponse,
  type FieldIssue,
  type LoginMethodsDto,
  type LoginRequest,
  type ProfileUpdate,
  type RegisterRequest,
  type SessionCurrentDto,
  type UserPublicDto,
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

export interface AuthApi {
  register(input: RegisterRequest): Promise<UserPublicDto>;
  login(input: LoginRequest): Promise<SessionCurrentDto>;
  current(): Promise<SessionCurrentDto>;
  logout(): Promise<void>;
  updateProfile(input: ProfileUpdate): Promise<UserPublicDto>;
  loginMethods(): Promise<LoginMethodsDto>;
  beginGithubLink(): Promise<AuthorizationUrlDto>;
  unlinkGithub(): Promise<void>;
  reauthenticatePassword(password: string): Promise<void>;
  beginGithubReauth(): Promise<AuthorizationUrlDto>;
  requestEmailVerification(email: string): Promise<{ message: string }>;
  completePasswordCredential(input: { token: string; password?: string }): Promise<void>;
}

/** Same-origin credentialed JSON writes; the browser supplies the Origin header. */
export function createAuthApi(baseUrl = ''): AuthApi {
  async function authRequest<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
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
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    register: (input) => authRequest<UserPublicDto>('/api/users', { method: 'POST', body: input }),
    login: (input) => authRequest<SessionCurrentDto>('/api/sessions', { method: 'POST', body: input }),
    current: () => authRequest<SessionCurrentDto>('/api/sessions/current', { method: 'GET' }),
    // DELETE is still a JSON write for CSRF protection, but carries no business fields.
    logout: () => authRequest<void>('/api/sessions/current', { method: 'DELETE', body: {} }),
    updateProfile: (input) => authRequest<UserPublicDto>('/api/me', { method: 'PATCH', body: input }),
    loginMethods: () => authRequest<LoginMethodsDto>('/api/me/login-methods', { method: 'GET' }),
    beginGithubLink: () =>
      authRequest<AuthorizationUrlDto>('/api/me/identities/github/authorizations', { method: 'POST', body: {} }),
    unlinkGithub: () => authRequest<void>('/api/me/identities/github', { method: 'DELETE', body: {} }),
    reauthenticatePassword: (password) =>
      authRequest<void>('/api/sessions/current/reauthentications', { method: 'POST', body: { password } }),
    beginGithubReauth: () =>
      authRequest<AuthorizationUrlDto>('/api/sessions/current/github/authorizations', { method: 'POST', body: {} }),
    requestEmailVerification: (email) =>
      authRequest<{ message: string }>('/api/me/password-credentials/verifications', {
        method: 'POST',
        body: { email },
      }),
    completePasswordCredential: (input) =>
      authRequest<void>('/api/me/password-credentials', { method: 'POST', body: input }),
  };
}

export const authApi: AuthApi = createAuthApi();
