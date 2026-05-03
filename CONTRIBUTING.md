# Contributing to MapKluss

Thanks for helping improve MapKluss. The project is focused on practical Minecraft map art workflows: image conversion, palette control, editing, exporting, examples, and build tracking.

## Local Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npx tsc -b --pretty false
npm run build
```

## Useful Contributions

- Bug reports with a screenshot, browser name, and steps to reproduce
- Feature ideas for map art creation, editing, palette control, export, or building workflow
- Curated gallery examples with original image, MapKluss preview, Minecraft screenshot, mode, size, and palette notes
- Small focused code improvements with clear before/after behavior

## Example Submissions

For gallery examples, include:

- Original image
- MapKluss output PNG
- Minecraft screenshot if available
- Mode: 2D Flat or 3D Stair
- Size: 1x1, 2x2, 4x4 maps, or another grid
- Dithering mode and important settings
- Main materials or palette restrictions

## Pull Request Style

- Keep changes focused on one topic.
- Explain what changed and why.
- Include validation commands you ran.
- Do not commit local screenshots, exported `.litematic` files, `.dat` files, or `.env` files.
