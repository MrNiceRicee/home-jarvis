---
title: Design System — Sony Making Modern + Terminal Aesthetic
category: ui-design
tags: [design-system, typography, animation, braille-renderer, crt, terminal, sony-es, react-aria]
created: 2026-03-07
status: active
components: [ReadoutDisplay, TextArtOrb, SteppedRadialDial, MercuryColumn, TransportKeyBank, PowerButton, PanelButton, ToggleBank, BrailleWave, ScrambleText, NumberTicker, StatusLed]
pages: [dashboard, integrations, matter]
---

# Design System — Sony Making Modern + Terminal Aesthetic

Home Jarvis uses a warm, tactile retro aesthetic inspired by **Sony ES-era hi-fi equipment** (late '70s–mid '80s) and **CRT terminal displays**. Every page and component has a distinct visual personality while sharing a unified design language.

## Design Philosophy

- **Sony ES retro**: champagne gold brushed aluminum, warm amber backlighting, smoked glass readout windows, analog VU meters
- **Teenage Engineering**: geometric sans-serif labels, compact control surfaces, color-coded modes
- **CRT/Terminal**: scanline overlays, phosphor bloom, braille pixel rendering for abstract data viz
- **Brutalist typography**: raw text on dark backgrounds, precision over decoration
- not retro-inspired but authentically retro, rendered with modern depth

## Typography

Two-font system — no decorative fonts, no system fonts.

| Font | Role | Style |
|------|------|-------|
| **IoskeleyMono** (woff2) | readout values, body text, terminal output | monospace, tracking-tight |
| **Michroma** (truetype) | labels, section headings, button text | geometric sans, uppercase, tracking-widest, 10px |

Text effects:
- **readout glow**: `textShadow: 0 0 8px rgba(250,240,220,0.4), 0 0 20px rgba(250,240,220,0.15)` — warm LCD backlight
- **embossed labels**: `textShadow: 0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)` — stamped into panel
- **active dial glow**: accent-colored text-shadow for selected detents

Braille rendering uses a fallback font-face (`BrailleFallback`) targeting U+2800–28FF.

## Color Palette

### Core surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-surface-warm` | #fffdf8 | card backgrounds, light panels |
| `--color-display-bg` | #2a2924 | dark LCD cavity gradient top |
| `--color-display-border` | #1a1914 | readout window border |
| `--color-display-text` | #faf0dc | warm cream text on dark glass |
| `--color-console-bg` | #1a1914 | darkest page background (Matter) |
| `--color-console-surface` | #23221c | medium dark panels |
| `--color-console-surface-raised` | #2e2d27 | LCD readout surfaces |
| `--color-console-text-muted` | #a89b82 | secondary text |
| `--color-console-text-dim` | #6b6356 | tertiary text |

### Mode accents

| Mode | Color | Glow |
|------|-------|------|
| Heat | rgb(249,115,22) | rgba(249,115,22,0.5) |
| Cool | rgb(59,130,246) | rgba(59,130,246,0.5) |
| Auto | rgb(52,211,153) | rgba(52,211,153,0.5) |
| Off | #57534e | none |

### Shadows

All shadows use brown-tinted rgba (warm paper stock aesthetic), never pure black:
- `--shadow-raised`: `0 1px 2px rgba(120,90,50,0.05), 0 4px 12px rgba(120,90,50,0.04)`
- `--shadow-inner-glow`: `inset 0 1px 0 rgba(255,253,245,0.8)`

## Page Personalities

### Dashboard (`index.tsx`)

Device grid organized into user-defined sections. Compact card view with quick toggles — full controls live in a detail dialog. Warm champagne surface, raised card shells with warm tan shadows.

### Integrations (`integrations.tsx`)

**Eurorack module rack aesthetic.** Integration tiles styled as pocket operator faces — each brand is a module with status LED, device count readout, and scan controls. Dark ReadoutDisplay window streams scanning events in IoskeleyMono. Connected modules glow with lit LEDs; available modules sit dim at reduced opacity.

