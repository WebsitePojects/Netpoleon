/**
 * The one door to the API. Same origin (the web container proxies /api), so the session cookie
 * travels by itself and no token is ever handled by script. Every state-changing call carries
 * the CSRF header and the caller's Idempotency-Key.
 */

const BASE = '/api/v1';

/** A refusal the person can act on: shown in forms and toasts as written by the server. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    title: string,
    readonly detail?: string,
  ) {
    super(detail ? `${title}. ${detail}` : title);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const unauthenticatedListeners = new Set<Listener>();

/** Called on any 401, so the app can drop cached data and show the sign-in screen. */
export function onUnauthenticated(listener: Listener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  if (response.ok) return body as T;
  if (response.status === 401) {
    for (const listener of unauthenticatedListeners) listener();
  }
  const problem = (body ?? {}) as { code?: string; title?: string; detail?: string };
  throw new ApiError(
    response.status,
    problem.code ?? 'error',
    problem.title ?? 'The server could not complete the request',
    problem.detail,
  );
}

function query(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) search.set(key, value.map(String).join(','));
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${query(params)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'Cannot reach the server. Check the connection and try again');
  }
  return parse<T>(response);
}

/**
 * A mutation. `key` is the Idempotency-Key for this intent: generate it once when the dialog
 * opens and reuse it for every retry, so a timeout followed by a retry replays instead of
 * repeating the change.
 */
export async function apiSend<T>(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  key?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-wms-request': '1',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check the connection and try again');
  }
  return parse<T>(response);
}

export function newIntentKey(): string {
  return crypto.randomUUID();
}

/** Where the browser downloads a CSV export with the list's current filters. */
export function exportUrl(path: string, params: Record<string, unknown>): string {
  return `${BASE}${path}${query(params)}`;
}
