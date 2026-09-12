import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registers the service worker that backs the offline behaviour the install guide describes,
// and that Chrome requires before it will offer its install prompt. Registration is deferred to
// `load` so it never competes with the first render, and skipped in dev where Vite serves
// modules that must not be cached.
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed; the app still works online:', err);
    });
  });
}
