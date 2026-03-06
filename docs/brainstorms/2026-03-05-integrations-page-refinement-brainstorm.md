# Integrations Page Refinement — Mission Control Console Aesthetic

**Date:** 2026-03-05
**Context:** Phase 4 (integrations page) was implemented but the design feels too flat/modern — "geometric fonts on a web app" rather than the Sony Making Modern / 80s retro industrial language established in the dashboard cards and ReadoutDisplay.

## What We're Building

A refined integrations page where every element feels like it belongs on a 1970s–80s mission control console. The page has two sections: a **scan readout terminal** and a **module rack** of integration stations.

### Physical Metaphor: Mission Control Console

The whole page is one instrument panel surface. Integration modules are dedicated "stations" — each with its own CRT display, LED indicator, engraved label, and terminal-style controls.

## Key Decisions

### 1. Scan Log — Terminal Readout with Braille Wave Animation

Replace the current plain ReadoutDisplay log with a Fallout-terminal-style readout:

- **Scanlines** on the ReadoutDisplay (already has the glass treatment; add scanline texture emphasis)
- **useScramble** on each log line for personality — text scrambles then resolves
- **Braille dot-matrix wave** for scanning progress: 9-character rolling wave using 8-dot braille height progression
  - Height levels: `⠀` → `⢀` → `⣀` → `⣤` → `⣶` → `⣿` (empty to full, bottom-to-top fill)
  - Rolling wave pattern shifts right while a brand is being scanned
  - Resolves to count text when brand scan completes
  - Can also serve as a generic loader animation elsewhere
- **"scan complete"** line: colored (emerald) without count appended — keep it clean
- **Error lines**: red-tinted text
- **Blinking `█` cursor** at the end of the active scanning line
- **"RESCAN" as terminal button**: inline highlighted/inverse text inside the ReadoutDisplay, not a separate web button. Like `[RESCAN]` rendered as inverse text in the terminal.

### 2. Module Panels — CRT Screen + Engraved Faceplate

Each integration rendered as a mission control station:

**Layout (no fixed aspect ratio — content determines height):**
```
┌─────────────────────────┐
│  ● LED (recessed well)  │
│  ┌───────────────────┐  │
│  │   ☁ (brand icon)  │  │  ← CRT screen window
│  │   6 devices        │  │    (scanlines, warm glow,
│  │   CONNECTED        │  │     Fallout terminal feel)
│  └───────────────────┘  │
│  HUE                    │  ← engraved label
│  [CONFIGURE]  [REMOVE]  │  ← terminal buttons
└─────────────────────────┘
```

**CRT Screen (per-module info display):**
- Same ReadoutDisplay dark cavity treatment but larger, serving as the module's primary display
- Brand icon centered, device count, status text (CONNECTED / OFFLINE)
- **Scanline texture** for retro CRT feel
- Powered: screen lit with warm cream glow text
- Unpowered: dim icon, `--` placeholder, no glow
- This makes the module panel distinct from dashboard cards (which use small ReadoutDisplay for individual values)

**Recessed LED Well:**
- Status LED sits inside a dark inset ring (like ReadoutDisplay border treatment)
- Not floating in the corner — recessed into the panel surface
- Same LED gradient as nav dots (radial-gradient specular highlight)

**Engraved Faceplate Label:**
- Brand name in Michroma with inset text-shadow
- ConsolePanelLabel pattern: label + divider line
- Feels stamped into the metal surface

**Terminal Buttons:**
- `[CONFIGURE]` and `[REMOVE]` rendered as inverse/highlighted text
- Same treatment as the `[RESCAN]` terminal button in scan log
- IoskeleyMono, interactive (hover brightens, press effect)
- `[CONNECT]` for available modules

### 3. Section Headers — Engraved Surface Treatment

Fix WCAG contrast while staying on-brand:
- Bump from `text-stone-400` to `text-stone-600` for AA compliance
- Add inset `text-shadow` for stamped/engraved-into-panel effect
- Keep Michroma font + divider line (ConsolePanelLabel pattern)

### 4. Grid Layout

- Responsive: 2 / 3 / 4 columns
- No fixed aspect ratio — modules size to content
- `gap-4` (16px) between modules
- Connected modules render first (powered stations), then available (dark/idle)

## Why This Approach

The current implementation uses the right typography but lacks the **surface treatments** and **physical metaphors** that make the dashboard cards feel industrial. The key insight is:

1. **Two CRT-style windows** per module (icon/info display + optional readout) creates visual richness that's unique to this page
2. **Terminal-style buttons** ([RESCAN], [CONFIGURE]) feel native to the mission control aesthetic instead of bolted-on web controls
3. **Braille wave animation** adds personality to the scan process without feeling gimmicky — it's rooted in the dot-matrix display language
4. **Engraved labels** via text-shadow create depth without adding DOM complexity

## Open Questions

None — all decisions resolved during brainstorm dialogue.

## Implementation Notes

- Braille characters (`⠀⢀⣀⣤⣶⣿`) are Unicode and should render in IoskeleyMono (braille block is in the font)
- The `[TERMINAL BUTTON]` style could become a reusable `TerminalButton` component
- The braille wave could be extracted as a `BrailleWave` component or `useScramble` variant for reuse as a loader
- CRT screen is a ReadoutDisplay with additional scanline emphasis + icon layout
- Section header engraved effect: `text-shadow: 0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.1)` on warm surface
