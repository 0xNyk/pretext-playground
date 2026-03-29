# Pretext Playground

An interactive ASCII dragon demo built on [@chenglou/pretext](https://github.com/chenglou/pretext) — the pure TypeScript text measurement engine that bypasses DOM reflow entirely.

Every character on screen is a physics body. The dragon glides through Pretext-measured multilingual text, pushing letters aside. Hold click to breathe fire and scatter them. Letters spring back to their Pretext-computed home positions. Shoot floating enemies for points.

## What is Pretext?

Pretext solves one of the oldest problems in web UI: measuring text dimensions requires DOM access (`getBoundingClientRect`), which triggers expensive reflows. Pretext's `prepare()` does a one-time canvas measurement, then `layout()` is pure arithmetic — ~0.0002ms per call. This unlocks text-heavy UIs at 120fps without ever touching the DOM.

```ts
import { prepare, layout } from '@chenglou/pretext'

const prepared = prepare(text, '16px Inter')
const { height, lineCount } = layout(prepared, containerWidth, 20)
// No DOM. No reflow. Pure math.
```

## How This Demo Uses Pretext

| Feature | Pretext API | What it does |
|---------|-------------|--------------|
| **Text layout** | `prepareWithSegments` + `layoutWithLines` | Lays out all on-screen text (headings, body, CJK, code, quotes) into positioned lines without DOM |
| **Per-character physics** | Line positions from `layoutWithLines` | Each character gets a "home" position from Pretext's layout, used as the spring anchor for physics simulation |
| **3D text tunnel** | `prepareWithSegments` + `layoutWithLines` | Background tunnel rings of multilingual text, measured once at init, rendered with perspective projection |
| **Floating 3D cards** | `prepareWithSegments` + `layoutWithLines` | Rotating keyword cards with proper line-breaking for multi-line content |
| **Mixed scripts** | Built-in i18n support | CJK, Arabic, Hebrew, Korean, emoji — all measured correctly in a single pass |

## Features

**Dragon** — 60-segment ASCII chain (`◆▓▒░╬║│·`) with wings, spines, two eyes, and fire breath

**Physics letters** — every visible character is an independent body with velocity, rotation, spring-home force, and collision response against the dragon

**Fire breathing** — hold click to emit ASCII fire particles (`✦✧❋✺`) that blast letters away, set them on fire (orange glow + gravity), and spawn ember sparks

**Enemies** — 4 types floating around the screen:
- `◈` Grunts — 1 HP, drift toward center
- `⬢` Tanks — 3 HP, slow, show HP pips
- `◇` Fast — 1 HP, dart unpredictably
- `◌` Ghosts — 2 HP, phase through sine waves

**3D background** — text tunnel with perspective projection + rotating text cards

**Control panel** — press `P` to open. Presets (Gentle, Chaos, Zen, Tiny, Leviathan) plus granular sliders for dragon size, physics forces, fire intensity, enemy count, and atmosphere toggles.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and move your mouse.

## Controls

| Input | Action |
|-------|--------|
| Mouse move | Dragon follows cursor |
| Click & hold | Breathe fire |
| `P` | Toggle control panel |
| `Esc` | Close panel |

## Tech Stack

- **[@chenglou/pretext](https://github.com/chenglou/pretext)** — text measurement engine
- **Canvas 2D** — all rendering, no DOM elements for text
- **Vite** — dev server and bundler
- **TypeScript** — type-safe throughout

## Architecture

```
index.html          Single-page shell with control panel HTML/CSS
src/dragon.ts       Everything — canvas setup, physics, dragon chain,
                    letter system, fire particles, enemies, 3D tunnel,
                    floating cards, runes, UI binding, main loop
```

The render loop runs at requestAnimationFrame speed. All text is measured once with Pretext at init (and on resize), then the physics simulation and canvas rendering run every frame using only the cached measurements — no DOM reads in the hot path.

## License

MIT
