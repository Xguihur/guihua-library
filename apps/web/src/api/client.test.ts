import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, createHttpClient } from './client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function brokenResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error('not json');
    },
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('http api client', () => {
  it('builds list queries with the shared contract helpers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], page: 2, pageSize: 5, total: 0 }));
    const api = createHttpClient();

    await api.listBooks({ status: 'finished', page: 2, pageSize: 5 });
    expect(fetchMock).toHaveBeenCalledWith('/api/books?status=finished&page=2&pageSize=5', {
      headers: { accept: 'application/json' },
    });

    await api.listBooks();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/books', { headers: { accept: 'application/json' } });
  });

  it('encodes book ids and comment queries', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    const api = createHttpClient();

    await api.getBook('abc/def');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/books/abc%2Fdef', { headers: { accept: 'application/json' } });

    await api.listComments('b1', { page: 3 });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/books/b1/comments?page=3', {
      headers: { accept: 'application/json' },
    });
  });

  it('maps API error envelopes to ApiClientError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found.',
            details: [],
            requestId: 'req-9',
          },
        },
        404,
      ),
    );
    const api = createHttpClient();

    await expect(api.getBook('missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'req-9',
    });
  });

  it('keeps validation details from the server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request could not be processed.',
            details: [{ field: 'pageSize', reason: 'out_of_range' }],
            requestId: 'req-10',
          },
        },
        400,
      ),
    );
    const api = createHttpClient();
    try {
      await api.listBooks({ pageSize: 500 });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).details).toEqual([{ field: 'pageSize', reason: 'out_of_range' }]);
    }
  });

  it('falls back to a stable error when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(brokenResponse(502));
    const api = createHttpClient();

    await expect(api.listBooks()).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('reports network failures separately from HTTP errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const api = createHttpClient();

    await expect(api.listBooks()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
