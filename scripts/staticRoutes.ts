import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedConfig, Plugin } from 'vite';
import { EXAMPLES, type ExampleProject } from '../src/lib/examples';
import { canonicalPublicPath, getSeoPageByPath, SEO_PAGES, type SeoPageDefinition } from '../src/lib/seoPages';
import { WIKI_ARTICLES } from '../src/lib/wiki';

const SITE_ORIGIN = 'https://mapkluss.art';
const STATIC_START = '<!-- mapkluss-static:start -->';
const STATIC_END = '<!-- mapkluss-static:end -->';

interface StaticRoute {
  routePath: string;
  title: string;
  description: string;
  image: string;
  content: string;
  schema: unknown;
}

const APP_SHELL_ROUTES = [
  {
    routePath: '/cloud',
    title: 'Cloud & MapKluss Companion | MapKluss',
    description: 'Sign in to MapKluss Cloud to save map art projects, manage versions and collections, and continue in Minecraft Companion.',
  },
  {
    routePath: '/device',
    title: 'Connect MapKluss Companion | MapKluss',
    description: 'Approve a secure device code to connect MapKluss Companion in Minecraft to your MapKluss account.',
  },
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function staticNav(): string {
  return `<header class="route-static__header">
    <a class="route-static__brand" href="/"><img src="/logo-opt.png" width="40" height="40" alt=""><span>MAPKLUSS<small>MINECRAFT MAP ART WORKSHOP</small></span></a>
    <nav aria-label="Primary navigation"><a href="/">Editor</a><a href="/examples/">Examples</a><a href="/wiki/">Wiki</a><a href="/minecraft-map-art-generator/">Guide</a></nav>
  </header>`;
}

function staticShell(content: string): string {
  return `<main class="route-static">${staticNav()}<div class="route-static__content">${content}</div></main>`;
}

function renderSeoPage(page: SeoPageDefinition): string {
  const examples = EXAMPLES.filter(example => page.exampleIds.includes(example.id));
  const related = page.related.filter(link => Boolean(getSeoPageByPath(link.href)));
  return staticShell(`
    <p class="route-static__kicker">${escapeHtml(page.kickerEn)}</p>
    <h1>${escapeHtml(page.h1En)}</h1>
    <p class="route-static__lead">${escapeHtml(page.introEn)}</p>
    <p>${escapeHtml(page.bodyEn)}</p>
    <p class="route-static__actions"><a href="/">Open editor</a><a href="/examples/">View examples</a></p>
    <section><h2>What MapKluss provides</h2><ul>${page.highlightsEn.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
    <section><h2>Workflow</h2><ol>${page.workflowEn.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>
    ${examples.length ? `<section><h2>Examples</h2><div class="route-static__grid">${examples.map(example => `<article><img src="${escapeHtml(example.previewUrl)}" width="256" height="256" alt="${escapeHtml(example.titleEn)} Minecraft map art preview"><h3><a href="/examples/${escapeHtml(example.id)}/">${escapeHtml(example.titleEn)}</a></h3><p>${escapeHtml(example.descriptionEn)}</p></article>`).join('')}</div></section>` : ''}
    <section><h2>Frequently asked questions</h2>${page.faq.map(item => `<details><summary>${escapeHtml(item.questionEn)}</summary><p>${escapeHtml(item.answerEn)}</p></details>`).join('')}</section>
    ${related.length ? `<section><h2>Related guides</h2><ul>${related.map(link => `<li><a href="${canonicalPublicPath(link.href)}">${escapeHtml(link.labelEn)}</a></li>`).join('')}</ul></section>` : ''}
  `);
}

function renderExamplesIndex(): string {
  return staticShell(`
    <p class="route-static__kicker">Verified output</p>
    <h1>Minecraft Map Art Examples</h1>
    <p class="route-static__lead">Compare source images with real PNG previews exported by MapKluss, then open any setup in the editor.</p>
    <p class="route-static__actions"><a href="/">Open editor</a><a href="/minecraft-map-art-generator/">Read the guide</a></p>
    <section class="route-static__grid">${EXAMPLES.map(example => `<article><img src="${escapeHtml(example.previewUrl)}" width="256" height="256" alt="${escapeHtml(example.titleEn)} Minecraft map art preview"><h2><a href="/examples/${escapeHtml(example.id)}/">${escapeHtml(example.titleEn)}</a></h2><p>${escapeHtml(example.descriptionEn)}</p><small>${escapeHtml(example.size)} · ${example.mode === '3d' ? '3D Stair' : '2D Flat'} · ${example.colors} colours</small></article>`).join('')}</section>
  `);
}

function renderExampleDetail(example: ExampleProject): string {
  return staticShell(`
    <p class="route-static__kicker"><a href="/examples/">Examples</a></p>
    <h1>${escapeHtml(example.titleEn)}</h1>
    <p class="route-static__lead">${escapeHtml(example.descriptionEn)}</p>
    <p>${escapeHtml(example.size)} · ${example.mode === '3d' ? '3D Stair' : '2D Flat'} · ${example.colors} colours · ${escapeHtml(example.trySettings.dithering)} dithering</p>
    <p class="route-static__actions"><a href="/?example=${encodeURIComponent(example.id)}">Open in editor</a><a href="/examples/">All examples</a></p>
    <section class="route-static__compare"><figure><img src="${escapeHtml(example.originalUrl)}" alt="${escapeHtml(example.titleEn)} source image"><figcaption>Source</figcaption></figure><figure><img src="${escapeHtml(example.previewUrl)}" alt="${escapeHtml(example.titleEn)} MapKluss result"><figcaption>MapKluss result</figcaption></figure></section>
  `);
}

function renderWiki(): string {
  return staticShell(`
    <p class="route-static__kicker">Documentation</p>
    <h1>MapKluss Wiki</h1>
    <p class="route-static__lead">Learn the editor, exports, Cloud, Companion, Lens, AutoFrame, and Two-layer workflows.</p>
    <p class="route-static__actions"><a href="/">Open editor</a><a href="/examples/">View examples</a></p>
    <section class="route-static__wiki">${WIKI_ARTICLES.map(article => `<article id="${escapeHtml(article.id)}"><h2>${escapeHtml(article.titleEn)}</h2><p>${escapeHtml(article.summaryEn)}</p></article>`).join('')}</section>
  `);
}

function replaceMeta(html: string, attribute: 'name' | 'property', key: string, content: string): string {
  const pattern = new RegExp(`<meta ${attribute}="${key}" content="[^"]*" \\/>`);
  return html.replace(pattern, `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`);
}

function renderRouteHtml(template: string, route: StaticRoute): string {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPublicPath(route.routePath)}`;
  const schemaJson = JSON.stringify(route.schema).replaceAll('<', '\\u003c');
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(new RegExp(`${STATIC_START}[\\s\\S]*?${STATIC_END}`), `${STATIC_START}\n${route.content}\n${STATIC_END}`)
    .replace(/<script id="mapkluss-page-schema" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="mapkluss-page-schema" type="application/ld+json">${schemaJson}</script>`);
  html = replaceMeta(html, 'name', 'description', route.description);
  html = replaceMeta(html, 'name', 'robots', 'index,follow');
  html = replaceMeta(html, 'property', 'og:title', route.title);
  html = replaceMeta(html, 'property', 'og:description', route.description);
  html = replaceMeta(html, 'property', 'og:image', `${SITE_ORIGIN}${route.image}`);
  html = replaceMeta(html, 'property', 'og:url', canonicalUrl);
  html = replaceMeta(html, 'name', 'twitter:title', route.title);
  html = replaceMeta(html, 'name', 'twitter:description', route.description);
  html = replaceMeta(html, 'name', 'twitter:image', `${SITE_ORIGIN}${route.image}`);
  return html;
}

