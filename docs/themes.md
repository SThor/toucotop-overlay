# Overlay Themes

Themes control the visual style of all four overlay components (Chat, Clock, Bar, Pause) simultaneously. The active theme is set from the settings dashboard (`/auth/success`) and persisted server-side, so every OBS Browser Source picks it up without any URL changes.

A theme can also be forced for a single OBS scene via URL parameter: `?theme=crt`

---

## Available Themes

### `default` — Bare Overlay

A clean, minimal overlay with no background. Content (text, stats, chat messages) renders directly over the stream without any panel backdrop, borders, or colour tinting. Neutral white/grey tones only — designed to stay out of the way of the underlying stream content.

**Best for:** setups that want the overlay information to float seamlessly over the stream, prioritising the stream image itself.

---

### `crt` — CRT Effects

Emulates the look of an old cathode-ray tube monitor. Renders a dedicated CRT-style background directly, with three independently toggleable effects:

| Sub-setting | Description |
|-------------|-------------|
| **Scanlines** | Faint horizontal lines across the overlay |
| **Scan sweep** | A slow vertical sweep animation |
| **Intensity** | `minimal` / `subtle` (default) / `medium` — scales all effect strengths |

The palette stays warm orange, but gains a screen glow, chromatic aberration colouring, and a vignette edge darkening.

**Best for:** retro gaming streams, nostalgic aesthetics.

URL param: `?theme=crt`

---

### `y2k` — Gothic Techno

A high-impact theme built around liquid chrome, gothic typography, and Y2K internet aesthetics. Uses WebGL shaders from [@paper-design/shaders-react](https://github.com/paper-design/shaders) for the background animation.

**Visual elements:**
- **LiquidMetal shader** — full-canvas animated chrome surface with chromatic red/blue channel dispersion
- **Colour-dodge layer** — cyan (`#00ffcc`) and magenta (`#ff00aa`) accents appear to live *inside* the chrome reflections
- **Dark vignette** — edges darken to keep overlay content readable over the busy background

**Palette:**

| Role | Value |
|------|-------|
| Background | `#030305` (near-black, blue undertone) |
| Goth shadow | `#1a0020` (deep violet, vignette) |
| Chrome hi | `#f0f0f0` → `#ffffff` |
| Chrome lo | `#505050` |
| Accent cyan | `#00ffcc` |
| Accent magenta | `#ff00aa` |
| Deep purple | `#7700ff` |
| HUD red (LIVE) | `#cc0033` |

**Typography hierarchy** (all self-hosted via Fontsource — no CDN requests):

| Font | Role |
|------|------|
| [UnifrakturMaguntia](https://fontsource.org/fonts/unifrakturmaguntia) | Identity / display headings — gothic blackletter with chrome gradient |
| [Climate Crisis](https://fontsource.org/fonts/climate-crisis) | Stream title — variable width axis, metallic shine sweep |
| [Press Start 2P](https://fontsource.org/fonts/press-start-2p) | HUD labels, stats, `LIVE` badge — pixel-perfect at small sizes |
| [Libre Barcode 39](https://fontsource.org/fonts/libre-barcode-39) | Decorative dividers / ornaments |

**CSS utilities** (defined in `src/styles/Y2KTheme.css`):

| Class | Effect |
|-------|--------|
| `.y2k-chrome-text` | Animated chrome gradient mapped onto text via `background-clip: text` |
| `.y2k-glitch` | RGB channel-split glitch on `::before` / `::after` pseudo-elements |
| `.y2k-panel` | Chrome bevel panel — inset highlights, coloured box-shadow, `backdrop-filter: blur` |
| `.y2k-hud-label` | Press Start 2P, small, cyan glow |
| `.y2k-live-badge` | Pulsing red `LIVE` badge |
| `.y2k-noise::after` | Scrolling scanline noise pseudo-element |
| `.y2k-vignette::before` | Radial dark vignette pseudo-element |

**Best for:** gothic, emo, or Y2K-era gaming streams; high-energy variety streams.

URL param: `?theme=y2k`
## Adding a Theme (developer notes)

1. Add the new value to `OverlayTheme` in `src/server/shared/overlaySettings.ts`
2. Add a validation branch in `src/server/settings.ts` (the `'theme' in body` block)
3. Add the value to the `?theme=` URL param check in `src/contexts/SettingsContext.tsx`
4. Create a background component (e.g. `src/components/MyBackground.tsx`) and add it to `src/components/ThemeBackground.tsx`
5. Add the theme to the Select `data` array in `src/pages/AuthSuccessPage.tsx`
6. Document it here