### Matter (`matter.tsx`)

**Full-viewport HAL-inspired mission-control HUD.** Darkest page in the app — edge-to-edge console background. Centered braille orb (`TextArtOrb`) with dashed metadata ring rotating at 60s/revolution. Brutalist corner readouts (PORT, PAIRED, UPTIME) positioned absolutely. HUD frame border with L-shaped registration marks. CRT power-on animation on page entry.

## Component Personalities

### ReadoutDisplay

Dark LCD cavity — recessed smoked glass instrument display. Multi-layer glass simulation:
1. bright top edge highlight (glass catch-light)
2. top-down depth gradient (light entering glass)
3. scanline texture at 0.04 opacity (CRT feel)
4. corner vignette (radial gradient)
5. bottom edge darkening (glass thickness shadow)

Deep inset cavity via layered box-shadows mimicking real bezel depth. Supports configurable glow color and intensity.

### TextArtOrb (Braille Pixel Renderer)

46x76 framebuffer, each braille dot is an addressable pixel. `PIXEL_BIT[x][y]` lookup, bit-pack 2x4 blocks to `0x2800 + bitfield` codepoint.

- **Lambert cosine shading**: `nz = sqrt(1 - dist2)` for sphere density
- **Bayer 4x4 ordered dither**: per-pixel threshold comparison for stippled rendering
- **Radial wave shimmer**: `sin(dist * PI * 3 - phase) * 0.12 * dist`
- **Content-driven breathing**: 6% radius oscillation over ~8s cycle (not CSS scale)
- **Solar flare spikes**: 8 rotating/pulsing tendrils beyond sphere boundary
- **Negative space digits**: 5x7 bitmap font at 2x scale carved into sphere center
- **SVG phosphor bloom filter**: triple-layer feGaussianBlur merge

Updates via ref-based direct DOM `textContent` mutation — no React state per tick (200ms interval).

### SteppedRadialDial

270-degree arc potentiometer (7:30 to 4:30 through 12:00). Brushed aluminum knob via conic gradient. White indicator line rotates to active detent with accent-colored glow. Tick marks and labels arranged in arc. Snap-to-detent pointer interaction.

### MercuryColumn

Vertical glass tube gauge. Mode-based fill color animates over 500ms. Multi-layer glass overlays (highlight, depth gradient, scanline, vignette). Bulb at bottom matches fill color with glow. Optional tick marks + labels on left side.

### TransportKeyBank

Recessed mechanical push-keys styled like cassette deck transport buttons. LED indicator on top edge (lit when active). Gradient faces — raised state = light gradient, pressed = inset shadow. Michroma labels, uppercase. Each key has optional ledColor for mode-specific glow.

### PanelButton

Small (28px) or medium (36px) rounded square buttons with optional LED indicator (top-right, 6x6px). LED states: on (glowing), off (dim), pulse (animated). Stone-colored border with top-left highlight. Optional Michroma label below.

### ToggleBank

Radio button group with LED glow per option. Selection mode (radio) or action mode (grid of PanelButtons). Consistent Michroma labels and color/glow logic throughout.

### PowerButton

28x28px minimal toggle. Power symbol in emerald green when on with dual drop-shadow bloom: `drop-shadow(0 0 3px rgba(52,211,153,0.7)) drop-shadow(0 0 6px rgba(52,211,153,0.4))`.

### StatusLed

3-layer construction: brushed aluminum bezel ring, dark inset well cavity, colored LED dot with status-specific glow. States: running (emerald), starting (amber pulse), error (red), stopped (gray).

## Device Card Personalities

### LightCard

Hero readout: brightness % + color temp K. Two horizontal faders — brightness (amber fill, ruler-graduated detents) and CCT (warm-to-cool gradient). Scene presets with LED top-edge color. RGB lights get a color wheel + hex input. Reactive lighting: display window glow reflects actual CT, fader tracks light up proportionally.