function renderAppShellHtml(
  template: string,
  route: (typeof APP_SHELL_ROUTES)[number],
): string {
  const canonicalUrl = `${SITE_ORIGIN}${route.routePath}`;
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(new RegExp(`${STATIC_START}[\\s\\S]*?${STATIC_END}`), `${STATIC_START}\n${STATIC_END}`);
  html = replaceMeta(html, 'name', 'description', route.description);
  html = replaceMeta(html, 'name', 'robots', 'noindex,follow');
  html = replaceMeta(html, 'property', 'og:title', route.title);
  html = replaceMeta(html, 'property', 'og:description', route.description);
  html = replaceMeta(html, 'property', 'og:url', canonicalUrl);
  html = replaceMeta(html, 'name', 'twitter:title', route.title);
  html = replaceMeta(html, 'name', 'twitter:description', route.description);
  return html;
}

function buildRoutes(): StaticRoute[] {
  const routes: StaticRoute[] = [
    {
      routePath: '/examples',
      title: 'Minecraft Map Art Examples | MapKluss',
      description: 'Browse real Minecraft map art examples exported by MapKluss. Compare source images, 2D and 3D results, sizes, colours, and dithering settings.',
      image: '/og-image.png',
      content: renderExamplesIndex(),
      schema: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Minecraft Map Art Examples',
        url: `${SITE_ORIGIN}/examples/`,
        mainEntity: { '@type': 'ItemList', itemListElement: EXAMPLES.map((example, index) => ({ '@type': 'ListItem', position: index + 1, name: example.titleEn, url: `${SITE_ORIGIN}/examples/${example.id}/` })) },
      },
    },
    {
      routePath: '/wiki',
      title: 'MapKluss Wiki | Minecraft Map Art Guides',
      description: 'Learn how to use the MapKluss editor, exports, Cloud, Companion, Lens, AutoFrame, and Two-layer Minecraft map art workflows.',
      image: '/og-image.png',
      content: renderWiki(),
      schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'MapKluss Wiki', url: `${SITE_ORIGIN}/wiki/` },
    },
  ];

  for (const example of EXAMPLES) {
    const routePath = `/examples/${example.id}`;
    routes.push({
      routePath,
      title: `${example.titleEn} | MapKluss`,
      description: `${example.titleEn}: a verified source-to-MapKluss comparison at ${example.size}, ${example.mode === '3d' ? '3D Stair' : '2D Flat'}, using ${example.trySettings.dithering} dithering.`,
      image: example.previewUrl,
      content: renderExampleDetail(example),
      schema: { '@context': 'https://schema.org', '@type': 'CreativeWork', name: example.titleEn, description: example.descriptionEn, image: `${SITE_ORIGIN}${example.previewUrl}`, url: `${SITE_ORIGIN}${canonicalPublicPath(routePath)}` },
    });
  }

  for (const page of SEO_PAGES) {
    routes.push({
      routePath: page.path,
      title: page.title,
      description: page.description,
      image: EXAMPLES.find(example => page.exampleIds.includes(example.id))?.previewUrl ?? '/og-image.png',
      content: renderSeoPage(page),
      schema: [
        { '@context': 'https://schema.org', '@type': 'WebPage', name: page.h1En, description: page.description, url: `${SITE_ORIGIN}${canonicalPublicPath(page.path)}` },
        { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map(item => ({ '@type': 'Question', name: item.questionEn, acceptedAnswer: { '@type': 'Answer', text: item.answerEn } })) },
      ],
    });
  }
  return routes;
}

