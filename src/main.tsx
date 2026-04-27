import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './lib/locale'
import { BuildTracker } from './components/BuildTracker.tsx'

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