### ThermostatCard

Mercury column (left) + readout panel (right). Transport-key mode buttons (HEAT|COOL|AUTO|OFF) with mode-colored LED. Target temp ± stepper with 600ms debounce. Mode-colored accent line across readout center.

### AirPurifierCard

PM2.5 hero readout with AQI color label (GOOD/FAIR/POOR/HAZ). Three vertical LED-style meters: AQI (4 segments, green→red), fan speed dial (SteppedRadialDial), filter life (10 segments, red→green). Segments glow when lit, dim when off.

### MediaCard

Vertical volume fader with symmetric ruler-graduated detent ticks. Routed channel (recessed), filled portion animates from bottom. ± step buttons. Small ReadoutDisplay showing volume number, updates live during drag.

### FridgeCard

Dual compartment readouts: FRIDGE + FREEZER. Each compartment shows temp in ReadoutDisplay with cold blue tint. Read-only display, no direct controls.

## Animation Patterns

| Animation | Technique | Timing | File |
|-----------|-----------|--------|------|
| CRT power-on | clip-path inset keyframes (dot → line → frame) | 600ms ease-out | index.css |
| Phosphor flash | radial gradient opacity keyframe | 600ms ease-out | index.css |
| Metadata ring rotation | transform rotate | 60s linear infinite | index.css |
| Terminal cursor | opacity step-end | 1s infinite | index.css |
| Braille sphere | Lambert shading + dither + ref DOM mutation | 200ms tick | text-art-orb.tsx |
| Braille wave | Unicode level cycling via setInterval | 120ms tick | braille-wave.tsx |
| Text scramble | use-scramble library with braille range | 0.8 speed | scramble-text.tsx |
| Number ticker | Increment/decrement by 1 per tick | 60ms per step | number-ticker.tsx |
| Mercury fill | CSS transition on height | 500ms ease | mercury-column.tsx |

### Reduced Motion

`useReducedMotion()` hook checks `prefers-reduced-motion: reduce` and listens for changes. Every animation component respects it:
- TextArtOrb: static frame
- BrailleWave: static "SCANNING..." text
- ScrambleText: speed 0 (disabled)
- NumberTicker: jump to value
- CSS keyframes: all disabled via media query

## Glass Effect Recipe

Used across ReadoutDisplay, MercuryColumn, and other recessed surfaces:

```
1. bright top edge highlight — via-white/25 gradient
2. top-down depth gradient — from-white/[0.07] to transparent
3. scanline texture — repeating-linear-gradient at 0.04 opacity
4. corner vignette — radial-gradient transparent to rgba(0,0,0,0.15)
5. bottom darkening — from-black/20 gradient, h-5
6. deep inset shadow — inset 0 4px 10px rgba(0,0,0,0.7) + lateral insets
7. outer bezel highlight — 0 1px 0 rgba(255,255,255,0.3)
```

## LED Glow Recipe

```
lit:    backgroundColor: color
        boxShadow: 0 0 4px ${color}, 0 0 8px color-mix(in srgb, ${color} 40%, transparent)

dim:    backgroundColor: color-mix(in srgb, ${color} 60%, #78716c)
        no glow

off:    backgroundColor: #a8a29e
        no glow
```

## Technical Notes

- **Tailwind CSS v4**: CSS-first config via `@import 'tailwindcss'` + `@theme` block — no JS config
- **React Aria Components**: all interactive elements (Button, Slider, RadioGroup, Dialog, ColorPicker)
- **No Framer Motion for heavy animation**: CSS keyframes for compositor-friendly effects, direct JS intervals for braille/text/ticker
- **Warm shadows only**: brown-tinted rgba throughout, never pure black shadows
- **44px touch targets**: min-w/min-h enforced on all interactive elements
