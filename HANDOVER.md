---

# KlussForge — Project Report

**Date:** March 2026

---

## 1. What is the project about?

**KlussForge** is a browser-based Minecraft map art generator built for the community by SmetankaKluss. It lets players upload any image, apply color quantization and dithering to Minecraft's 244-color map palette, and export the result as a playable schematic or `map.dat` file — ready to be imported into the game via Litematica or the map item system.

The goal is to be a more powerful and accurate alternative to existing tools like mapartcraft, with a focus on dithering quality, custom palettes, and a modern UX.

---

## 2. What has already been implemented

- **Image upload** — drag-and-drop or file picker
- **Multi-map grid sizing** — 1×1 up to large multi-map spans (128px per map unit)
- **Dithering algorithms** — Floyd-Steinberg, Atkinson, Bayer, None, and the custom **KlussDither** tuned for anime/illustrations
- **Color adjustments** — brightness, contrast, saturation, dithering intensity sliders with manual value input
- **Block palette editor** — toggle individual blocks per color group, full block picker popup, palette share via URL
- **Block texture preview mode** — renders each pixel as its actual Minecraft block texture
- **Before/after compare slider** — `CompareView` component to visually diff original vs processed
- **Materials list** — total block counts grouped by type
- **Export panel** — `.litematic` (via Litematica NBT), `map.dat`, and PNG export
- **Share links** — full settings serialized to URL (lz-string compressed), palette share separately via Supabase
- **Web Worker** — image processing offloaded to `processor.worker.ts`, keeping UI responsive during heavy dithering
- **Responsive layout** — three-panel desktop, tablet drawer mode, full mobile tab layout
- **Onboarding tour** — driver.js tour with pixel-art theme, skippable, restartable via `[? GUIDE]` button
- **Vercel Analytics** — passive visit tracking
- **Exponential zoom slider** — maps 0–100 → 50%–800% with no dead zones; all sliders have editable number inputs

---

## 3. Technical stack and important decisions

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Bundler | Vite 8 |
| Styling | Plain CSS (pixel-art / dark theme, JetBrains Mono + Press Start 2P) |
| Color math | OKLAB perceptual color space for palette matching |
| Heavy compute | Web Worker (`processor.worker.ts`), `ImageBitmap` transfer |
| Palette state | localStorage persistence (`localStorage.ts`) |
| Share / links | lz-string URL encoding + Supabase for palette presets |
| Export | Custom NBT encoder (`nbt.ts`), manual `.litematic` and `map.dat` serialization |
| Analytics | `@vercel/analytics` |
| Hosting | Vercel (`klussforge.vercel.app`) |

**Key decisions:**
- `ImageBitmap` (not `HTMLImageElement`) is transferred to the worker — `HTMLImageElement` is not structured-cloneable
- Worker is terminated and recreated for cancellation, avoiding stale-job race conditions
- CSS `order` properties handle mobile reordering without changing DOM structure

---

## 4. Current bugs / TODO

- [ ] Cancel button during processing appears after 500ms — verify it reliably shows on slow devices
- [ ] Block texture mode may be slow on large grids (no tile caching yet)
- [ ] Tablet drawer `slideFromRight` animation required `animation: none` override — fragile if base animation changes
- [ ] No error boundary around the export flow — a corrupt palette state can silently produce a bad file
- [ ] Palette share (Supabase) has no rate limiting or abuse protection on the client side
- [ ] Mobile: very long palette lists overflow without virtual scrolling

---

## 5. Ideas for the future

- **Undo / history** — multi-step undo of processing changes
- **Crop / aspect-fit tool** — pre-crop to exact map grid ratio before processing
- **`.schematic` export** — for older mod versions (not just `.litematic`)
- **Side-by-side algorithm comparison** — pick two dithering modes and preview both simultaneously
- **Dark/light/checkerboard canvas background** — see how art looks in different frame contexts
- **Map frame border preview** — render output inside a Minecraft item frame mockup
- **Gallery / demo images** — a few built-in example images that auto-process on the landing page
- **Block count in export filename** — e.g. `mapart_2x3_floyd_256x384.litematic`
- **`/give` command generator** — copy Minecraft commands for each map ID in a multi-map grid
- **PWA / offline mode** — the entire tool is local-compute, so a service worker would make it fully offline-capable
