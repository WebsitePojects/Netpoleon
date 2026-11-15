import '@fontsource-variable/manrope';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { AuthProvider } from './auth/auth.js';
import { BackendProvider } from './backend/context.js';
import { DemoBackend } from './backend/demo.js';
import { HttpBackend } from './backend/http.js';
import type { Backend } from './backend/types.js';
import { ToastProvider } from './components/ui.js';
import { StoreProvider } from './data/context.js';
import { WmsStore } from './data/store.js';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing the #root element.');

// The composition root of the web app: the one place the store and the backend are built.
// VITE_BACKEND=api talks to the API on this origin; anything else runs the demo in the browser.
// The demo store is built either way: borrowing and inspection run on it until slice 3.
const store = new WmsStore(window.localStorage);
const backend: Backend =
  import.meta.env['VITE_BACKEND'] === 'api' ? new HttpBackend() : new DemoBackend(store);

createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <BackendProvider backend={backend}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </BackendProvider>
    </StoreProvider>
  </StrictMode>,
);

// Let the preloader play at least one beat, then fade it out and drop it from the tree.
const BOOT_MIN_MS = 900;
const BOOT_FADE_MS = 560;
const boot = document.getElementById('boot');
if (boot) {
  setTimeout(() => {
    boot.dataset.done = 'true';
    setTimeout(() => boot.remove(), BOOT_FADE_MS);
  }, BOOT_MIN_MS);
}
