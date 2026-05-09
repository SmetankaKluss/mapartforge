type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: 'event' | 'config' | 'js', target: string | Date, params?: AnalyticsParams) => void;
    clarity?: ((command: string, ...args: unknown[]) => void) & { q?: unknown[] };
  }
}

function cleanParams(params: AnalyticsParams = {}): AnalyticsParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  ) as AnalyticsParams;
}

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', name, cleanParams(params));
}

export function initClarity(projectId: string | undefined): void {
  if (!projectId || typeof window === 'undefined' || window.clarity) return;

  window.clarity = function clarityShim(...args: unknown[]) {
    window.clarity!.q = window.clarity!.q || [];
    window.clarity!.q!.push(args);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);
}
