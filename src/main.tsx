import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import './App.css'
import './publicPages.css'
import './motion.css'
import { LocaleProvider } from './lib/LocaleProvider'
import { initAnalyticsContext, initClarity, trackEvent, trackReleaseSeen } from './lib/analytics'
import { VERSION } from './version'
import { installClientErrorReporting } from './lib/errorReporting.ts'
import { getSeoPageByPath } from './lib/seoPages.ts'
import { getExampleByPath, isExamplesIndexPath } from './lib/examples.ts'
import { isWikiPath } from './lib/wiki.ts'
import { normalizeAppRoutePath } from './lib/appRoutePath.ts'

// GitHub Pages SPA routing: restore path from ?p= param if present
const searchParams = new URLSearchParams(window.location.search);
const encodedPath = searchParams.get('p');
if (encodedPath) {
  // Replace the mangled URL with the real one, without reloading
  const decoded = decodeURIComponent(encodedPath);
  window.history.replaceState(null, '', decoded);
}

// Simple path-based routing without react-router
const path = normalizeAppRoutePath(window.location.pathname);
const buildMatch = path.match(/^\/build\/([0-9a-f-]{36})$/i);
const companionArtMatch = path.match(/^\/art\/([0-9a-f-]{36})$/i);
const companionCollectionMatch = path.match(/^\/collection\/([0-9a-f-]{36})$/i);
const seoPage = getSeoPageByPath(path);
const examplePage = getExampleByPath(path);
const examplesIndex = isExamplesIndexPath(path);
const wikiPage = isWikiPath(path);
const pageType = buildMatch ? 'build_tracker' : companionArtMatch ? 'companion_art' : companionCollectionMatch ? 'companion_collection' : examplePage ? 'example_detail' : examplesIndex ? 'examples' : wikiPage ? 'wiki' : path === '/cloud' ? 'cloud' : path === '/device' ? 'device' : seoPage ? 'seo' : 'editor';

initAnalyticsContext();
initClarity(import.meta.env.VITE_CLARITY_PROJECT_ID);
installClientErrorReporting({ pageType });
trackEvent('app_route_opened', {
  path: window.location.pathname,
  page_type: pageType,
});
trackReleaseSeen(VERSION, pageType);

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

const routeLabels: Record<string, string> = {
  build_tracker: 'Открываю трекер стройки…',
  companion_art: 'Открываю арт…',
  companion_collection: 'Открываю коллекцию…',
  cloud: 'Подключаю облако MapKluss…',
  device: 'Готовлю вход мода…',
  examples: 'Открываю примеры…',
  example_detail: 'Открываю пример…',
  wiki: 'Открываю Wiki MapKluss…',
  seo: 'Открываю руководство…',
  editor: 'Запускаю редактор…',
};

const routeBootstrap = (
  <main className="route-bootstrap" aria-busy="true" aria-live="polite">
    <div className="route-bootstrap__status" role="status">
      <div className="route-bootstrap__brand">
        <img src="/logo-opt.png" width="64" height="64" alt="" />
        <span>MAPKLUSS</span>
      </div>
      <div className="route-bootstrap__track" aria-hidden="true" />
      <p className="route-bootstrap__copy">{routeLabels[pageType]}</p>
    </div>
  </main>
);

const routeLoadError = (
  <main className="route-bootstrap">
    <div className="route-bootstrap__status" role="alert">
      <div className="route-bootstrap__brand">
        <img src="/logo-opt.png" width="64" height="64" alt="" />
        <span>MAPKLUSS</span>
      </div>
      <p className="route-bootstrap__copy">Не удалось открыть страницу. Проверь соединение и обнови вкладку.</p>
      <a className="public-action public-action--primary" href={window.location.href}>Обновить</a>
    </div>
  </main>
);

const hasStaticBootstrap = path === '/' || examplesIndex || Boolean(examplePage) || wikiPage || Boolean(seoPage);
if (!hasStaticBootstrap) root.render(routeBootstrap);

async function initializeBackend() {
  const { initializeSupabase } = await import('./lib/supabase.ts');
  await initializeSupabase();
}

async function renderApplication() {
  if (buildMatch) {
    const [, { BuildTracker }] = await Promise.all([
      initializeBackend(),
      import('./components/BuildTracker.tsx'),
    ]);
    const sessionId = buildMatch[1];
    root.render(<BuildTracker sessionId={sessionId} />);
  } else if (examplesIndex) {
    const { ExamplesPage } = await import('./components/ExamplesPage.tsx');
    root.render(
      <LocaleProvider>
        <ExamplesPage />
      </LocaleProvider>,
    );
  } else if (path.startsWith('/examples/')) {
    const { ExampleDetailPage, ExampleDetailNotFound } = await import('./components/ExampleDetailPage.tsx');
    root.render(
      <LocaleProvider>
        {examplePage ? <ExampleDetailPage example={examplePage} /> : <ExampleDetailNotFound />}
      </LocaleProvider>,
    );
  } else if (path === '/cloud') {
    const [, { CompanionCloudPage }] = await Promise.all([
      initializeBackend(),
      import('./components/CompanionCloudPage.tsx'),
    ]);
    root.render(
      <LocaleProvider>
        <CompanionCloudPage />
      </LocaleProvider>,
    );
  } else if (wikiPage) {
    const { WikiPage } = await import('./components/WikiPage.tsx');
    root.render(
      <LocaleProvider>
        <WikiPage />
      </LocaleProvider>,
    );
  } else if (path === '/device') {
    const [, { DeviceApprovalPage }] = await Promise.all([
      initializeBackend(),
      import('./components/DeviceApprovalPage.tsx'),
    ]);
    root.render(
      <LocaleProvider>
        <DeviceApprovalPage />
      </LocaleProvider>,
    );
  } else if (companionArtMatch) {
    const [, { CompanionArtPage }] = await Promise.all([
      initializeBackend(),
      import('./components/CompanionArtPage.tsx'),
    ]);
    root.render(
      <LocaleProvider>
        <CompanionArtPage artId={companionArtMatch[1]} />
      </LocaleProvider>,
    );
  } else if (companionCollectionMatch) {
    const [, { CompanionCollectionPage }] = await Promise.all([
      initializeBackend(),
      import('./components/CompanionCollectionPage.tsx'),
    ]);
    root.render(
      <LocaleProvider>
        <CompanionCollectionPage collectionId={companionCollectionMatch[1]} />
      </LocaleProvider>,
    );
  } else if (seoPage) {
    const { SeoLandingPage } = await import('./components/SeoLandingPage.tsx');
    root.render(
      <LocaleProvider>
        <SeoLandingPage page={seoPage} />
      </LocaleProvider>,
    );
  } else {
    const [, { default: App }] = await Promise.all([
      initializeBackend(),
      import('./App.tsx'),
    ]);
    root.render(
      <LocaleProvider>
        <App />
      </LocaleProvider>,
    );
  }
}

void renderApplication().catch((error) => {
  console.error('MapKluss route initialization failed.', error);
  root.render(routeLoadError);
});
