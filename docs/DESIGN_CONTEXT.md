## Design Context

### Users

Minecraft players, pixel artists, and map creators who want to convert images into in-game map art. They use the tool with a specific creative goal — get the image looking right, pick the right block palette, tweak the dithering, and export. They value **functional accuracy** (correct dithering algorithm, faithful block colors) and **visual comfort** connected to the game world. They may spend long focused sessions comparing before/after results, painting corrections directly on canvas, or adjusting the 352-block palette. They are not enterprise users — they are creative people who care about the craft of the output.

### Brand Personality

**Sharp, deliberate, game-native.**

- Sharp: zero border-radius, 1px borders, precise alignment. Nothing soft or rounded.
- Deliberate: every UI element has a reason to exist. No decorative card grids, no filler sections.
- Game-native: references Minecraft and terminal game UIs without nostalgia-kitsch. Feels like a professional game editor, not a retro toy.

### Aesthetic Direction

**Dark workspace.** Background #080810 (near-black with a cool blue tint) — like a darkroom, a game engine editor, a late-night creative session. Not oppressive darkness — purposeful.

**Accent palette**:
- Primary accent: `#57FF6E` — electric lime green. Precise, alive, not screaming. Used sparingly.
- Secondary: `#FFD700` — gold for secondary affordances, highlights.
- Danger: `#FF4444`
- Text primary: `rgba(255,255,255,0.9)`
- Text muted: `rgba(255,255,255,0.5)`

**Typography**:
- Headers/labels: `Press Start 2P` — pixel font that speaks to Minecraft/game heritage. Dignified, not cute.
- Body/values: `JetBrains Mono` — monospace precision. Every character earns its space.

**Component language**:
- Zero border-radius everywhere (sharp pixel corners — non-negotiable)
- Borders: `1px solid rgba(87,255,110,0.3)` default
- Active/selected: `2px border + bg rgba(87,255,110,0.1)`
- Hover: subtle green glow via `box-shadow` + slight brightness boost
- Click: `scale(0.97)` 80ms
- Page load: staggered fade-in with 50ms delays

**Anti-references**:
- NOT: screaming cyberpunk neon (no blinding color storms, no 10-color gradients)
- NOT: overloaded card dashboards (no identical card grids with icon + heading + text repeated endlessly)
- NOT: generic tech aesthetics (no cyan-on-dark, no purple glow orbs, no gradient text)
- NOT: retro pastiche (not trying to look like NES — modern precision with pixel-art discipline)

### Design Principles

1. **Tools serve the art** — when the user is working on their image, the UI steps back. The canvas and the output are the hero.
2. **Precision over decoration** — every pixel of interface is deliberate. If an element doesn't do a job, it shouldn't exist.
3. **Game-native familiarity** — the interface should feel like a professional game editor: HUD-like, functional, alive with feedback.
4. **Calm dark workspace** — comfortable for long creative sessions. Not exciting for its own sake — steady and dependable.
5. **Reward interaction** — hover glows, click responses, staggered reveals. Every interaction should feel satisfying, like a well-crafted game UI.
