import type { Action, Bootstrap, SessionUser } from '@wms/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, apiSend, onUnauthenticated } from '../api/client.js';
import { keys, useBootstrap } from '../api/queries.js';

/**
 * Who is signed in, from the server. The session is an HttpOnly cookie the script never sees;
 * the console only knows the bootstrap payload (person, permissions, settings, reference
 * lists). Signing out or any 401 clears every cached query, so the next person to sit at this
 * browser cannot see the previous one's data, even for a frame.
 */
interface AuthValue {
  user: SessionUser | null;
  bootstrap: Bootstrap | null;
  /** True until the first answer about the session has arrived. */
  loading: boolean;
  /** Resolves to an error message, or null when signed in. */
  signIn: (identifier: string, password: string, remember: boolean) => Promise<string | null>;
  signOut: () => Promise<void>;
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Forgets everything the previous session loaded, then records who is signed in now. The
 * bootstrap query itself is updated in place, not removed: the provider is subscribed to it,
 * and removing it (`client.clear()`) left that subscription on a dead query, so the console
 * stayed blank after signing in until the page was reloaded.
 */
function dropSessionData(client: QueryClient, next: Bootstrap | null): void {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.bootstrap[0] });
  client.setQueryData(keys.bootstrap, next);
}

/**
 * True between an explicit sign-out and the next sign-in. The route guard reads it so signing
 * out and in again lands on the dashboard, not on the page the previous person left.
 */
let signedOutOnPurpose = false;
export const leftOnPurpose = (): boolean => signedOutOnPurpose;

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const bootstrapQuery = useBootstrap();

  useEffect(
    () =>
      onUnauthenticated(() => {
        // Keep the "signed out" answer, drop everything else the previous session loaded.
        dropSessionData(client, null);
      }),
    [client],
  );

  const bootstrap = bootstrapQuery.data ?? null;
  const user = bootstrap?.user ?? null;

  const signIn = useCallback(
    async (identifier: string, password: string, remember: boolean): Promise<string | null> => {
      try {
        const data = await apiSend<Bootstrap>('POST', '/auth/login', {
          identifier,
          password,
          remember,
        });
        signedOutOnPurpose = false;
        dropSessionData(client, data);
        return null;
      } catch (error) {
        if (error instanceof ApiError) {
          return error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : error.status === 401
              ? 'Incorrect username or password.'
              : error.message;
        }
        return 'Sign-in failed because of an unexpected error. Try again.';
      }
    },
    [client],
  );

  const signOut = useCallback(async () => {
    signedOutOnPurpose = true;
    try {
      await apiSend('POST', '/auth/logout', {});
    } finally {
      dropSessionData(client, null);
    }
  }, [client]);

  const value = useMemo<AuthValue>(() => {
    const granted = new Set(bootstrap?.permissions ?? []);
    return {
      user,
      bootstrap,
      loading: bootstrapQuery.isPending && bootstrapQuery.fetchStatus !== 'idle',
      signIn,
      signOut,
      can: (action) => granted.has(action),
    };
  }, [user, bootstrap, bootstrapQuery.isPending, bootstrapQuery.fetchStatus, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** The signed-in user. Only for screens rendered inside the protected shell. */
export function useCurrentUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser was called while signed out.');
  return user;
}

/** Reference data and settings from the bootstrap payload; only inside the protected shell. */
export function useReference(): Bootstrap {
  const { bootstrap } = useAuth();
  if (!bootstrap) throw new Error('useReference was called while signed out.');
  return bootstrap;
}
