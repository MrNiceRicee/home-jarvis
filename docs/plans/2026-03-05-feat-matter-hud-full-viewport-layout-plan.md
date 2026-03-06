---
title: "feat: Matter HUD Full-Viewport Layout"
type: feat
status: completed
date: 2026-03-05
origin: docs/brainstorms/2026-03-05-matter-hud-layout-brainstorm.md
---

# Matter HUD Full-Viewport Layout

## Overview

Redesign the Matter page paired view from "orbital + cards below" to a full-viewport mission-control HUD. The orbital fills the center, data readouts sit at viewport corners as raw text, and a thin technical-drawing border frames the entire display. Remove DarkConsolePanel and DarkGauge from the paired view entirely.

(see brainstorm: `docs/brainstorms/2026-03-05-matter-hud-layout-brainstorm.md`)

## Problem Statement

The current paired view wastes space: the orbital SVG is capped at 500x500px via `max-w-[500px]`, and bridge data lives in DarkConsolePanel/DarkGauge cards stacked below. The layout reads as a dashboard widget — not a mission-control display. The braille orb renderer we just built deserves a viewport-filling stage.

Additionally:
- Solar flares are too subtle (SPIKE_MAX_LENGTH = 0.3)
- Phosphor bloom is too flat (stdDeviation 1.2 + 0.4)
- Metadata ring labels are too dim (`fill-console-text-dim` = #6b6356)

## Proposed Solution

Three phases, building from layout outward:

1. **HUD layout** — full-viewport dark frame with corner readouts (replaces card panels)
2. **Dynamic orbital** — SVG fills available space, label contrast bumped
3. **Orb tuning** — bigger solar flares, more bloom intensity

## Open Questions Resolved

From brainstorm (see brainstorm: `docs/brainstorms/2026-03-05-matter-hud-layout-brainstorm.md`, "Open Questions"):

1. **Corner data mapping:**
   - Top-left: STATUS — bridge status with StatusLed (RUNNING / STARTING / ERROR / OFFLINE)
   - Top-right: headline — "Paired & Active" / "Awaiting Pairing" / subline
   - Bottom-left: DEVICES — bridged device count
   - Bottom-right: LINK — OK / —

2. **Border frame: SVG or CSS?** — CSS. The frame wraps the viewport, not the orbital SVG. Pseudo-elements or small absolute-positioned elements for registration marks at corners.

3. **Corner readouts: SVG or HTML?** — HTML absolute-positioned divs. They sit at viewport corners, outside the SVG viewBox. Styled with Tailwind, Michroma labels, IoskeleyMono values.

## Technical Approach

### Phase 1: HUD Layout + Corner Readouts

**Files:**
- `client/src/routes/matter.tsx` — major rewrite of paired view
- `client/src/index.css` — HUD frame styles

#### Paired View Rewrite

Replace the current paired view (lines 197-249 of `matter.tsx`) which renders:
- `<MatterOrbital>` at top
- `<DarkConsolePanel label="BRIDGE STATUS">` below with StatusLed + gauges
- Optional error panel

With a full-viewport HUD:

```tsx
{view === 'paired' && (
  <motion.div
    key="paired"
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.4, ease: 'easeOut' }}
    className="relative flex items-center justify-center h-full"
  >
    {/* border frame */}
    <div className="hud-frame" />

    {/* corner readouts */}
    <HudReadout position="top-left">
      <StatusLed status={status} />
      <span className="font-michroma text-2xs text-console-text-muted tracking-[0.15em] uppercase">
        {status === 'running' ? 'RUNNING' : status.toUpperCase()}
      </span>
    </HudReadout>

    <HudReadout position="top-right">
      <span className="font-ioskeley text-xs text-console-text tracking-wide">
        {statusHeadline(status, true)}
      </span>
      <span className="font-ioskeley text-2xs text-console-text-muted tracking-wider">
        {statusSubline(status, true, deviceCount)}
      </span>
    </HudReadout>

    <HudReadout position="bottom-left">
      <span className="font-ioskeley text-lg text-console-text tabular-nums">{deviceCount}</span>
      <span className="font-michroma text-[9px] text-console-text-muted tracking-[0.2em] uppercase">DEVICES</span>
    </HudReadout>

    <HudReadout position="bottom-right">
      <span className={cn('font-ioskeley text-lg tabular-nums', isPaired ? 'text-emerald-400' : 'text-console-text')}>
        {isPaired ? 'OK' : '\u2014'}
      </span>
      <span className="font-michroma text-[9px] text-console-text-muted tracking-[0.2em] uppercase">LINK</span>
    </HudReadout>

    {/* orbital fills center */}
    <MatterOrbital data={orbitalData} />

    {/* empty state */}
    {deviceCount === 0 && (
      <p className="absolute bottom-16 left-1/2 -translate-x-1/2 font-ioskeley text-xs text-console-text-muted tracking-wide">
        Enable devices from the Dashboard
      </p>
    )}
  </motion.div>
)}
```

#### HudReadout Component

Small positioning wrapper. Each corner gets `absolute` positioning:

```tsx
// client/src/routes/matter.tsx (local component)
type HudPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const positionClasses: Record<HudPosition, string> = {
  'top-left': 'top-6 left-6 items-start',
  'top-right': 'top-6 right-6 items-end text-right',
  'bottom-left': 'bottom-6 left-6 items-start',
  'bottom-right': 'bottom-6 right-6 items-end text-right',
}

function HudReadout({ position, children }: Readonly<{
  position: HudPosition
  children: React.ReactNode
}>) {
  return (
    <div className={cn('absolute flex flex-col gap-1 z-10', positionClasses[position])}>
      {children}
    </div>
  )
}
```

#### HUD Frame (CSS)

Thin border with L-shaped registration marks at corners. Added to `index.css`:

```css
/* hud technical-drawing frame */
.hud-frame {
  position: absolute;
  inset: 12px;
  border: 1px solid rgba(168, 151, 125, 0.15);
  pointer-events: none;
  z-index: 1;
}

/* registration marks at corners */
.hud-frame::before,
.hud-frame::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: rgba(168, 151, 125, 0.3);
  border-style: solid;
}

.hud-frame::before {
  top: -1px;
  left: -1px;
  border-width: 2px 0 0 2px;
}

.hud-frame::after {
  top: -1px;
  right: -1px;
  border-width: 2px 2px 0 0;
}
```

Bottom corners need additional elements. Use a nested span inside `.hud-frame` or two extra pseudo-element containers. Simplest approach: render 4 small `<div>` elements inside the frame div, one per corner, each with two-sided borders.

#### Outer Container Change

The paired view's parent container (line 110-115) currently toggles `bg-console-bg` based on `showDark`. Update so the container always takes full height when paired:

```tsx
<div
  className={cn(
    'transition-colors duration-500 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 -mt-8 pt-8',
    showDark
      ? 'bg-console-bg h-[calc(100vh-3.5rem)] overflow-hidden'
      : 'bg-transparent pb-8 min-h-[calc(100vh-3.5rem)]',
  )}
>
```

When paired (`showDark`): fixed height, no overflow, no padding-bottom — the HUD fills exactly.
When unpaired: scrollable, padded, existing layout.

#### Remove from Paired View

- `DarkConsolePanel` component — no longer rendered in paired view. Keep the component definition for now (it may be used elsewhere or in error state).
- `DarkGauge` component — same treatment.
- The `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">` wrapper with panels below the orbital.

#### Keep Header for Non-Paired Views

The "Matter Bridge" `<h1>` header (lines 117-134) should only show when NOT in paired/HUD mode. When paired, the HUD frame and corner readouts replace the header. Wrap with `{!showDark && (...)}`.

#### Error Panel in HUD

When `status === 'error'` and view is paired, show error text as a HUD readout rather than a DarkConsolePanel. Could be positioned center-bottom or as a pulsing label near the top-right corner.

**Acceptance criteria:**
- [x] Paired view fills viewport: `h-[calc(100vh-3.5rem)]` with `bg-console-bg`
- [x] No DarkConsolePanel or DarkGauge rendered in paired view
- [x] Four corner readouts display: STATUS (TL), headline (TR), DEVICES (BL), LINK (BR)
- [x] Thin border frame with registration marks visible
- [x] Header hidden in paired mode
- [x] Unpaired/commissioned views unchanged
- [x] Error state displays within HUD layout
- [x] `bun run system:check --force` passes

---

### Phase 2: Dynamic Orbital Sizing + Label Contrast

**Files:**
- `client/src/components/MatterOrbital.tsx` — remove size constraint, fix labels
- `client/src/index.css` — adjust `metadata-ring-group` transform-origin for dynamic sizing

#### Remove Fixed Size Constraint

Current (`MatterOrbital.tsx:49`):
```tsx
<div className="w-full max-w-[500px] mx-auto aspect-square">
```

Change to:
```tsx
<div className="w-full h-full flex items-center justify-center">
  <div className="h-full aspect-square max-h-full">
```

The orbital container takes the full height of its parent (the HUD center area) while maintaining aspect-square. The SVG's `viewBox="0 0 500 500"` handles proportional scaling automatically — all internal coordinates (ring at 250,250, labels at fixed positions) scale with the viewBox.

For non-HUD contexts (if MatterOrbital is ever used outside the paired view), the parent constrains the size. No explicit max-width needed.

#### Label Contrast Fix

Current (`MatterOrbital.tsx:24`):
```tsx
className="fill-console-text-dim"
```
`fill-console-text-dim` = `#6b6356` — too low contrast against `bg-console-bg` (#1a1914).

Change to:
```tsx
className="fill-console-text-muted"
```
`fill-console-text-muted` = `#a89b82` — significantly brighter, readable at small sizes. Values already use `fill-console-text` (#faf0dc) which is good.

#### Ring Transform-Origin

The CSS `transform-origin: 250px 250px` in `.metadata-ring-group` is in viewBox coordinates, which works correctly for SVG transforms regardless of rendered size. No change needed.

**Acceptance criteria:**
- [x] Orbital SVG fills available space in HUD (no 500px cap)
- [x] Orbital maintains aspect-square proportions
- [x] Metadata labels (PORT, PAIRED, UPTIME) visibly brighter — `fill-console-text-muted`
- [x] Values remain `fill-console-text` (bright)
- [x] Ring rotation still works at larger sizes
- [x] `bun run system:check --force` passes

---

### Phase 3: Solar Flare + Phosphor Bloom Enhancement

**Files:**
- `client/src/components/ui/text-art-orb.tsx` — flare constants
- `client/src/components/MatterOrbital.tsx` — bloom filter

#### Solar Flare Intensity

Current constants (`text-art-orb.tsx:57-58`):
```ts
const SPIKE_COUNT = 6
const SPIKE_MAX_LENGTH = 0.3
```

Change to:
```ts
const SPIKE_COUNT = 8
const SPIKE_MAX_LENGTH = 0.55
```

More spikes (8 vs 6) with longer reach (0.55 vs 0.3) creates the solar prominence effect. The spikes already have variable length and width via `spikeAt()` — increasing the max and count amplifies the existing animation.

Also tune the spike rendering in `spikeAt()` (`text-art-orb.tsx:68-94`):

- Increase base intensity from `0.65` to `0.8` (line 91) — brighter spikes
- Increase width range: `0.18 + sin(...) * 0.06` → `0.22 + sin(...) * 0.08` (line 80) — wider, more prominent
- Increase angular wobble: `sin(...) * 0.4` → `sin(...) * 0.6` (line 77) — more dramatic movement
- Increase length pulsing: `0.4 + 0.6 * max(...)` → `0.3 + 0.7 * max(...)` (line 79) — fuller range of extension/retraction

#### Phosphor Bloom Enhancement

Current filter (`MatterOrbital.tsx:58-66`):
```xml
<filter id="phosphor-bloom">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur2" />
  <feMerge>
    <feMergeNode in="blur1" />
    <feMergeNode in="blur2" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

Add a third wider bloom layer and increase the existing values:

```xml
<filter id="phosphor-bloom">
  {/* wide ambient glow */}
  <feGaussianBlur in="SourceGraphic" stdDeviation="3.0" result="bloom" />
  {/* medium character bleed */}
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur1" />
  {/* tight character edge */}
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blur2" />
  <feMerge>
    <feMergeNode in="bloom" />
    <feMergeNode in="blur1" />
    <feMergeNode in="blur2" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

Three layers:
- `stdDeviation="3.0"` — wide ambient glow, creates halo effect around the orb (density-adjacent: dense areas contribute more to the blur, so center glows brighter)
- `stdDeviation="1.5"` — medium bleed between adjacent characters
- `stdDeviation="0.5"` — tight edge glow preserving character detail

The feMerge stacks all layers with SourceGraphic on top, so character detail is always preserved. The wider bloom naturally responds to pixel density — areas with more lit braille dots (the orb center) contribute more to the blur and glow brighter. This achieves the "bloom based on actual pixels" from the brainstorm without per-element filters.

#### Breathing Animation Tuning (Optional)

The current breathing (`BREATH_AMOUNT = 0.06`, 6% radius oscillation, `text-art-orb.tsx:223`) works well. Consider increasing slightly to `0.08` to make it more visible at the larger HUD size, but only if it doesn't cause edge-pixel jumping. Test visually.

**Acceptance criteria:**
- [x] Solar flares noticeably longer and more dramatic than before
- [x] 8 spikes with wider angular spread
- [x] Phosphor bloom has visible ambient glow layer
- [x] Dense orb center glows brighter than sparse edges (natural density-based bloom)
- [x] Character detail preserved (SourceGraphic on top of blur stack)
- [x] Flare pulsing feels like solar prominences
- [x] `bun run system:check --force` passes

---

## System-Wide Impact

### Interaction Graph

- Matter poll (React Query, 10s) → `useMatterOrbitalData` → props flow to `MatterOrbital` + corner readouts
- `isPaired` change → transition effect → view state machine → AnimatePresence (unchanged)
- `setInterval` in TextArtOrb → direct DOM mutation (unchanged)
- CSS keyframes for ring rotation, breathing (unchanged)
- Corner readouts are pure render from bridge data — no new state, no new effects

### State Lifecycle Risks

- **No new state introduced.** Corner readouts derive from existing `bridge` query data. No new stores, no new effects, no new timers.
- **Layout shift on pair/unpair.** The AnimatePresence `mode="wait"` with opacity+scale transition handles this. The HUD appears/disappears as a single unit.
- **Large SVG performance.** At viewport size (~800-1000px rendered), the SVG filter runs on a larger area. The 3-layer bloom filter is more expensive. Monitor paint times — if sluggish, reduce the widest blur from 3.0 to 2.0.

### Error Propagation

- Bridge poll error → last-known data stays in corner readouts (React Query retains stale data)
- If orbital SVG fails to render, corner readouts still display (they're HTML, not SVG)

---

## Acceptance Criteria

### Functional Requirements

- [x] Paired view fills entire viewport below navbar
- [x] Dark console background edge-to-edge (no visible page background)
- [x] No DarkConsolePanel or DarkGauge in paired view
- [x] Corner readouts show STATUS, headline, DEVICES, LINK
- [x] Thin border frame with registration marks
- [x] Orbital SVG scales dynamically (no 500px cap)
- [x] Solar flares longer and more dramatic
- [x] Phosphor bloom has visible ambient glow
- [x] Metadata labels (PORT, PAIRED, UPTIME) brighter
- [x] Unpaired and commissioned views unaffected

### Non-Functional Requirements

- [x] No new dependencies added
- [x] No new state management (corner readouts are pure render)
- [x] SVG filter performance acceptable at viewport size
- [x] No `as any`, no `@ts-ignore`
- [x] `bun run system:check --force` passes after every phase

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/routes/matter.tsx` | Rewrite paired view: HUD layout, corner readouts, remove DarkConsolePanel/DarkGauge from paired view, hide header when paired |
| `client/src/components/MatterOrbital.tsx` | Remove max-w-500px, responsive sizing, bump label contrast to `fill-console-text-muted`, enhance bloom filter |
| `client/src/components/ui/text-art-orb.tsx` | Increase SPIKE_COUNT to 8, SPIKE_MAX_LENGTH to 0.55, tune spike intensity/width/wobble |
| `client/src/index.css` | Add `.hud-frame` styles with registration marks |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-05-matter-hud-layout-brainstorm.md](docs/brainstorms/2026-03-05-matter-hud-layout-brainstorm.md) — key decisions: full-viewport HUD, remove cards, brutalist corner readouts, border frame, increased flares/bloom/contrast

### Internal References

- Current paired view: `client/src/routes/matter.tsx:197-249`
- Orbital component: `client/src/components/MatterOrbital.tsx`
- Text-art orb: `client/src/components/ui/text-art-orb.tsx`
- Orbital data hook: `client/src/hooks/useMatterOrbitalData.ts`
- Console color tokens: `client/src/index.css:36-41`
- Phosphor bloom filter: `client/src/components/MatterOrbital.tsx:58-66`
- Spike constants: `client/src/components/ui/text-art-orb.tsx:56-58`
- Prior plan (text-art orb): `docs/plans/2026-03-05-feat-matter-orbital-text-art-hal-eye-plan.md` (completed)
