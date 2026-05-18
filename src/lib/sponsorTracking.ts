import { useEffect, useRef, type RefObject } from 'react';
import {
  trackSponsorButtonClicked,
  trackSponsorExternalLinkClicked,
  trackSponsorMenuOpened,
  trackSponsorVisible,
} from './analytics';

export interface SponsorPlacement {
  slotId: string;
  sponsorId: string;
  campaignId?: string;
  targetUrl: string;
  label?: string;
}

function appendSponsorUtm(url: URL, placement: SponsorPlacement): URL {
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'mapkluss');
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'native_sponsor');
  if (!url.searchParams.has('utm_campaign') && placement.campaignId) url.searchParams.set('utm_campaign', placement.campaignId);
  if (!url.searchParams.has('utm_content')) url.searchParams.set('utm_content', placement.slotId);
  return url;
}

export function buildSponsorHref(placement: SponsorPlacement): string {
  if (typeof window === 'undefined') return placement.targetUrl;
  try {
    const url = new URL(placement.targetUrl, window.location.origin);
    return appendSponsorUtm(url, placement).toString();
  } catch {
    return placement.targetUrl;
  }
}

export function getSponsorLinkProps(placement: SponsorPlacement) {
  const href = buildSponsorHref(placement);
  let targetHost: string | undefined;
  try {
    targetHost = new URL(href, typeof window !== 'undefined' ? window.location.origin : undefined).host;
  } catch {
    targetHost = undefined;
  }

  return {
    href,
    rel: 'sponsored noopener noreferrer',
    target: '_blank',
    onClick: () => {
      trackSponsorButtonClicked(placement.slotId, placement.sponsorId, placement.campaignId);
      trackSponsorExternalLinkClicked(placement.slotId, placement.sponsorId, placement.campaignId, targetHost);
    },
  } as const;
}

export function openSponsorMenu(placement: SponsorPlacement): void {
  trackSponsorMenuOpened(placement.slotId, placement.sponsorId, placement.campaignId);
}

export function useSponsorVisibility(
  ref: RefObject<Element | null>,
  placement: SponsorPlacement,
  enabled = true,
  threshold = 0.35,
): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ref.current || firedRef.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting || entry.intersectionRatio < threshold || firedRef.current) return;
        firedRef.current = true;
        trackSponsorVisible(placement.slotId, placement.sponsorId, placement.campaignId);
        observer.disconnect();
      },
      { threshold: [threshold] },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, placement.campaignId, placement.slotId, placement.sponsorId, ref, threshold]);
}
