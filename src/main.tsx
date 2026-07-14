import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './lib/LocaleProvider'
import { BuildTracker } from './components/BuildTracker.tsx'
import { ExamplesPage } from './components/ExamplesPage.tsx'
import { ExampleDetailPage, ExampleDetailNotFound } from './components/ExampleDetailPage.tsx'
import { SeoLandingPage } from './components/SeoLandingPage.tsx'
import { CompanionCloudPage } from './components/CompanionCloudPage.tsx'
import { DeviceApprovalPage } from './components/DeviceApprovalPage.tsx'
import { CompanionArtPage } from './components/CompanionArtPage.tsx'
import { CompanionCollectionPage } from './components/CompanionCollectionPage.tsx'
import { initAnalyticsContext, initClarity, trackEvent } from './lib/analytics'
import { installClientErrorReporting } from './lib/errorReporting.ts'
import { getSeoPageByPath } from './lib/seoPages.ts'
import { getExampleByPath } from './lib/examples.ts'

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
const companionArtMatch = path.match(/^\/art\/([0-9a-f-]{36})$/i);
const companionCollectionMatch = path.match(/^\/collection\/([0-9a-f-]{36})$/i);
const seoPage = getSeoPageByPath(path);
const examplePage = getExampleByPath(path);
const pageType = buildMatch ? 'build_tracker' : companionArtMatch ? 'companion_art' : companionCollectionMatch ? 'companion_collection' : examplePage ? 'example_detail' : path === '/examples' ? 'examples' : path === '/cloud' ? 'cloud' : path === '/device' ? 'device' : seoPage ? 'seo' : 'editor';

initAnalyticsContext();
initClarity(import.meta.env.VITE_CLARITY_PROJECT_ID);
installClientErrorReporting({ pageType });
trackEvent('app_route_opened', {
  path: window.location.pathname,
  page_type: pageType,
});

const root = document.getElementById('root')!;

if (buildMatch) {
  const sessionId = buildMatch[1];
  createRoot(root).render(<BuildTracker sessionId={sessionId} />);
} else if (path === '/examples') {
  createRoot(root).render(
    <LocaleProvider>
      <ExamplesPage />
    </LocaleProvider>,
  );
} else if (path.startsWith('/examples/')) {
  createRoot(root).render(
    <LocaleProvider>
      {examplePage ? <ExampleDetailPage example={examplePage} /> : <ExampleDetailNotFound />}
    </LocaleProvider>,
  );
} else if (path === '/cloud') {
  createRoot(root).render(
    <LocaleProvider>
      <CompanionCloudPage />
    </LocaleProvider>,
  );
} else if (path === '/device') {
  createRoot(root).render(
    <LocaleProvider>
      <DeviceApprovalPage />
    </LocaleProvider>,
  );
} else if (companionArtMatch) {
  createRoot(root).render(
    <LocaleProvider>
      <CompanionArtPage artId={companionArtMatch[1]} />
    </LocaleProvider>,
  );
} else if (companionCollectionMatch) {
  createRoot(root).render(
    <LocaleProvider>
      <CompanionCollectionPage collectionId={companionCollectionMatch[1]} />
    </LocaleProvider>,
  );
} else if (seoPage) {
  createRoot(root).render(
    <LocaleProvider>
      <SeoLandingPage page={seoPage} />
    </LocaleProvider>,
  );
} else {
  createRoot(root).render(
    <LocaleProvider>
      <App />
    </LocaleProvider>,
  );
}
