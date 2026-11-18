import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, createAuthApi } from './client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function noContentResponse(): Response {
  return { ok: true, status: 204, json: async () => undefined } as unknown as Response;
}

const user = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified',
  avatarUrl: null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};
const session = { user, roles: ['user'], permissions: [], expiresAt: '2026-11-25T00:00:00.000Z' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('auth api client', () => {
  it('registers with a JSON body and returns UserPublic', async () => {
    fetchMock.mockResolvedValue(jsonResponse(user, 201));
    await expect(createAuthApi().register({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse' })).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse' }),
    });
  });

  it('logs in and restores the current session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(session, 201)).mockResolvedValueOnce(jsonResponse(session, 200));
    const api = createAuthApi();
    await expect(api.login({ identifier: 'Reader_01', password: 'correct-horse' })).resolves.toEqual(session);
    await expect(api.current()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/sessions/current', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  });

  it('logs out on 204 with no response body', async () => {
    fetchMock.mockResolvedValue(noContentResponse());
    await expect(createAuthApi().logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/current', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{}',
    });
  });

  it('patches only the fields it is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...user, signature: '新签名' }));
    await createAuthApi().updateProfile({ signature: '新签名' });
    expect(fetchMock).toHaveBeenCalledWith('/api/me', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ signature: '新签名' }),
    });
  });

  it('maps 401/409 and network failures to ApiClientError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } }, 401));
    const api = createAuthApi();
    await expect(api.current()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'IDENTITY_CONFLICT', message: 'Identity is already in use.' } }, 409));
    await expect(api.updateProfile({ username: 'Taken_Name' })).rejects.toMatchObject({ status: 409, code: 'IDENTITY_CONFLICT' });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.current()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(ApiClientError).toBeDefined();
  });
});
