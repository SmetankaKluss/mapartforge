# Sponsor Slot Spec for MapKluss

This document defines the contract for a future native sponsor placement inside MapKluss.

## Goal

Support one native sponsor placement without breaking the editor or corrupting trust.

The sponsor unit should:

- fit the existing product style,
- stay clearly identifiable as sponsor content,
- send measurable traffic,
- produce defensible sponsor reports.

## Current code foundation

Prepared in:

- `src/lib/sponsorTracking.ts`
- `src/lib/analytics.ts`

Available helpers:

- `buildSponsorHref`
- `getSponsorLinkProps`
- `openSponsorMenu`
- `useSponsorVisibility`

Tracked events:

- `sponsor_visible`
- `sponsor_button_clicked`
- `sponsor_menu_opened`
- `sponsor_external_link_clicked`

## Data contract

Each sponsor placement should define:

```ts
type SponsorPlacement = {
  slotId: string
  sponsorId: string
  campaignId?: string
  targetUrl: string
  label?: string
}
```

## UTM behavior

Outgoing sponsor links should use:

- `utm_source=mapkluss`
- `utm_medium=native_sponsor`
- `utm_campaign=<campaign_id>`
- `utm_content=<slot_id>`

This is already handled by `buildSponsorHref`.

## Visibility rule

Use `useSponsorVisibility(ref, placement)` when:

- the sponsor block is actually rendered,
- the slot is above zero opacity,
- the slot can enter viewport.

Default threshold is `0.35`.

That means we count a visibility event only after a meaningful part of the placement is actually visible.

## Click rule

Use `getSponsorLinkProps(placement)` on the primary sponsor CTA.

That automatically:

- builds the tracked href,
- sets `rel="sponsored noopener noreferrer"`,
- opens in a new tab,
- tracks both button click and external link click.

## Menu rule

If the sponsor slot has a dropdown or details panel, call:

```ts
openSponsorMenu(placement)
```

when the user opens that menu.

## Recommended UI constraints

Do not implement these as ads that fight the editor.

Good:

- one restrained slot,
- clear sponsor label,
- contextually relevant offer,
- one primary CTA,
- optional compact details expander.

Bad:

- rotating banners,
- autoplay media,
- oversized cards,
- multiple simultaneous sponsor placements,
- interruption overlays.

## Recommended first slot locations

Only test one at a time.

Candidates:

1. right panel, below export block
2. examples page CTA band
3. future docs/help page footer band

Avoid first testing inside the main canvas area.

## Success metrics

Primary:

- sponsor visibility count
- sponsor CTR
- outbound click count

Secondary:

- no clear drop in `image_uploaded`
- no clear drop in `map_generated`
- no clear drop in export events

The sponsor slot should make money without hurting the core workflow.
