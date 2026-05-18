# Short Video Production Pipeline for MapKluss

This document defines what can be produced with minimal manual editing and what the AI workflow should cover.

## What the AI workflow should do

The production system should handle:

- script
- text overlays
- title
- caption
- CTA
- UTM link
- shot list
- repeated video template structure

## What should stay manual for now

Keep manual:

- choosing the final source image
- quick approval of the result
- occasional screen recording if a live workflow is needed

Do not try to fully automate taste.

## Production modes

### Mode 1. Screen-capture-first

Best starting option.

Inputs:

- selected source image
- recorded screen of MapKluss workflow
- exported result / Minecraft screenshot if available

AI output:

- script
- subtitles
- scene order
- title and caption

Best for:

- comparisons
- tutorials
- export demos

### Mode 2. Programmatic video

Use template-based generation with Remotion-style workflow.

Inputs:

- source image
- preview image
- labels
- metrics
- short script

AI output:

- templated vertical video
- animated text
- repeated branded sequence

Best for:

- repeatable transformation clips
- comparison clips
- gallery/example clips

### Mode 3. Hybrid

Mix live screen recording and templated sections.

Best for:

- `source -> process -> result`
- `comparison -> decision -> export`

## What I can do directly

I can already do:

- content planning
- video scripting
- hook writing
- subtitle text
- CTA writing
- title/caption generation
- UTM-link preparation
- production template planning

## Skill/tool status

Available and useful now:

- `marketing-skills:social`
- `marketing-skills:video`
- `remotion-best-practices`
- `imagegen`

Attempted:

- installation of a stronger external Remotion production skill

Current blocker:

- external skill installation is unreliable in this environment because public package resolution is inconsistent and git auth state is brittle

This does not block strategy, scripting, or template planning.

## Recommended next implementation step

If we want near-automatic production later, the next real build step is:

1. create one vertical Remotion template
2. feed it:
   - source image
   - preview image
   - headline
   - 3-4 overlays
   - CTA
3. render first 3 formats:
   - transformation
   - 2D vs 3D comparison
   - export workflow

That would be the first meaningful “AI can produce the video almost by itself” milestone.
