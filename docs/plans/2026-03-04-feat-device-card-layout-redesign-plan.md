---
title: "feat: Device Card Layout Redesign — Per-Type Display & Controls"
type: feat
status: completed
date: 2026-03-04
origin: docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md
---

# feat: Device Card Layout Redesign — Per-Type Display & Controls

## Overview

Redesign the interior layouts of LightCard, AirPurifierCard, and ThermostatCard with distinct compact (dashboard grid) and full (detail dialog) views. ReadoutDisplay becomes the focal point for key metrics. All three custom fonts — Commit Mono, IoskeleyMono, and Michroma — are used intentionally to create an instrument-panel aesthetic inspired by Sony Making Modern design language.

**What this is:** A focused redesign of *card interiors only* — the CardShell, Card primitives, SectionGroup, DnD, and dashboard layout are untouched. This is the "refine individual card designs" step noted in the previous plan.

**What this is not:** No new components in `ui/`, no new API endpoints, no schema changes. Pure visual and interaction refinement within existing card components.

## Problem Statement / Motivation

The 2D dashboard pivot (all 6 phases) is complete, but both the compact card and detail dialog currently render the **exact same component** — there is no distinction between the at-a-glance dashboard view and the full-control expanded view. This defeats the two-layer interaction model from the original brainstorm.

Additionally:
- **LightCard doesn't use ReadoutDisplay** — brightness is plain text, missing the UV display window aesthetic
- **Michroma is underutilized** — only section labels, not control labels on cards
- **IoskeleyMono is confined to ReadoutDisplay** — slider outputs and secondary values use system fonts
- **AirPurifierCard fan speed is a 0-100 slider** — the Core 300S only supports discrete levels (Auto/Sleep/1/2/3), not continuous percentage
- **ThermostatCard mode buttons are generic pills** — not the transport-style controls from the brainstorm

The cards need to feel like Sony instrument panels: every label precision-placed in Michroma, every value rendered in IoskeleyMono, every control laid out with purpose.

## Proposed Solution

### Design Principles

1. **ReadoutDisplay as hero** — every card type leads with a dark UV display window showing the most important metric
2. **Font hierarchy creates the instrument panel feel:**
   - **Michroma** (`font-michroma text-[10px] uppercase tracking-widest`) — control category labels: BRI, CCT, FAN, MODE, FILTER, TARGET, AQI. Tiny, geometric, wide-set — like embossed text on an equipment faceplate
   - **IoskeleyMono** (`font-ioskeley`) — all numeric values: slider outputs, readout values, percentages. Not just ReadoutDisplay internals but anywhere a number appears
   - **Commit Mono** (`font-commit`) — body text: device names, status labels, descriptive text
3. **Compact shows, dialog controls** — compact cards show current state at a glance with minimal interaction (power toggle, one primary slider). Full controls (scene presets, color wheel, mode picker, detailed adjustments) live in the detail dialog
4. **No new primitives** — compose from existing Card, ReadoutDisplay, React Aria components, and Tailwind

### Card Layouts

#### LightCard

**ReadoutDisplay content per light capability:**

| Capability | On | Off |
|---|---|---|
| CCT-only | `72%` + `4000K` | `OFF` (dimmed) |
| RGB-only | `72%` + color dot | `OFF` (dimmed) |
| Full-color (white mode) | `72%` + `4000K` | `OFF` (dimmed) |
| Full-color (color mode) | `72%` + color dot | `OFF` (dimmed) |
| Brightness-only | `72%` | `OFF` (dimmed) |

Format: brightness % left-aligned in IoskeleyMono, secondary value right-aligned. Color dot is a `w-3 h-3 rounded-full` inline element with the RGB color as background. Off state: show `OFF` in `text-[#faf0dc]/30` (dimmed cream).

