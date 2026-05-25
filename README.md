# MapKluss

Minecraft map art generator for browser-based workflow, preview, editing, and export.

[Open MapKluss](https://mapkluss.art) • [Telegram](https://t.me/SmetankaKluss) • [Boosty](https://boosty.to/klussforge)

![MapKluss preview](public/readme-showcase.png)

MapKluss converts images into Minecraft map art directly in the browser. It is built for players who want a cleaner workflow than older map art tools: preview first, tune palette and dithering, choose 2D or 3D stair mode, then export files that are actually useful for building.

## What You Can Do

- Convert any image into Minecraft map art
- Switch between 2D Flat and 3D Stair
- Tune palette, blocks, size, and dithering
- Edit the result inside the built-in editor
- Preview the schematic in 3D
- Export files for real building workflow

## Exports

- `PNG`
- `MAP.DAT`
- `LITEMATIC`
- `ZIP`
- materials list
- showcase image

## Main Features

- Browser-based workflow, no desktop install required
- Minecraft version-aware palette filtering
- Multiple dithering modes, including KlussDither
- Built-in editor with brush, fill, text, layers, selections, undo and redo
- Build tracker for larger projects
- Russian and English interface

## How To Use

1. Upload an image
2. Choose map size and mode
3. Adjust palette and dithering
4. Preview and edit if needed
5. Export the result for Minecraft

## Who It Is For

- survival builders
- map art makers
- technical Minecraft players
- server communities
- creators who need `.litematic`, `.dat`, and materials in one workflow

## Links

- Website: [mapkluss.art](https://mapkluss.art)
- Examples: [mapkluss.art/examples](https://mapkluss.art/examples)
- Telegram: [@SmetankaKluss](https://t.me/SmetankaKluss)
- Boosty: [boosty.to/klussforge](https://boosty.to/klussforge)

## Development

<details>
<summary>Local setup</summary>

### Run locally

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Type check

```bash
npx tsc -b --pretty false
```

### Environment variables

If you want to run share links or build tracker with your own Supabase project, copy `.env.example` to `.env.local` and set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SHARE_BASE_URL=https://mapkluss.art
```

</details>

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
