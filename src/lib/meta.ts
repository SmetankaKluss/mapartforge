interface PageMeta {
  title: string;
  description: string;
  url?: string;
}

function setMetaContent(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = content;
}

export function applyPageMeta(meta: PageMeta): void {
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  if (meta.url) setMetaContent('meta[property="og:url"]', meta.url);
}
