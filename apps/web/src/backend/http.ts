import { CLIENT_HEADER } from '@wms/contracts/client';
import type {
  AssetDetail,
  AuditEntry,
  BatchResult,
  Catalog,
  Partner,
  SessionUser,
  TokenOwner,
  User,
} from '@wms/contracts';
import { WmsError } from '../data/store.js';
import type { Backend, Invitation, UnitPage } from './types.js';

/**
 * A refusal from the API, carrying the problem's title, which is written for the person at
 * the screen. Extends WmsError so every form shows it the way it shows a demo-store refusal.
 */
export class ApiError extends WmsError {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

interface Problem {
  title?: string;
  code?: string;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const unauthorizedListeners = new Set<() => void>();

/** Subscribes to "the session ended": any 401 from a signed-in request. Returns the unsubscribe. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

const BASE = '/api/v1';

/**
 * Calls the API on the app's own origin. The session is the HttpOnly cookie, sent by the
 * browser; scripts never see it. Every mutation carries the client header (the CSRF guard)
 * and the intent's Idempotency-Key, created once when the dialog opened.
 */
async function call<T>(
  method: Method,
  path: string,
  options: { body?: unknown; intent?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') headers[CLIENT_HEADER] = 'web';
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.intent) headers['idempotency-key'] = options.intent;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(
      'The server could not be reached. Check the connection and try again.',
      0,
      'offline',
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const problem = (data ?? {}) as Problem;
    if (response.status === 401 && problem.code === 'not_signed_in') {
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError(
      problem.title ?? `The request failed (${response.status}).`,
      response.status,
      problem.code ?? 'unknown',
    );
  }
  return data as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export class HttpBackend implements Backend {
  readonly mode = 'api' as const;

  async signIn(login: string, password: string, remember: boolean): Promise<SessionUser> {
    const result = await call<{ user: SessionUser }>('POST', '/auth/login', {
      body: { email: login, password, remember },
    });
    return result.user;
  }

  async signOut(): Promise<void> {
    await call('POST', '/auth/logout');
  }

  async currentUser(): Promise<SessionUser | null> {
    try {
      return (await call<{ user: SessionUser }>('GET', '/auth/me')).user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    await call('POST', '/auth/password/forgot', { body: { email } });
  }

  async linkOwner(purpose: 'invite' | 'password_reset', token: string): Promise<TokenOwner | null> {
    try {
      return await call<TokenOwner>('GET', `/auth/links/${purpose}/${encodeURIComponent(token)}`);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 410 || error.status === 400)) return null;
      throw error;
    }
  }

  async completeLink(purpose: 'invite' | 'password_reset', token: string, password: string) {
    await call('POST', `/auth/links/${purpose}`, { body: { token, password } });
  }

  async changePassword(current: string, next: string): Promise<void> {
    await call('POST', '/auth/password/change', {
      body: { currentPassword: current, newPassword: next },
    });
  }

  catalog(): Promise<Catalog> {
    return call('GET', '/catalog');
  }

  async addCategory(intent: string, input: { name: string; code: string }) {
    await call('POST', '/categories', { intent, body: input });
  }

  async addShelf(intent: string, input: { name: string; code: string; parentId: string }) {
    await call('POST', '/locations', { intent, body: { ...input, kind: 'shelf' } });
  }

  addModel(intent: string, input: Parameters<Backend['addModel']>[1]) {
    return call<{ id: string }>('POST', '/models', {
      intent,
      body: { ...input, isBookable: true },
    });
  }

  units(params: Parameters<Backend['units']>[0]): Promise<UnitPage> {
    const { codes, ...rest } = params;
    return call('GET', `/assets${query({ ...rest, codes: codes?.join(',') })}`);
  }

  unit(code: string): Promise<AssetDetail> {
    return call('GET', `/assets/${encodeURIComponent(code)}`);
  }

  registerUnit(intent: string, input: Parameters<Backend['registerUnit']>[1]) {
    return call<AssetDetail>('POST', '/assets', { intent, body: input });
  }

  editUnit(intent: string, code: string, patch: Parameters<Backend['editUnit']>[2]) {
    return call<AssetDetail>('PATCH', `/assets/${encodeURIComponent(code)}`, {
      intent,
      body: patch,
    });
  }

  moveUnit(intent: string, code: string, locationId: string) {
    return call<AssetDetail>('POST', `/assets/${encodeURIComponent(code)}/move`, {
      intent,
      body: { locationId },
    });
  }

  moveUnits(intent: string, codes: string[], locationId: string) {
    return call<BatchResult>('POST', '/assets/move', { intent, body: { codes, locationId } });
  }

  repairUnit(intent: string, code: string, reason: string) {
    return call<AssetDetail>('POST', `/assets/${encodeURIComponent(code)}/repair`, {
      intent,
      body: { reason },
    });
  }

  repairComplete(intent: string, code: string) {
    return call<AssetDetail>('POST', `/assets/${encodeURIComponent(code)}/repaired`, {
      intent,
      body: { note: null },
    });
  }

  retireUnit(intent: string, code: string, reason: string) {
    return call<AssetDetail>('POST', `/assets/${encodeURIComponent(code)}/retire`, {
      intent,
      body: { reason },
    });
  }

  /** Loans are served by the API from slice 3; until then a unit shows no borrowers here. */
  unitLoans(): Promise<[]> {
    return Promise.resolve([]);
  }

  async users(): Promise<User[]> {
    return (await call<{ items: User[] }>('GET', '/users')).items;
  }

  async inviteUser(
    intent: string,
    input: Parameters<Backend['inviteUser']>[1],
  ): Promise<Invitation> {
    return { user: await call<User>('POST', '/users', { intent, body: input }), link: null };
  }

  editUser(intent: string, id: string, patch: Parameters<Backend['editUser']>[2]) {
    return call<User>('PATCH', `/users/${id}`, { intent, body: patch });
  }

  setUserActive(intent: string, id: string, active: boolean) {
    return call<User>('POST', `/users/${id}/${active ? 'reactivate' : 'deactivate'}`, { intent });
  }

  async resendInvite(intent: string, id: string): Promise<Invitation> {
    return { user: await call<User>('POST', `/users/${id}/invite`, { intent }), link: null };
  }

  async partners(): Promise<Partner[]> {
    return (await call<{ items: Partner[] }>('GET', '/partners')).items;
  }

  partner(id: string): Promise<Partner> {
    return call('GET', `/partners/${id}`);
  }

  /** Loans are served by the API from slice 3; until then a company shows no history here. */
  partnerLoans(): Promise<[]> {
    return Promise.resolve([]);
  }

  addPartner(intent: string, input: { name: string; type: Partner['type'] }) {
    return call<Partner>('POST', '/partners', { intent, body: input });
  }

  editPartner(intent: string, id: string, input: { name: string; type: Partner['type'] }) {
    return call<Partner>('PATCH', `/partners/${id}`, { intent, body: input });
  }

  setPartnerArchived(intent: string, id: string, archived: boolean) {
    return call<Partner>('POST', `/partners/${id}/${archived ? 'archive' : 'restore'}`, { intent });
  }

  addContact(
    intent: string,
    id: string,
    input: { fullName: string; email: string; phone: string },
  ) {
    return call<Partner>('POST', `/partners/${id}/contacts`, { intent, body: input });
  }

  removeContact(intent: string, id: string, contactId: string) {
    return call<Partner>('DELETE', `/partners/${id}/contacts/${contactId}`, { intent });
  }

  audit(params: Parameters<Backend['audit']>[0]) {
    return call<{ items: AuditEntry[]; nextCursor: string | null }>(
      'GET',
      `/audit${query({ ...params })}`,
    );
  }
}
