interface PageMeta {
  title: string;
  description: string;
  url?: string;
  image?: string;
  canonical?: string;
  robots?: string;
  schema?: unknown;
}

function upsertMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertCanonical(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function upsertSchema(schema: unknown): void {
  const id = 'mapkluss-page-schema';
  const existing = document.getElementById(id);
  if (!schema) {
    existing?.remove();
    return;
  }

  const script = existing ?? document.createElement('script');
  script.id = id;
  script.setAttribute('type', 'application/ld+json');
  script.textContent = JSON.stringify(schema);
  if (!existing) document.head.appendChild(script);
}

export function applyPageMeta(meta: PageMeta): void {
  document.title = meta.title;
  upsertMeta('description', meta.description);
  upsertMeta('robots', meta.robots ?? 'index,follow');
  upsertMeta('og:title', meta.title, 'property');
  upsertMeta('og:description', meta.description, 'property');
  upsertMeta('twitter:card', 'summary_large_image');
  upsertMeta('twitter:title', meta.title);
  upsertMeta('twitter:description', meta.description);

  const canonical = meta.canonical ?? meta.url ?? window.location.href;
  upsertCanonical(canonical);

  if (meta.url) upsertMeta('og:url', meta.url, 'property');
  if (meta.image) {
    upsertMeta('og:image', meta.image, 'property');
    upsertMeta('og:image:alt', meta.title, 'property');
    upsertMeta('twitter:image', meta.image);
    upsertMeta('twitter:image:alt', meta.title);
  }

  upsertSchema(meta.schema);
}
