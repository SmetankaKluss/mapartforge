import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './lib/locale'
import { BuildTracker } from './components/BuildTracker.tsx'

// GitHub Pages SPA routing: restore path from ?p= param if present
const searchParams = new URLSearchParams(window.location.search);
const encodedPath = searchParams.get('p');
if (encodedPath) {
  // Replace the mangled URL with the real one, without reloading
  const decoded = decodeURIComponent(encodedPath);
  window.history.replaceState(null, '', decoded);
}

// Simple path-based routing without react-router
const path = window.location.pathname;
const buildMatch = path.match(/^\/build\/([0-9a-f-]{36})$/i);

const root = document.getElementById('root')!;

if (buildMatch) {
  const sessionId = buildMatch[1];
  createRoot(root).render(<BuildTracker sessionId={sessionId} />);
} else {
  createRoot(root).render(
    <LocaleProvider>
      <App />
    </LocaleProvider>,
  );
}
