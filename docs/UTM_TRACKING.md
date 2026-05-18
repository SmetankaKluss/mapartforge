# UTM Tracking for MapKluss

This document defines the practical UTM naming rules for traffic sent to `mapkluss.art`.

## Why this exists

MapKluss now stores attribution on first visit and forwards it into analytics events such as:

- `app_route_opened`
- `image_uploaded`
- `map_generated`
- `litematic_exported`
- `dat_exported`
- `share_link_copied`

That means the value of UTM tags is no longer just session counting. We can now compare channels against real activation and export behavior.

## Required parameters

Always set:

- `utm_source`
- `utm_medium`

Set when relevant:

- `utm_campaign`
- `utm_content`
- `utm_term`

## Naming rules

Keep all values lowercase and underscore-separated.

Good:

- `utm_source=youtube`
- `utm_medium=shorts`
- `utm_campaign=mapartcraft_alternative`
- `utm_content=anime_portrait_demo`

Bad:

- `utm_source=YouTube Shorts`
- `utm_medium=Video`
- `utm_campaign=May Campaign 1`

## Recommended values by channel

### YouTube Shorts

- `utm_source=youtube`
- `utm_medium=shorts`
- `utm_campaign=<topic_or_series>`
- `utm_content=<video_slug>`

Example:

`https://mapkluss.art/?utm_source=youtube&utm_medium=shorts&utm_campaign=mapart_basics&utm_content=2d_vs_3d_demo`

### TikTok

- `utm_source=tiktok`
- `utm_medium=shorts`
- `utm_campaign=<topic_or_series>`
- `utm_content=<video_slug>`

### VK Clips

- `utm_source=vk`
- `utm_medium=clips`
- `utm_campaign=<topic_or_series>`
- `utm_content=<video_slug>`

### Telegram post

- `utm_source=telegram`
- `utm_medium=post`
- `utm_campaign=<channel_or_topic>`
- `utm_content=<post_slug>`

### Discord / community post

- `utm_source=discord`
- `utm_medium=community`
- `utm_campaign=<server_or_topic>`
- `utm_content=<post_slug>`

### Reddit

- `utm_source=reddit`
- `utm_medium=community`
- `utm_campaign=<subreddit_or_topic>`
- `utm_content=<post_slug>`

### Sponsor traffic

Handled by sponsor helpers automatically:

- `utm_source=mapkluss`
- `utm_medium=native_sponsor`
- `utm_campaign=<campaign_id>`
- `utm_content=<slot_id>`

## Page-level recommendations

### Send to homepage/editor when:

- the post is about using the tool directly
- the CTA is "try it now"

Use:

- `/`

### Send to gallery when:

- the post is about outcomes, examples, or quality comparisons

Use:

- `/examples`
- `/examples/<example-id>`

### Send to SEO pages when:

- the post is educational or comparative

Use:

- `/minecraft-map-art-generator`
- `/mapartcraft-alternative`
- `/minecraft-litematic-map-art-generator`
- `/minecraft-map-dat-generator`
- `/how-to-make-minecraft-map-art`
- `/best-dithering-for-minecraft-map-art`
- `/2d-vs-3d-stair-map-art`

## What to check in GA4

For each source / medium / campaign, compare:

- sessions
- `image_uploaded`
- `map_generated`
- `litematic_exported`
- `dat_exported`

The real goal is not "which source got clicks", but "which source got people to upload and export".
