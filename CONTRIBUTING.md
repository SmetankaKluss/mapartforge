# Contributing to MapKluss

MapKluss is built for people who make map art in real worlds, so the most useful contributions usually start with a concrete annoyance: a palette that gives the wrong result, an export that is awkward to use, or a step that makes a build take longer than it should.

## Before writing code

Open an issue first for anything larger than a focused fix. A screenshot, browser version and short reproduction path are often enough to turn a vague report into something we can fix.

Useful contributions include:

- Bugs in image conversion, palettes, editor tools, exports or Cloud workflows
- Carefully tested map-art examples with their source image and Minecraft result
- Small improvements that make a repeated builder workflow clearer or faster
- Documentation corrections, especially where a current Minecraft version behaves differently

## Gallery examples

Please include the original image, the MapKluss PNG, a Minecraft screenshot when possible, map size, build mode, dithering choice and any important palette restrictions. This gives other builders something they can reproduce rather than just admire.

## Local work

Install Node.js 22 or newer, then run:

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

Keep a pull request focused. Say what changed, why it matters, and what you tested. Add or update tests whenever behavior changes.

Never commit credentials, local environment files, logs, personal paths, editor state, temporary screenshots, exported `.litematic` or `.dat` files, or private project notes.
