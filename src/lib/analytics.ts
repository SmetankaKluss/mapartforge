type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;
type AttributionSnapshot = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  clickId?: string;
  landingPath?: string;
  referrerHost?: string;
  kind?: 'direct' | 'referral' | 'campaign';
};

const ATTRIBUTION_STORAGE_KEY = 'mapkluss_attribution_v1';
const ATTRIBUTION_QUERY_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'] as const;

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

function getReferrerHost(): string | undefined {
  if (typeof document === 'undefined' || !document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    if (url.host === window.location.host) return undefined;
    return url.host;
  } catch {
    return undefined;
  }
}

function readStoredAttribution(): AttributionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AttributionSnapshot;
  } catch {
    return null;
  }
}

function writeStoredAttribution(snapshot: AttributionSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures
  }
}

function getCurrentAttributionFromLocation(): AttributionSnapshot {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source') ?? undefined;
  const medium = params.get('utm_medium') ?? undefined;
  const campaign = params.get('utm_campaign') ?? undefined;
  const content = params.get('utm_content') ?? undefined;
  const term = params.get('utm_term') ?? undefined;
  const clickId = params.get('gclid') ?? params.get('fbclid') ?? undefined;
  const referrerHost = getReferrerHost();
  const landingPath = `${window.location.pathname}${window.location.search}`;

  let kind: AttributionSnapshot['kind'];
  if (source || medium || campaign || content || term || clickId) kind = 'campaign';
  else if (referrerHost) kind = 'referral';
  else kind = 'direct';

  return { source, medium, campaign, content, term, clickId, landingPath, referrerHost, kind };
}

function getAttributionParams(): AnalyticsParams {
  const attribution = readStoredAttribution();
  if (!attribution) return {};
  return cleanParams({
    session_source: attribution.source,
    session_medium: attribution.medium,
    session_campaign: attribution.campaign,
    session_content: attribution.content,
    session_term: attribution.term,
    session_click_id: attribution.clickId,
    landing_path: attribution.landingPath,
    landing_referrer_host: attribution.referrerHost,
    acquisition_kind: attribution.kind,
  });
}

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', name, cleanParams({ ...getAttributionParams(), ...params }));
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

export function initAnalyticsContext(): void {
  if (typeof window === 'undefined') return;
  const current = getCurrentAttributionFromLocation();
  const stored = readStoredAttribution();
  const hasCurrentSignal = current.kind === 'campaign' || current.kind === 'referral';

  if (hasCurrentSignal || !stored) {
    writeStoredAttribution(current);
  }
}

export function buildTrackedHref(href: string): string {
  if (typeof window === 'undefined') return href;
  if (!href.startsWith('/')) return href;

  const url = new URL(href, window.location.origin);
  const currentParams = new URLSearchParams(window.location.search);
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function trackSponsorVisible(slotId: string, sponsorId: string, campaignId?: string): void {
  trackEvent('sponsor_visible', { slot_id: slotId, sponsor_id: sponsorId, campaign_id: campaignId });
}

export function trackSponsorButtonClicked(slotId: string, sponsorId: string, campaignId?: string): void {
  trackEvent('sponsor_button_clicked', { slot_id: slotId, sponsor_id: sponsorId, campaign_id: campaignId });
}

export function trackSponsorMenuOpened(slotId: string, sponsorId: string, campaignId?: string): void {
  trackEvent('sponsor_menu_opened', { slot_id: slotId, sponsor_id: sponsorId, campaign_id: campaignId });
}

export function trackSponsorExternalLinkClicked(slotId: string, sponsorId: string, campaignId?: string, targetHost?: string): void {
  trackEvent('sponsor_external_link_clicked', {
    slot_id: slotId,
    sponsor_id: sponsorId,
    campaign_id: campaignId,
    target_host: targetHost,
  });
}
