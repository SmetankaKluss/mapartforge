# Правила работы

- Отвечай кратко и по делу. Не объясняй очевидное.
- Читай только те файлы которые нужны для конкретной задачи.
- Не читай весь проект при каждом запросе.
- Перед тем как что-то менять — спроси если непонятно.
- Делай одно изменение за раз, не несколько файлов сразу без причины.
- Не повторяй код который я уже вижу — показывай только изменения.
- Используй /compact если разговор становится длинным.

## Поиск по коду
Before reading files or exploring directories, always use qmd 
to search for information. Use qmd search for quick lookups, 
qmd query for complex questions. Use Read/Glob only if qmd 
returns no results.

# MapKluss Design System

## Aesthetic direction
Pixel-art terminal tool. Dark, precise, alive. Every interaction should feel
satisfying. Think: professional game UI meets dev tool.

## Colors
- Background: #080810
- Primary accent: #57FF6E (green)
- Secondary: #FFD700 (gold)  
- Danger: #FF4444
- Text primary: rgba(255,255,255,0.9)
- Text muted: rgba(255,255,255,0.5)

## Fonts
- Headers/labels: Press Start 2P
- Body/values: JetBrains Mono

## Animation rules
- All transitions: 150-200ms ease-out
- Hover: subtle glow box-shadow + 2% brightness boost
- Click: scale(0.97) 80ms
- Page load: staggered fade-in with 50ms delays
- Never: jarring instant changes, bouncy springs

## Component rules
- Zero border-radius everywhere (sharp pixel corners)
- Borders: 1px solid rgba(87,255,110,0.3) default
- Active/selected: 2px border + bg rgba(87,255,110,0.1)
- No shadows except glow effects on hover

## What makes this site special
- KlussDither algorithm unique to this site
- Before/after split slider
- Full palette editor with 352 blocks
- Paint tools directly on canvas

## Design Context

### Users
Minecraft players, pixel artists, and map creators who convert images into in-game map art. They value functional accuracy (correct dithering, faithful block colors) and visual comfort connected to the game. They spend focused sessions comparing before/after results, adjusting the 352-block palette, and painting corrections directly on canvas.

### Brand Personality
**Sharp, deliberate, game-native.** Professional game editor energy — like a tool you'd find inside a game engine, not a consumer web app.

### Aesthetic Direction
Dark workspace (#080810 background) — like a darkroom or game engine editor, comfortable for long creative sessions. Electric lime green (#57FF6E) as the precise primary accent, gold (#FFD700) as secondary. Press Start 2P for headers (pixel discipline, not nostalgic kitsch), JetBrains Mono for body (precision and readability). Zero border-radius everywhere. Glow on hover, scale(0.97) on click.

Anti-references: screaming cyberpunk neon sites, overloaded card dashboards, generic AI aesthetics (no purple gradients, no cyan glow orbs).

### Design Principles
1. **Tools serve the art** — UI steps back when the user works on their image. Canvas and output are the hero.
2. **Precision over decoration** — every element earns its place. No decorative filler.
3. **Game-native familiarity** — HUD-like, functional, alive with feedback.
4. **Calm dark workspace** — steady and dependable for long sessions.
5. **Reward interaction** — hover glows, click responses, staggered reveals feel satisfying.
