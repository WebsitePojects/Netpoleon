import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiSend, exportUrl, onUnauthenticated } from '../src/api/client.js';

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiSend', () => {
  it('sends the CSRF header, the idempotency key and the cookie, never a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { id: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiSend('POST', '/units', { serial: 'A1' }, 'key-1234567890abcd');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/units');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toMatchObject({
      'x-wms-request': '1',
      'idempotency-key': 'key-1234567890abcd',
    });
    expect(init.body).toBe(JSON.stringify({ serial: 'A1' }));
  });

  it('turns a problem response into an ApiError with the server wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(409, {
          code: 'unit_unavailable',
          title: 'The unit is already booked for those dates',
        }),
      ),
    );

    const error = await apiSend('POST', '/transactions/BRR-2026-00001/approve', {}, 'k').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'unit_unavailable',
      message: 'The unit is already booked for those dates',
    });
  });

  it('reports a dropped connection as a network error, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiSend('POST', '/units', {}, 'k')).rejects.toMatchObject({
      code: 'network',
      status: 0,
    });
  });
});

describe('apiGet', () => {
  it('drops empty parameters and joins lists, so the server sees exactly the filters chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/transactions', {
      q: '',
      stage: ['pending', 'approved'],
      page: 2,
      company: undefined,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/transactions?stage=pending%2Capproved&page=2',
    );
  });

  it('tells listeners about a 401 so cached data is dropped', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(reply(401, { code: 'unauthenticated', title: 'Sign in to continue' })),
    );
    const listener = vi.fn();
    const stop = onUnauthenticated(listener);

    await expect(apiGet('/bootstrap')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });
});

describe('exportUrl', () => {
  it('carries the list filters to the export', () => {
    expect(
      exportUrl('/units/export.csv', { status: ['in_stock'], q: 'cisco', page: undefined }),
    ).toBe('/api/v1/units/export.csv?status=in_stock&q=cisco');
  });
});