function renderSitemap(routes: StaticRoute[]): string {
  const urls = ['/', ...routes.map(route => canonicalPublicPath(route.routePath))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${SITE_ORIGIN}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function staticPublicRoutes(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'mapkluss-static-public-routes',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const indexPath = path.join(outDir, 'index.html');
      const template = await readFile(indexPath, 'utf8');
      const routes = buildRoutes();
      for (const route of routes) {
        const directory = path.join(outDir, ...route.routePath.split('/').filter(Boolean));
        await mkdir(directory, { recursive: true });
        const html = renderRouteHtml(template, route);
        if (!html.includes('<h1>') || !html.includes(`href="${SITE_ORIGIN}${canonicalPublicPath(route.routePath)}"`)) {
          throw new Error(`Invalid static page generated for ${route.routePath}`);
        }
        await writeFile(path.join(directory, 'index.html'), html, 'utf8');
      }
      for (const route of APP_SHELL_ROUTES) {
        const directory = path.join(outDir, ...route.routePath.split('/').filter(Boolean));
        await mkdir(directory, { recursive: true });
        const html = renderAppShellHtml(template, route);
        if (!html.includes(`<link rel="canonical" href="${SITE_ORIGIN}${route.routePath}" />`)) {
          throw new Error(`Invalid application shell generated for ${route.routePath}`);
        }
        await writeFile(path.join(directory, 'index.html'), html, 'utf8');
      }
      await writeFile(path.join(outDir, 'sitemap.xml'), renderSitemap(routes), 'utf8');
    },
  };
}
