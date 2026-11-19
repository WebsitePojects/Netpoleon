import '@fontsource-variable/manrope';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './api/client.js';
import { App } from './App.js';
import { AuthProvider } from './auth/auth.js';
import { ToastProvider } from './components/ui.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing the #root element.');

// The composition root of the web app. Queries refetch on focus and reconnect so a page left
// open shows current data; a refused request (4xx) is never retried, a network blip once.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status >= 400),
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
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
