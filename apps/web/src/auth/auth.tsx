import { isStaffRole } from '@wms/contracts/client';
import type { SessionUser } from '@wms/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useBackend } from '../backend/context.js';
import { DemoBackend } from '../backend/demo.js';
import { onUnauthorized } from '../backend/http.js';
import { useStore } from '../data/context.js';
import { can, type Action } from '../data/permissions.js';

/**
 * The signed-in person, from whichever backend runs. With the API the session is an HttpOnly
 * cookie the page never sees; with the demo it is a name in browser storage.
 */
interface AuthValue {
  user: SessionUser | null;
  /** False until the first session check has answered, so nothing flashes the sign-in page. */
  ready: boolean;
  /** Throws a WmsError with a message for the person when sign-in is refused. */
  signIn: (login: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  /** Demo only: change account without the sign-in screen, to try each role. */
  switchTo: ((username: string) => void) | null;
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * True between an explicit sign-out and the next sign-in. The route guard reads it so that
 * signing out and in again lands on the dashboard, not on the page the previous person left.
 */
let signedOutOnPurpose = false;
export const leftOnPurpose = (): boolean => signedOutOnPurpose;

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const store = useStore();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await backend.currentUser());
    } catch (error) {
      console.error('Could not check the session', error);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
    // Demo: deactivating an account signs it out everywhere at once, so re-check on change.
    // API: any 401 means the session ended (expired, revoked, signed out elsewhere).
    if (backend.mode === 'demo') return store.subscribe(() => void refresh());
    return onUnauthorized(() => setUser(null));
  }, [backend, store, refresh]);

  const signIn = useCallback(
    async (login: string, password: string, remember: boolean) => {
      const signedIn = await backend.signIn(login, password, remember);
      signedOutOnPurpose = false;
      setUser(signedIn);
    },
    [backend],
  );

  const signOut = useCallback(async () => {
    signedOutOnPurpose = true;
    setUser(null);
    await backend.signOut();
  }, [backend]);

  const switchTo = useMemo(
    () =>
      backend instanceof DemoBackend
        ? (username: string) => {
            backend.switchTo(username);
            void refresh();
          }
        : null,
    [backend, refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      signIn,
      signOut,
      switchTo,
      // The staff console checks staff roles; a partner account is sent to its portal.
      can: (action) => (user && isStaffRole(user.role) ? can(user.role, action) : false),
    }),
    [user, ready, signIn, signOut, switchTo],
  );

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
