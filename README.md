<div align="center">
  <img src="public/logo-opt.png" alt="MapKluss" width="220" />
  <h1>MapKluss</h1>
  <p><strong>Browser editor and generator for Minecraft map art.</strong></p>
  <p>
    <a href="https://mapkluss.art">Website</a> ·
    <a href="https://mapkluss.art/examples">Examples</a> ·
    <a href="https://t.me/SmetankaKluss">Telegram</a> ·
    <a href="https://boosty.to/klussforge">Boosty</a>
  </p>
</div>

![MapKluss editor](public/readme-showcase.png)

MapKluss converts images into buildable Minecraft map art. It combines palette and dithering controls, a pixel editor, 2D and 3D previews, material planning, and export to formats such as PNG, MAP.DAT and LITEMATIC.

The interface is available in Russian and English and works directly in the browser.

## Features

- 2D Flat and 3D Stair map-art modes
- Minecraft-version-aware block palettes
- Multiple dithering and colour-matching modes
- Pixel editing, layers, selections, crop, undo and redo
- Materials list and build tracker
- PNG, MAP.DAT, LITEMATIC and multi-map exports
- Optional account, cloud library and MapKluss Lens integration

## Development

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm test
npm run lint
npm run build
```

Configuration examples are documented in [`.env.example`](.env.example). Never commit real credentials or local environment files.

## Repository layout

- `src/` — React/Vite application and image-processing code
- `public/` — static website assets and downloadable releases
- `supabase/` — database migrations and backend functions
- `deploy/` — backup and public-monitoring tooling
- `docs/` — public changelog and integration contracts

## Русский

MapKluss — браузерный редактор и генератор мап-артов для Minecraft. Здесь можно настроить палитру и дизеринг, вручную исправить пиксели, посмотреть результат в 2D/3D и скачать готовые файлы для строительства.

- Сайт: [mapkluss.art](https://mapkluss.art)
- Обратная связь: [@SmetankaKluss](https://t.me/SmetankaKluss)
- Поддержать проект: [Boosty](https://boosty.to/klussforge)

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a pull request. Please report security-sensitive issues privately according to [SECURITY.md](SECURITY.md).

## License

MapKluss is available under the [MIT License](LICENSE).
