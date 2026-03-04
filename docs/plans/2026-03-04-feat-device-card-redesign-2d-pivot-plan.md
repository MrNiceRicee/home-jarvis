---
title: "feat: Device Dashboard — 2D Sony/TE-Inspired Pivot"
type: feat
status: active
date: 2026-03-04
origin: docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md
---

# feat: Device Dashboard — 2D Sony/TE-Inspired Pivot

## Overview

Pivot the device dashboard from React Three Fiber 3D panels to a 2D HTML/CSS implementation using React Aria Components + Tailwind CSS v4. Design inspired by **Sony Design (Making Modern)**, **Teenage Engineering**, and the **[Commit Mono](https://commitmono.com/) website aesthetic** — clean, typographically precise, distinctly retro yet modern. No brushed metal textures or faux-3D effects. Simple, refined, warm.

**Design north star:** The commitmono.com website — minimalist restraint, typography as the primary visual element, generous whitespace, keyboard-driven interactions, neutral palette with purposeful accents. The "Super Normal" philosophy: special is less useful than normal.

**What we keep from the R3F experiment:**
- Section-grouped layout concept (rack bays → section groups)
- Two-layer interaction model (compact card + detail dialog)
- Per-type card controls architecture
- Color palette spirit: warm neutrals, amber accents, dark display windows
- All Phase 1 backend work (sections, positions, VeSync fixes)

**What changes:**
- R3F Canvas → CSS grid within the existing root layout (nav visible)
- 3D materials/lighting → clean CSS with subtle shadows and gradients
- Three.js bloom → CSS `box-shadow` / `text-shadow` glow
- 3D drag-and-drop → React Aria `useDrag`/`useDrop`
- Camera fitting → responsive CSS grid columns
- Typography: **Commit Mono** as the primary monospace font (body, labels, status text). **IoskeleyMono** for readout values in dark display windows (UV aesthetic). DSEG7 dropped. Michroma for section labels.

## Problem Statement / Motivation

The R3F 3D implementation didn't achieve the intended visual quality — flat-looking panels, blurry text, unrealistic screws, and difficult-to-control lighting. The existing 2D device cards with React Aria were already more usable and visually polished. The 3D approach added significant complexity (material tuning, camera management, render loop optimization) without proportional UX benefit.

The pivot returns to proven 2D technology while applying the design sensibility from the brainstorm — Sony's precision and warmth, Teenage Engineering's functional minimalism — through CSS, not shaders.

## Proposed Solution

### Design Language: Simple & Refined

**No brushed metal, no faux-3D, no heavy textures.** Clean surfaces, precise typography, warm tones.

**Color Palette:**

| Role | Value | Usage |
|------|-------|-------|
| Background | `#f5f2ec` (existing) | Page background — warm off-white |
| Card surface | `from-[#fffdf8] to-stone-50/80` (existing) | Clean gradient, barely-there warmth |
| Display window | `#0a0a0a` | Dark inset areas for IoskeleyMono readouts (UV glow aesthetic) |
| Active accent | `#e89820` (amber) | Power-on indicators, active controls, section highlights |
| Power on | `#3bbd5e` (green) | Small LED dot |
| Text primary | `stone-900` | Device names, values |
| Text secondary | `stone-500` | Labels, brands |
| Text etched | `#8a7e6b` | Subtle label text on section fillers |
| Border | `rgba(168,151,125,0.15)` (existing) | Warm-tinted card borders |

**Typography:**

| Context | Font | Style |
|---------|------|-------|
| Device names | Commit Mono | `font-commit text-sm font-medium` — monospace gives everything a technical feel |
| Section labels | Michroma | `uppercase tracking-wider text-xs` — geometric, wide, label-like |
| Readout values | IoskeleyMono | `font-ioskeley` on dark backgrounds, warm cream `#faf0dc` — geometric, compact, UV display aesthetic |
| Control labels | Commit Mono | `font-commit text-xs text-stone-500 uppercase tracking-wide` |
| Status text | Commit Mono | `font-commit text-xs` — online/offline badges, metadata |

**Font acquisition:**
- **Commit Mono**: Download from [commitmono.com](https://commitmono.com/), self-host WOFF2 in `client/public/fonts/`
- **IoskeleyMono**: Download from [github.com/ahatem/IoskeleyMono](https://github.com/ahatem/IoskeleyMono), self-host WOFF2 in `client/public/fonts/`
- **DSEG7**: Remove from `client/public/fonts/` — no longer used

Register fonts in Tailwind v4 theme (`client/src/index.css`):

```css
@font-face {
  font-family: 'Commit Mono';
  src: url('/fonts/CommitMono-Regular.woff2') format('woff2');
  font-display: swap;
}

@font-face {
  font-family: 'IoskeleyMono';
  src: url('/fonts/IoskeleyMono-Regular.woff2') format('woff2');
  font-display: swap;
}

@theme {
  --font-commit: 'Commit Mono', monospace;
  --font-ioskeley: 'IoskeleyMono', monospace;
  --font-michroma: 'Michroma', sans-serif;
}
```

**Card Design:**
- Existing `Card` component as base — warm gradient surface, subtle shadow, rounded corners
- No aspect ratio enforcement — cards are auto-height based on content
- Compact cards show: power state, device name, one primary metric/control
- Full controls live in the detail dialog
- Commit Mono throughout gives cards a technical, purposeful character — like instrument panels
- Generous padding and whitespace — let the typography breathe

**Micro-interactions** (inspired by commitmono.com):
- Toggle switches with smooth state transitions
- Slider thumbs with subtle scale-up on hover/drag
- Card hover: barely-perceptible shadow lift (`transition-shadow`)
- Section header hover: reveal action buttons (rename, delete) — hidden at rest
- Keyboard shortcuts: `1-9` to jump between sections, `?` for shortcut overlay
- Focus-visible rings match the amber accent

**Section Fillers:**
- Full-width horizontal divider spanning the grid
- Michroma text, uppercase, letter-spaced, `text-stone-400`
- Thin border-bottom as separator
- Clean and minimal — just a label, not a decorative panel
- Action buttons (rename, reorder, delete) appear on hover — not always visible

### Architecture

```
routes/index.tsx (Dashboard)
├── StreamStatusBadge
├── SectionGroup (per section)
│   ├── SectionHeader (filler label + actions)
│   └── CSS Grid
│       └── DeviceCard (existing component, restyled)
│           └── [LightCard | ThermostatCard | AirPurifierCard | ...]
├── AddSectionButton
├── DeviceDetailDialog (RaisedModal + per-type full controls)
└── LightMultiSelectBar (floating, conditional)
```

**Reuse existing components directly:**
- `DeviceCard` + all 9 type-specific cards in `device-cards/`
- `Card` / `CardHeader` / `CardBody` / `CardFooter` primitives
- `RaisedButton`, `RaisedInput`, `RaisedModal`
- `LightMultiSelectBar`
- `useDeviceStream`, `useStreamStatus` hooks
- `cn()`, `lightAccentStyle()`, color utils

## Technical Approach

### Implementation Phases

#### Phase 1: Restore 2D Dashboard Layout

Replace the R3F scene with a section-grouped CSS grid layout.

**Files to modify:**
- `client/src/routes/index.tsx` — remove `RackSceneShell` import, build section-grouped grid

**Files to create:**
- `client/src/components/SectionGroup.tsx` — section header + device grid container

**Tasks:**

- [x] Remove `RackSceneShell` import from `client/src/routes/index.tsx`
- [x] Build section-grouped layout: sections query → map sections → render `SectionGroup` per section
- [x] Create `SectionGroup` component: Michroma section label + responsive CSS grid of `DeviceCard`s
- [x] Wire `DeviceCard` props: `device`, `onStateChange`, `onMatterToggle`, `isSelected`, `onToggleSelect`
- [x] Restore `handleStateChange` as `async` returning `Promise<void>` (matching `DeviceCard` prop type)
- [x] Handle unsectioned devices: group into "Home" fallback section
- [x] Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- [x] Restore nav bar visibility: remove `h-screen` wrapper, use standard `<main>` content flow
- [x] Keep empty state (no devices) as-is
- [x] Run `bun run system:check --force` and verify

**Success criteria:** Dashboard renders all devices grouped by sections in a responsive grid. All existing card controls (sliders, toggles, color pickers) work. Nav bar is visible.

#### Phase 2: Section Management UI

Replace `window.prompt` with proper React Aria UI.

**Files to modify:**
- `client/src/routes/index.tsx` — section creation/management state
- `client/src/components/SectionGroup.tsx` — inline rename, delete action

**Files to create:**
- `client/src/components/CreateSectionDialog.tsx` — React Aria Dialog for section creation

**Tasks:**

- [x] Create `CreateSectionDialog` using `RaisedModal` — text input for section name, validation (alphanumeric + spaces, max 50 chars), error display for duplicates
- [x] Replace `window.prompt` in dashboard with dialog trigger
- [x] Add inline rename to `SectionGroup`: click section name → editable input, commit on Enter/blur
- [x] Add section delete: small "x" or trash icon on section header, only enabled when section is empty
- [x] Show error toast via `sonner` when delete fails (section not empty)
- [x] Handle 409 conflict on duplicate section name — show inline error
- [ ] Add section reorder: up/down arrows on section header, `PATCH /api/sections/:id` with new position
- [x] Run `bun run system:check --force`

**Success criteria:** Sections can be created, renamed, deleted (when empty), and reordered through styled UI. No `window.prompt`.

#### Phase 3: Typography + Readout Styling + Card Refinements

Apply Commit Mono throughout, add IoskeleyMono display windows for readout values, refine card layouts.

**Files to modify:**
- `client/src/index.css` — register font families in `@theme`, add `@font-face` for Commit Mono + IoskeleyMono
- `client/src/components/DeviceCard.tsx` — apply Commit Mono to card shell text
- `client/src/components/device-cards/AirPurifierCard.tsx` — IoskeleyMono readout for PM2.5
- `client/src/components/device-cards/ThermostatCard.tsx` — IoskeleyMono readout for temperature
- `client/src/components/device-cards/LightCard.tsx` — IoskeleyMono readout for brightness %
- `client/src/components/device-cards/SensorCard.tsx` — IoskeleyMono readout for temp/humidity

**Tasks:**

- [x] Download Commit Mono (WOFF2) from commitmono.com, place in `client/public/fonts/`
- [x] Download IoskeleyMono (WOFF2) from github.com/ahatem/IoskeleyMono releases, place in `client/public/fonts/`
- [ ] Remove DSEG7 font files from `client/public/fonts/` and remove the `@font-face` declaration + `FONT_DSEG7` constant
- [x] Add `@font-face` for both fonts + register `--font-commit`, `--font-ioskeley`, `--font-michroma` in `@theme` block in `index.css`
- [x] Apply `font-commit` as the default body font or selectively to card text, labels, and values
- [x] Create a `ReadoutDisplay` component: dark background (`bg-[#0a0a0a]`), rounded, subtle inner shadow, IoskeleyMono font, warm cream text (`#faf0dc`), optional faint amber `text-shadow` glow — the "UV display window" concept. Accepts `size: 'lg' | 'sm'` for focal vs compact readouts
- [x] Apply `ReadoutDisplay` (lg) to AirPurifierCard PM2.5 value
- [x] Apply `ReadoutDisplay` (lg) to ThermostatCard current/target temperature
- [x] Apply `ReadoutDisplay` (sm) to LightCard brightness percentage
- [x] Apply `ReadoutDisplay` (sm) to SensorCard readings
- [x] Use Michroma for section labels in `SectionGroup`
- [x] Add micro-interactions: card hover shadow lift, slider thumb scale-up, toggle transitions
- [ ] Compact card refinement: ensure each card shows power toggle + one primary metric/slider — move heavy controls (color wheel, full scene picker) behind the detail dialog
- [x] Run `bun run system:check --force`

**Success criteria:** Commit Mono gives the entire dashboard a cohesive, technical character. IoskeleyMono readouts in dark display windows feel like UV instrument panels — geometric, compact, glowing. Section labels use Michroma. Cards feel clean, precise, and "retro yet modern" — like the commitmono.com aesthetic.

#### Phase 4: Detail Dialog

Full-control modal per device type, triggered from compact card.

**Files to modify:**
- `client/src/routes/index.tsx` — wire `expandedDevice` state to dialog
- `client/src/components/DeviceCard.tsx` — add expand button/affordance

**Files to create:**
- `client/src/components/DeviceDetailDialog.tsx` — modal shell + type dispatch to full controls

**Tasks:**

- [x] Add expand affordance to `DeviceCard` header — small icon button (chevron or expand icon), `RaisedButton` variant ghost
- [x] Create `DeviceDetailDialog` using `RaisedModal` — receives `device` + `onStateChange` + `onClose`
- [x] Dispatch to per-type full-control layouts inside the dialog:
  - Light: brightness slider, CCT slider, color wheel, scene presets, hex input
  - Air purifier: PM2.5 readout (large), AQ level, fan speed, filter life bar, mode control
  - Thermostat: large temp display, target adjustment, mode buttons (heat/cool/auto/off)
  - Vacuum: status, battery, start/pause/dock
  - Media: volume, transport controls, now-playing
  - Others: full state display
- [x] Wire `expandedDevice` state in dashboard → open/close dialog
- [x] Animate dialog enter/exit using React Aria `entering:`/`exiting:` classes
- [x] Run `bun run system:check --force`

**Success criteria:** Every device type has a detail dialog with full controls. Dialog opens from expand button, closes on outside click or Escape. Smooth enter/exit animation.

#### Phase 5: Multi-Select + Drag-and-Drop

Wire up light multi-select and add device reordering.

**Files to modify:**
- `client/src/routes/index.tsx` — selection state, multi-select bar rendering, DnD context
- `client/src/components/SectionGroup.tsx` — drop targets
- `client/src/components/DeviceCard.tsx` — drag source

**Tasks:**

- [x] Add `selectedIds: Set<string>` state to dashboard
- [x] Pass `onToggleSelect` to light-type `DeviceCard` instances
- [x] Conditionally render `LightMultiSelectBar` when `selectedIds.size > 0`
- [x] Wire multi-select bar's `onStateChange` to batch-update selected devices
- [x] Implement drag-and-drop using dnd-kit (`@dnd-kit/core` + `@dnd-kit/sortable`):
  - Drag source: device card (with 8px distance constraint to avoid accidental drags)
  - Drop targets: between cards within a section using `rectSortingStrategy`
  - On drop: compute new positions for all affected devices, batch `PATCH /api/devices/positions`
  - DragOverlay for smooth visual feedback during drag
- [x] Visual feedback during drag: dragged card fades, overlay shows card preview
- [x] Run `bun run system:check --force`

**Success criteria:** Lights can be multi-selected for batch control. Devices can be dragged to reorder within sections and moved across sections. Positions persist to database.

#### Phase 6: Cleanup + Polish

Remove R3F artifacts and polish the experience.

**Files to remove:**
- `client/src/components/r3f/` — entire directory

**Files to modify:**
- `client/package.json` — remove R3F dependencies

**Tasks:**

- [ ] Delete `client/src/components/r3f/` directory
- [ ] Remove R3F packages: `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`, `three`, `@types/three`
- [ ] Verify no remaining imports reference `r3f/` or `three`
- [ ] New device assignment: when `device:new` SSE event fires, show a toast with "New device: [name]" and option to assign to a section (auto-assigned to Home by default)
- [ ] Offline device mid-interaction: add `onError` to `stateMutation` that shows a toast and reverts optimistic update
- [ ] Loading states: skeleton cards while SSE connects
- [ ] Responsive polish: verify grid at mobile, tablet, desktop breakpoints
- [ ] Run `bun run system:check --force`

**Success criteria:** No R3F code or dependencies remain. New device discovery shows a notification. Error states are handled gracefully. Layout is responsive.

## System-Wide Impact

- **Interaction graph**: Dashboard reads from `['devices']` query cache (populated by SSE) and `['sections']` (fetched). State changes go through `stateMutation` → `PATCH /api/devices/:id/state` → adapter → SSE confirms. Section mutations → `POST/PATCH/DELETE /api/sections` → `invalidateQueries(['sections'])`.
- **Error propagation**: Adapter failures surface as HTTP errors on the mutation. Currently no `onError` callback — Phase 6 adds toast notifications. SSE reconnect is handled by `useDeviceStream` with exponential backoff.
- **State lifecycle risks**: Drag-and-drop position updates are client-computed then batch-sent. If the batch partially fails, positions could be inconsistent. Mitigation: wrap in transaction on server (already done in `devices.controller.ts`).
- **API surface parity**: No new API endpoints needed. All section and device position endpoints exist from Phase 1.
- **Integration test scenarios**: (1) SSE snapshot → cards render grouped by section. (2) Drag device cross-section → positions update in DB. (3) Section delete with devices → 400 error, section persists.

## Acceptance Criteria

### Functional Requirements

- [ ] Dashboard renders devices in a responsive CSS grid grouped by sections
- [ ] Each section has a Michroma-labeled header
- [ ] Device cards show power state, name, brand, online status, and one primary metric
- [ ] Key metrics use IoskeleyMono font in dark "display window" insets (UV aesthetic)
- [ ] Expand button opens a detail dialog with full controls per device type
- [ ] Sections can be created, renamed, deleted (when empty), and reordered
- [ ] Light cards support multi-select with floating batch control bar
- [ ] Devices can be reordered within sections via drag-and-drop
- [ ] Devices can be moved across sections via drag-and-drop
- [ ] New device discovery shows a notification
- [ ] Offline devices are visually muted with disabled controls

### Non-Functional Requirements

- [ ] No R3F or Three.js dependencies in the final bundle
- [ ] Dashboard renders within the root layout (nav visible)
- [ ] All interactive elements use React Aria for accessibility
- [ ] Keyboard navigation works for all controls including DnD
- [ ] `bun run system:check --force` passes (lint + typecheck)

## Dependencies & Risks

**Dependencies:**
- Phase 1 backend (sections, positions, VeSync) — already complete
- React Aria `useDrag`/`useDrop` — available in `react-aria-components@1.15.1`
- Michroma font — already in `client/public/fonts/`
- Commit Mono — download from commitmono.com (SIL OFL)
- IoskeleyMono — download from github.com/ahatem/IoskeleyMono (SIL OFL)

**Risks:**
- React Aria DnD is newer and less battle-tested than `@dnd-kit`. If it proves insufficient for the grid reordering UX, fallback to `@dnd-kit/core`.
- Moving color wheel from compact card to detail dialog changes the light card UX significantly. May need user feedback.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md](docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md) — key decisions carried forward: section-grouped layout, two-layer interaction (compact + dialog), per-type card controls, warm amber accent palette. Typography evolved: Commit Mono + IoskeleyMono replaced DSEG7; Michroma retained for section labels.

### Internal References

- Existing Card primitives: `client/src/components/ui/card.tsx`
- DeviceCard type dispatch: `client/src/components/DeviceCard.tsx`
- Per-type cards: `client/src/components/device-cards/*.tsx`
- SSE hook: `client/src/hooks/useDeviceStream.ts`
- Tailwind config: `client/src/index.css` (CSS-first, `@theme` block)
- Sections controller: `server/src/routes/sections.controller.ts`
- Device positions: `server/src/routes/devices.controller.ts`
- Color utils: `client/src/lib/color-utils.ts`

### Previous Work

- R3F plan (superseded): `docs/plans/2026-03-03-feat-device-card-redesign-sony-es-panels-plan.md`
- Phase 1 backend commit: `917ac39`
