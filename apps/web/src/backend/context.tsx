import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { WmsError } from '../data/store.js';
import { randomToken } from '../lib/sha256.js';
import type { Backend } from './types.js';

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error('useBackend must be used inside <BackendProvider>.');
  return backend;
}

/**
 * Which resources changed, by key prefix. A mutation calls `invalidate('units')` and every
 * mounted `useResource` whose key starts with it loads again.
 */
const listeners = new Set<(prefix: string) => void>();

export function invalidate(...prefixes: string[]): void {
  for (const listener of listeners) for (const prefix of prefixes) listener(prefix);
}

export interface Resource<T> {
  data: T | undefined;
  error: string | null;
  /** True until the first load finishes; reloads keep showing the previous data. */
  loading: boolean;
  /** True while data for a new key loads and the previous data is still shown. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Loads data for a screen and keeps it current. The key names the data (it should include
 * every input of `load`), so a changed filter loads again and a stale answer that arrives
 * late is dropped instead of overwriting a newer one.
 */
export function useResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ key: string; data: T | undefined; error: string | null }>({
    key: '',
    data: undefined,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let current = true;
    loader
      .current()
      .then((data) => {
        if (current) setState({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const message =
          error instanceof WmsError ? error.message : 'This could not be loaded. Try again.';
        if (!(error instanceof WmsError)) console.error('Unexpected error while loading', error);
        setState((previous) => ({ ...previous, key, error: message }));
      });
    return () => {
      current = false;
    };
  }, [key, version]);

  useEffect(() => {
    const listener = (prefix: string) => {
      if (key.startsWith(prefix)) setVersion((value) => value + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const loaded = state.key === key || state.data !== undefined;
  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: !loaded,
    refreshing: state.key !== key && state.data !== undefined,
    reload,
  };
}

/**
 * One Idempotency-Key per user intent (the repository's concurrency rules): created when the
 * dialog opens, reused if the person presses again or the request is retried after a
 * timeout, and replaced only once the action has succeeded.
 */
export function useIntent(): { key: string; renew: () => void } {
  const [key, setKey] = useState(randomToken);
  const renew = useCallback(() => setKey(randomToken()), []);
  return { key, renew };
}

/**
 * Page-by-page navigation over a cursor-paged list. Each page's cursor is remembered, so Back
 * and Next both work; a new search or filter (a new `filterKey`) starts again at page one.
 * `page` comes from the address and `setPage` writes it back.
 */
export function useCursorPaging(
  filterKey: string,
  page: number,
  setPage: (page: number) => void,
): {
  page: number;
  cursor: string | undefined;
  goTo: (next: number, nextCursor: string | null | undefined) => void;
} {
  const [cursors, setCursors] = useState<{ key: string; list: (string | undefined)[] }>({
    key: filterKey,
    list: [undefined],
  });
  const list = cursors.key === filterKey ? cursors.list : [undefined];
  // A bookmarked deep page has no cursor yet, so it shows the deepest page that is known.
  const known = Math.min(page, list.length);
  useEffect(() => {
    if (cursors.key !== filterKey) setCursors({ key: filterKey, list: [undefined] });
  }, [cursors.key, filterKey]);

  const goTo = (next: number, nextCursor: string | null | undefined) => {
    if (next > known && nextCursor) {
      setCursors({ key: filterKey, list: [...list.slice(0, known), nextCursor] });
    }
    setPage(next);
  };
  return { page: known, cursor: list[known - 1], goTo };
}
