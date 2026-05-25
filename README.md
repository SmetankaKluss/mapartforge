# MapKluss

Browser-based Minecraft map art generator and editor.

[Website](https://mapkluss.art)  
[Author](https://github.com/SmetankaKluss)

![MapKluss preview](public/readme-showcase.png)

## What It Does

MapKluss turns images into Minecraft map art directly in the browser. You can preview the result, adjust palette and dithering, work in 2D or 3D stair mode, edit the output, and export files for building in Minecraft.

## Main Features

- Image to Minecraft map art conversion
- 2D Flat and 3D Stair modes
- Palette control with Minecraft version awareness
- Multiple dithering modes, including KlussDither
- Built-in editor with brush, fill, text, layers, selections, undo and redo
- 3D schematic preview
- Export to:
  - PNG
  - MAP.DAT
  - LITEMATIC
  - ZIP
  - materials list
  - showcase image
- Build tracker for larger projects
- Russian and English interface

## How It Works

1. Upload an image.
2. Choose map size, mode, palette, and dithering.
3. Preview the result and edit it if needed.
4. Export the format you need for building.

## Running Locally

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

Type check:

```bash
npx tsc -b --pretty false
```

## Environment Variables

If you want to run share links or build tracker with your own Supabase project, copy `.env.example` to `.env.local` and set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SHARE_BASE_URL=https://mapkluss.art
```

## Tech Stack

- React
- TypeScript
- Vite
- Three.js
- Supabase

## Repository Structure

- `src/components` - UI and editor panels
- `src/lib` - processing, exports, analytics, SEO helpers
- `src/workers` - image processing workers
- `public` - static assets

## Contacts

- Telegram: [@SmetankaKluss](https://t.me/SmetankaKluss)
- Boosty: [boosty.to/klussforge](https://boosty.to/klussforge)
- Website: [mapkluss.art](https://mapkluss.art)

## License

MIT. See [LICENSE](LICENSE).
