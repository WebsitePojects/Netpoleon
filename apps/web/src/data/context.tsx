import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { WmsStore } from './store.js';
import type { WmsState } from './types.js';

const StoreContext = createContext<WmsStore | null>(null);

export function StoreProvider({ store, children }: { store: WmsStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): WmsStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>.');
  return store;
}

/** The current demo data; the component re-renders whenever the store commits a change. */
export function useWmsState(): WmsState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