**Compact card** — hero readout + brightness slider:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │  72%            4000K    │ │  ReadoutDisplay (lg)
│ └──────────────────────────┘ │  brightness + CCT (or RGB hex)
│                              │
│ BRI ━━━━━━━━●━━━━━━━━ 72%   │  brightness slider
│                              │  Michroma label, IoskeleyMono output
│ [Turn Off]                   │  power toggle
└──────────────────────────────┘
```

- ReadoutDisplay (lg) spans full width, shows brightness % left + color temp K right (or `#hex` for RGB mode)
- Single brightness slider with Michroma "BRI" label and IoskeleyMono output value
- Power toggle button (existing style)
- **Removed from compact:** scene presets, CCT swatches, CCT slider, RGB color wheel, color presets, hex input, white/color mode toggle
- Light accent system unchanged — ReadoutDisplay gets a subtle `box-shadow` glow matching the light's color temp when on

**Full dialog** — all controls exposed:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │  72%            4000K    │ │  ReadoutDisplay (lg)
│ └──────────────────────────┘ │
│                              │
│ ◉ Relax  ◉ Read  ◉ Focus .. │  scene presets
│                              │
│ [  White  ] [ Color ]        │  mode toggle (full-color only)
│                              │
│ BRI ━━━━━━━━●━━━━━━━━ 72%   │  brightness slider
│                              │
│ CCT ● ● ● ● ●               │  CCT swatches (white mode)
│     ━━━━━━━━●━━━━━━ 4000K   │  CCT slider
│        — or —                │
│     [  color wheel  ]        │  RGB picker (color mode)
│     ● ● ● ● ● ● [#hex]     │  color presets + hex input
│                              │
│ [Turn Off]                   │  power toggle
└──────────────────────────────┘
```

- All existing LightCard controls, reorganized with Michroma section labels
- Scene presets moved here from compact card
- CCT swatches + slider with Michroma "CCT" label
- Mode toggle, color wheel, presets — all existing, just relocated

#### AirPurifierCard

**Compact card** — PM2.5 readout + AQI bar + filter:

```
┌──────────────────────────────┐
│ ┌──────────────┐             │
│ │    12        │  ● Good     │  ReadoutDisplay (lg) + AQI badge
│ │   ug/m3     │             │
│ └──────────────┘             │
│                              │
│ AQI  ▓▓▓░░░░░░░░░░░░░░░░░  │  segmented AQI bar
│                              │  Michroma label
│ FILTER ▓▓▓▓▓▓▓▓▓░░░░░ 78%  │  filter life bar
│                              │  Michroma label, IoskeleyMono %
│ [Turn Off]                   │  power toggle
└──────────────────────────────┘
```

- ReadoutDisplay (lg) for PM2.5 — unchanged from current
- AQI badge beside readout — unchanged
- New: segmented AQI bar with 4 discrete segments (Good/Fair/Poor/Hazardous) that illuminate based on air quality level, Michroma "AQI" label
- Filter life bar with Michroma "FILTER" label and IoskeleyMono percentage
- Power toggle
- **Removed from compact:** fan speed slider

**Full dialog** — adds fan speed control:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │    12          ug/m3     │ │  ReadoutDisplay (lg) — larger
│ └──────────────────────────┘ │
│                     ● Good   │  AQI badge
│                              │
│ AQI  ▓▓▓░░░░░░░░░░░░░░░░░  │  segmented AQI bar
│                              │
│ FAN  [Auto][Slp][ 1][ 2][ 3]│  stepped fan buttons
│                              │  Michroma label, transport-style
│ FILTER ▓▓▓▓▓▓▓▓▓░░░░░ 78%  │  filter life bar
│                              │
│ [Turn Off]                   │  power toggle
└──────────────────────────────┘
```

- Full-width ReadoutDisplay for PM2.5
- Fan speed as **discrete step buttons** (Auto / Sleep / 1 / 2 / 3) instead of continuous 0-100 slider — matches the VeSync Core 300S actual capabilities. Transport-button style: row of recessed rectangular buttons, active button highlighted (from brainstorm)
- Michroma "FAN" label for the speed section

#### ThermostatCard

**Compact card** — current temp + target + mode:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │  22.5°C                  │ │  ReadoutDisplay (lg)
│ └──────────────────────────┘ │
│                              │
│ TARGET  [−]  21.0°C  [+]    │  target temp controls
│                              │  Michroma label, IoskeleyMono value
│ MODE [HEAT][COOL][AUTO][OFF] │  transport-style mode buttons
│                              │  Michroma label
└──────────────────────────────┘
```

- ReadoutDisplay (lg) for current temperature — already exists, keep as-is
- Target temp row with Michroma "TARGET" label, IoskeleyMono value, +/- buttons
- Mode: keep the full mode picker in compact (HEAT/COOL/AUTO/OFF) — unlike LightCard and AirPurifierCard, the thermostat has no separate power toggle; "OFF" mode IS the power off. Removing mode buttons from compact would leave no way to turn off the thermostat without opening the dialog. Use transport-button style in both compact and full.
- Humidity shown inline if available: `22.5°C  48% RH` inside the ReadoutDisplay

**Full dialog** — adds mode picker + details:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │  22.5°C        48% RH   │ │  ReadoutDisplay (lg) — with humidity
│ └──────────────────────────┘ │
│                              │
│ TARGET  [−]  21.0°C  [+]    │  target temp controls
│                              │
│ MODE [HEAT][COOL][AUTO][OFF] │  full mode picker
│                              │  transport-style buttons
│ [Turn Off]                   │  power toggle (if applicable)
└──────────────────────────────┘
```

- ReadoutDisplay shows both current temp and humidity (if available)
- Full mode picker with transport-style buttons: HEAT / COOL / AUTO / OFF — active mode highlighted with amber accent, others recessed
- Michroma labels throughout

### Shared Design Tokens

#### Michroma Control Labels

```css
/* control label — embossed faceplate text */
.control-label {
  @apply font-michroma text-[10px] uppercase tracking-widest text-stone-400;
}
```

Apply consistently: BRI, CCT, FAN, MODE, FILTER, TARGET, AQI, SCENES — small, geometric, wide-set. These labels anchor each control section.

**Accessibility:** Michroma abbreviations need `aria-label` with the full word. Pattern:

```tsx
<span className="font-michroma text-[10px] uppercase tracking-widest text-stone-400" aria-label="Brightness">BRI</span>
```

Screen readers will read "Brightness" instead of spelling out "B-R-I".

#### IoskeleyMono Values

All numeric outputs use IoskeleyMono, not just ReadoutDisplay internals:
- Slider output values: `72%`, `4000K`, `21.0°C`
- Filter life percentage
- Fan speed level indicator
- Target temperature value between +/- buttons

```tsx
<span className="font-ioskeley text-xs text-stone-600">72%</span>
```

#### Transport-Style Buttons

Mode selectors (thermostat modes, fan speed steps) use a consistent transport-button style inspired by the brainstorm's cassette transport controls:

```tsx
<Button
  className={cn(
    'px-3 py-1.5 text-[10px] font-michroma uppercase tracking-wider',
    'rounded-md border transition-colors cursor-default',
    active
      ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]'
      : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100',
  )}
>
```

Small, recessed feel. Active button has amber highlight. Michroma text.

#### Segmented AQI Bar

New visual element for AirPurifierCard — 4 discrete segments:

```
▓▓▓▓▓▓ ▓▓▓▓▓▓ ░░░░░░ ░░░░░░
 Good    Fair    Poor   Hazard
```

Each segment is a rounded rectangle. Lit segments use the AQI color (emerald → yellow → orange → red). Unlit segments are `bg-stone-100`. Number of lit segments maps to `airQuality` value.

#### ReadoutDisplay Enhancements

Add an optional `glow` prop to ReadoutDisplay for light-card reactive display:

```tsx
<ReadoutDisplay size="lg" glow={lightColor}>
  72% <span>4000K</span>
</ReadoutDisplay>
```

When `glow` is provided, adds a subtle `box-shadow` in that color around the display window — simulating the light bleeding through the display. Only used on LightCard when the light is on.

Also add an `aria-label` prop to ReadoutDisplay for screen reader context:

```tsx
<ReadoutDisplay size="lg" glow={lightColor} aria-label="Brightness: 72%, Color temperature: 4000K">
  72% <span>4000K</span>
</ReadoutDisplay>
```

#### Accessibility Cleanup

Migrate raw `<button>` elements in LightCard to React Aria `<Button>`:
- Scene preset buttons (currently `<button type="button">`)
- Mode toggle buttons (white/color)
- CCT swatch buttons
- Color preset buttons

This aligns with the project's React Aria convention and improves keyboard/screen reader support.

## Technical Approach

### Architecture

No new files. All changes are modifications to existing components:

```
client/src/components/
  device-cards/
    LightCard.tsx         ← compact/full variant redesign
    AirPurifierCard.tsx   ← compact/full variant + AQI bar + fan steps
    ThermostatCard.tsx    ← compact/full variant + transport modes
  ui/
    readout-display.tsx   ← add glow prop
  DeviceDetailDialog.tsx  ← pass variant="full" to card components
```

### Variant Prop Pattern

Each card component receives an optional `variant` prop:

```tsx
interface LightCardProps {
  device: Device
  variant?: 'compact' | 'full'
  onAccentChange?: (accent: ... | null) => void
  onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}
```

- `DeviceCard.tsx` renders with default `variant="compact"` (no prop change needed since compact is default)
- `DeviceDetailDialog.tsx` passes `variant="full"` to each card component

This is the minimal change to support two views. No context providers, no render props — just a prop.

### Implementation Phases

#### Phase 1: Variant System + ReadoutDisplay Enhancement

Establish the compact/full variant pattern and enhance ReadoutDisplay.

**Files to modify:**
- `client/src/components/ui/readout-display.tsx` — add `glow` prop
- `client/src/components/DeviceDetailDialog.tsx` — pass `variant="full"` to card components

**Tasks:**

- [x] Add `glow?: string` prop to `ReadoutDisplay` — when provided, adds `box-shadow: 0 0 12px 2px ${glow}` with 30% opacity
- [x] Update `renderDetailBody()` in `DeviceDetailDialog.tsx` to pass `variant="full"` to LightCard, AirPurifierCard, ThermostatCard
- [x] Add `variant?: 'compact' | 'full'` to LightCardProps, AirPurifierCardProps, ThermostatCardProps (no behavior change yet — just the prop)
- [x] Run `bun run system:check --force`

**Success criteria:** Variant prop is plumbed through. ReadoutDisplay accepts a glow color. No visual changes yet.

#### Phase 2: LightCard Redesign

Redesign LightCard with compact/full split.

**Files to modify:**
- `client/src/components/device-cards/LightCard.tsx`

**Tasks:**

- [x] **Compact view** (`variant !== 'full'`):
  - Add full-width ReadoutDisplay (lg) showing brightness % (left) + color temp K or `#hex` (right)
  - Use `glow` prop on ReadoutDisplay: pass the light's current color via `tempToColor(colorTemp)` or RGB value when on
  - ReadoutDisplay values: brightness as IoskeleyMono number, unit suffix as `text-xs text-[#faf0dc]/50`
  - Keep brightness slider with Michroma "BRI" label (`font-michroma text-[10px] uppercase tracking-widest text-stone-400`) and IoskeleyMono output value
  - Keep power toggle button (existing style)
  - Remove: scene presets, CCT swatches, CCT slider, RGB controls, mode toggle, hex input
  - Light accent system (`onAccentChange`) still works — brightness slider still pushes live accent

- [x] **Full view** (`variant === 'full'`):
  - Same ReadoutDisplay hero at top
  - Scene presets row with Michroma "SCENES" label
  - Mode toggle (White / Color) for full-color lights
  - Brightness slider with Michroma "BRI" label
  - CCT section with Michroma "CCT" label: swatches + slider (white mode)
  - RGB section: color wheel + presets + hex input (color mode)
  - Power toggle at bottom
  - All existing controls, just reorganized with Michroma section labels and IoskeleyMono values

- [x] Migrate raw `<button>` elements to React Aria `<Button>`: scene presets, mode toggle, CCT swatches, color presets
- [x] Update slider output values to use `font-ioskeley` class
- [x] Run `bun run system:check --force`

**Success criteria:** Compact LightCard is clean and focused — ReadoutDisplay hero, one slider, power toggle. Dialog shows all controls organized with Michroma labels. Light accent and live preview still work.

#### Phase 3: AirPurifierCard Redesign

Redesign AirPurifierCard with segmented AQI bar and stepped fan controls.

**Files to modify:**
- `client/src/components/device-cards/AirPurifierCard.tsx`

**Tasks:**

- [x] **Compact view** (`variant !== 'full'`):
  - Keep ReadoutDisplay (lg) for PM2.5 + AQI badge — unchanged
  - Add segmented AQI bar: 4 rounded-rect segments in a flex row with Michroma "AQI" label
    - Segments light up based on `airQuality` value (1 = first segment only, 2 = first two, etc.)
    - Colors: `bg-emerald-400`, `bg-yellow-400`, `bg-orange-400`, `bg-red-400`
    - Unlit segments: `bg-stone-100`
    - Each segment: `h-2 flex-1 rounded-sm` with `gap-1` between
  - Filter life bar with Michroma "FILTER" label, IoskeleyMono percentage
  - Power toggle
  - Remove: fan speed slider (moved to dialog)

- [x] **Full view** (`variant === 'full'`):
  - Full-width ReadoutDisplay for PM2.5
  - AQI badge + segmented bar
  - Fan speed as **stepped transport buttons**: Auto / Sleep / 1 / 2 / 3
    - Map fan speed percentage to discrete levels: 0=Auto, 20=Sleep, 40=1, 60=2, 80+=3 (or use `fanMode` if available in state)
    - Michroma "FAN" label
    - Transport-button style: `px-3 py-1.5 text-[10px] font-michroma uppercase tracking-wider rounded-md border`
    - Active: `bg-amber-50 text-amber-800 border-amber-300`
    - Inactive: `bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100`
    - On press: call `onStateChange(device.id, { fanSpeed: mappedValue })`
  - Filter life bar
  - Power toggle

- [x] Run `bun run system:check --force`

**Success criteria:** Compact shows PM2.5 readout + visual AQI bar + filter status. Dialog adds discrete fan speed controls. Continuous slider is replaced with stepped buttons matching actual hardware capabilities.

#### Phase 4: ThermostatCard Redesign

Redesign ThermostatCard with transport-style mode buttons and improved layout.

**Files to modify:**
- `client/src/components/device-cards/ThermostatCard.tsx`

**Tasks:**

- [x] **Compact view** (`variant !== 'full'`):
  - ReadoutDisplay (lg) for current temp — keep existing
  - If humidity available, show it inside the ReadoutDisplay: `22.5°C  48% RH` (humidity as smaller `text-sm text-[#faf0dc]/50` suffix)
  - Target temp row with Michroma "TARGET" label (replacing plain "Target" text)
  - Target temp value between +/- buttons in IoskeleyMono: `font-ioskeley text-sm font-semibold`
  - Mode picker: transport-style buttons (HEAT / COOL / AUTO / OFF) — **keep in compact** because "OFF" is the only power-off mechanism for thermostats (no separate power toggle)
    - Michroma "MODE" label
    - Active mode: amber highlight (or heat=orange, cool=blue)

- [x] **Full view** (`variant === 'full'`):
  - ReadoutDisplay (lg) with temp + humidity
  - Target temp row (same as compact)
  - Mode picker: same transport-style buttons (HEAT / COOL / AUTO / OFF)
    - Larger button sizing in full view
    - Heat active: `bg-orange-50 text-orange-800 border-orange-300`
    - Cool active: `bg-blue-50 text-blue-800 border-blue-300`
    - Auto/Off: amber (default)
  - +/- buttons unchanged

- [x] Run `bun run system:check --force`

**Success criteria:** Compact shows current temp, target, and full mode picker (needed for off control). Dialog shows same controls with more room. Transport-style buttons give it the instrument-panel feel. All numeric values use IoskeleyMono.

#### Phase 5: Polish + Consistency Pass

Final refinements across all three card types.

**Files to modify:**
- `client/src/components/device-cards/LightCard.tsx`
- `client/src/components/device-cards/AirPurifierCard.tsx`
- `client/src/components/device-cards/ThermostatCard.tsx`
- `client/src/components/DeviceDetailDialog.tsx`

**Tasks:**

- [x] Verify consistent Michroma label sizing and spacing across all three card types
- [x] Verify all slider outputs use IoskeleyMono
- [x] Verify transport-button style is consistent between thermostat modes and fan speed steps
- [x] Test offline state: controls disabled, ReadoutDisplay still shows last known values, muted opacity applied by CardShell
- [x] Test light accent system: brightness slider in compact LightCard still pushes live accent to CardShell border
- [x] Verify keyboard navigation: Tab through controls, Enter/Space to activate buttons, Arrow keys for sliders
- [x] Run `bun run system:check --force`

**Success criteria:** All three card types feel like they belong to the same instrument panel family. Consistent font usage, consistent control styles, consistent spacing. Keyboard accessible. Passes lint + typecheck.

## System-Wide Impact

- **Interaction graph**: No change. Cards still dispatch state changes via `onStateChange` → mutation → PATCH → SSE confirms. The variant prop is purely visual — no new API calls or state management.
- **Error propagation**: Unchanged. Fan speed step buttons call the same `onStateChange` as the old slider, just with discrete values.
- **State lifecycle risks**: None. Local `useState` + `useEffect` sync pattern is unchanged. The AirPurifierCard fan speed mapping (percentage → discrete level) is a one-way conversion at the UI layer.
- **API surface parity**: No new endpoints. Fan speed values sent to the API are still numeric percentages — the mapping from button to value happens client-side.

## Acceptance Criteria

### Functional Requirements

- [ ] LightCard compact shows ReadoutDisplay hero + brightness slider only
- [ ] LightCard full shows all controls (scenes, CCT, RGB, brightness)
- [ ] AirPurifierCard compact shows PM2.5 readout + segmented AQI bar + filter bar
- [ ] AirPurifierCard full adds stepped fan speed buttons (Auto/Sleep/1/2/3)
- [ ] ThermostatCard compact shows temp readout + target + mode indicator
- [ ] ThermostatCard full adds mode picker with transport-style buttons
- [ ] All control labels use Michroma (`font-michroma text-[10px] uppercase tracking-widest`)
- [ ] All numeric values use IoskeleyMono (`font-ioskeley`)
- [ ] ReadoutDisplay on LightCard has color-reactive glow when light is on
- [ ] Transport-style buttons are consistent between thermostat mode and fan speed

### Non-Functional Requirements

- [ ] No new files created — all changes in existing components
- [ ] No new dependencies added
- [ ] All React Aria components used correctly (Button, Slider, etc.)
- [ ] Keyboard navigation works for all interactive elements
- [ ] Offline devices show disabled controls + muted card
- [ ] `bun run system:check --force` passes

## Dependencies & Risks

**Dependencies:** None — all infrastructure (ReadoutDisplay, CardShell, fonts, color-utils) already exists.

**Risks:**
- **Fan speed mapping** — the VeSync Core 300S API takes 0-100 percentage values, but only supports 5 discrete modes. The button-to-percentage mapping needs to match what the adapter expects. Verify by checking the VeSync adapter's `setFanSpeed` handler.
- **ReadoutDisplay glow performance** — box-shadow with color values on many cards could cause repaint overhead. Keep the shadow small (12px spread) and use `will-change: box-shadow` if needed.
- **Compact LightCard loses quick CCT access** — users who frequently change color temperature will need to open the dialog. This is an intentional trade-off for a cleaner compact card, but monitor feedback.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md](docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md) — carried forward: per-type card face layouts, transport-style mode buttons, ReadoutDisplay as focal point, Michroma for control labels. Adapted from 3D R3F to 2D CSS.
- **Previous plan (completed):** [docs/plans/2026-03-04-feat-device-card-redesign-2d-pivot-plan.md](docs/plans/2026-03-04-feat-device-card-redesign-2d-pivot-plan.md) — established design language, font system, ReadoutDisplay component, two-layer interaction model.

### Internal References

- ReadoutDisplay component: `client/src/components/ui/readout-display.tsx`
- LightCard: `client/src/components/device-cards/LightCard.tsx`
- AirPurifierCard: `client/src/components/device-cards/AirPurifierCard.tsx`
- ThermostatCard: `client/src/components/device-cards/ThermostatCard.tsx`
- DeviceDetailDialog: `client/src/components/DeviceDetailDialog.tsx`
- Card primitives: `client/src/components/ui/card.tsx`
- Font theme: `client/src/index.css` (lines 22-34)
- Color utils: `client/src/lib/color-utils.ts`
