import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useStore, useWmsState } from '../data/context.js';
import { can, type Action } from '../data/permissions.js';
import { DEMO_ADMIN_USERNAME, DEMO_PASSWORD } from '../data/seed.js';
import type { User } from '../data/types.js';

/**
 * DEMO SIGN-IN. There is no server in slice 1, so nothing here is security: credentials are
 * checked against fixtures in the browser, and an empty form enters as the demo administrator
 * (project owner's instruction, 2026-11-14). The whole file is replaced by the API session
 * in slice 2; no screen imports anything from it except `useAuth`.
 */

const SESSION_KEY = 'wms-demo-session';

interface AuthValue {
  user: User | null;
  /** Returns an error message, or null when signed in. */
  signIn: (username: string, password: string, remember: boolean) => string | null;
  signOut: () => void;
  /** Demo convenience: change account without the sign-in screen, to try each role. */
  switchTo: (username: string) => void;
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * True between an explicit sign-out and the next sign-in. The route guard reads it so that
 * signing out and in again lands on the dashboard, not on the page the previous person left.
 */
let signedOutOnPurpose = false;
export const leftOnPurpose = (): boolean => signedOutOnPurpose;

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  } catch {
    return null; // storage blocked: the visitor simply starts signed out
  }
}

function writeSession(username: string | null, remember: boolean): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (username) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, username);
  } catch {
    // Storage blocked: the session lasts until the tab reloads.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { users } = useWmsState();
  const [username, setUsername] = useState<string | null>(readSession);

  // Looked up on every render, so deactivating an account signs it out everywhere at once.
  const user = users.find((item) => item.username === username && item.active) ?? null;

  const signIn = useCallback(
    (name: string, password: string, remember: boolean): string | null => {
      const trimmed = name.trim().toLowerCase();
      const isBypass = trimmed === '' && password === '';
      const target = isBypass ? DEMO_ADMIN_USERNAME : trimmed;
      const account = store.getState().users.find((item) => item.username === target);
      const accepted = isBypass || password === DEMO_PASSWORD;
      // One message for every failure, so the form never reveals which usernames exist.
      if (!account || !account.active || !accepted) return 'Incorrect username or password.';
      signedOutOnPurpose = false;
      writeSession(account.username, remember);
      setUsername(account.username);
      store.touchUser(account.username);
      return null;
    },
    [store],
  );

  const signOut = useCallback(() => {
    signedOutOnPurpose = true;
    writeSession(null, false);
    setUsername(null);
  }, []);

  const switchTo = useCallback(
    (name: string) => {
      writeSession(name, false);
      setUsername(name);
      store.touchUser(name);
    },
    [store],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      signIn,
      signOut,
      switchTo,
      can: (action) => (user ? can(user.role, action) : false),
    }),
    [user, signIn, signOut, switchTo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** The signed-in user. Only for screens rendered inside the protected shell. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser was called while signed out.');
  return user;
}
