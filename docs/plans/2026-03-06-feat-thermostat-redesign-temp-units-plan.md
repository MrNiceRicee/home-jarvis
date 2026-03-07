---
title: "feat: Thermostat Card Redesign, Temperature Unit Preference, Track Thumb Z-Index Fix"
type: feat
status: completed
date: 2026-03-06
---

# Thermostat Card Redesign + Temperature Unit Config + Z-Index Fix

## Overview

Three related improvements: (1) full redesign of the thermostat compact and detail views with proper compact/full differentiation, (2) a global temperature unit preference (°F/°C), and (3) a z-index bug where slider thumbs overlap the sticky navbar.

## Problem Statement

- **ThermostatCard ignores `variant` prop** — compact and full views are identical. Every other card (LightCard, AirPurifierCard) has meaningful differentiation. The compact card shows too many controls for a dashboard glance.
- **Temperature is always Celsius** — no way to switch to Fahrenheit. Internally everything stays Celsius (correct), but the display layer has no unit preference.
- **Slider thumbs at `z-10` overlap the navbar** (also `z-10`) when scrolling cards near the top of the viewport.

## Proposed Solution

### Phase 1: Z-Index Bug Fix (5 min)

Add `isolation: isolate` to the card shell to create a local stacking context. This prevents any card-internal z-index from escaping to the page level, regardless of value.

**File:** `client/src/components/DeviceCard.tsx`

On the `CardShell` outer div, add `isolate` to the className. This is the CSS `isolation: isolate` property via Tailwind — it creates a new stacking context so `z-10` thumbs inside a card can never compete with the `z-10` navbar outside the card.

No need to change thumb or navbar z-index values. The `isolate` approach is robust against future z-index additions inside cards.

**Verify:** Scroll a light card with faders near the top of the viewport. The thumb should no longer overlap the navbar.

### Phase 2: Temperature Unit Preference

#### 2.1 Client-Side Preference Store

This is a single-user local dashboard — client-side persistence is sufficient (no server/DB needed).

**New file:** `client/src/stores/preferences-store.ts`

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type TemperatureUnit = 'C' | 'F'

interface PreferencesState {
  temperatureUnit: TemperatureUnit
  setTemperatureUnit: (unit: TemperatureUnit) => void
}

// persist to localStorage so it survives page reloads
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      temperatureUnit: 'F',
      setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),
    }),
    { name: 'jarvis-preferences' },
  ),
)
```

Default to `'F'` since the user's Resideo account is US-based (Fahrenheit-native).

#### 2.2 Client-Side Temperature Formatting Utility

**New file:** `client/src/lib/temperature.ts`

```ts
export type TemperatureUnit = 'C' | 'F'

// celsius to fahrenheit (display only — whole number)
export function cToF(c: number): number {
  if (!Number.isFinite(c)) return 0
  return Math.round((c * 9) / 5 + 32)
}

// format for display: value + unit symbol
export function formatTemp(celsius: number, unit: TemperatureUnit): string {
  if (!Number.isFinite(celsius)) return '--'
  if (unit === 'F') return `${cToF(celsius)}°F`
  return `${Math.round(celsius * 10) / 10}°F` // 1 decimal for C
}

// display value only (no unit symbol) — for ReadoutDisplay
export function displayTemp(celsius: number, unit: TemperatureUnit): string {
  if (!Number.isFinite(celsius)) return '--.-'
  if (unit === 'F') return `${cToF(celsius)}`
  return `${(Math.round(celsius * 10) / 10).toFixed(1)}`
}

// stepper delta in celsius for the given display unit
export function stepperDelta(unit: TemperatureUnit): number {
  // F users expect 1°F steps (~0.56°C), C users expect 0.5°C steps
  return unit === 'F' ? 5 / 9 : 0.5
}

// round a celsius value to the nearest clean display increment
export function roundToStep(celsius: number, unit: TemperatureUnit): number {
  if (unit === 'F') {
    // round-trip through F to get clean F values
    const f = Math.round((celsius * 9) / 5 + 32)
    return ((f - 32) * 5) / 9
  }
  return Math.round(celsius * 2) / 2
}
```

#### 2.3 Consuming the Preference

Every component that displays temperature reads from the store:

```ts
const unit = usePreferencesStore((s) => s.temperatureUnit)
```

**Components to update:**
- `ThermostatCard.tsx` — current temp, target temp, stepper delta, aria-labels
- `SensorCard.tsx` — if it shows temperature
- `FridgeCard.tsx` — if it shows temperature
- Any navbar readout that shows temperature

#### 2.4 UI Toggle Placement

Add a `TwoPositionToggle` (°C / °F) in the **thermostat detail dialog** (full view only). This is a global preference — toggling it on one thermostat changes all temperature displays.

Long-term, this belongs on a settings page. For now, the thermostat detail dialog is the natural home since that's where temperature is most prominent.

### Phase 3: Thermostat Card Redesign

Visual design decisions from `docs/brainstorms/2026-03-06-thermostat-visual-redesign-brainstorm.md`.

#### 3.1 Mercury Column Gauge Component

**New file:** `client/src/components/ui/mercury-column.tsx`

A vertical temperature gauge using the ReadoutDisplay dark glass material. This is the thermostat's signature visual element — like faders for lights and the radial dial for purifiers.

**Construction:**
- **Outer container:** Same `background`, `border`, `box-shadow` as ReadoutDisplay. Tall and narrow (~24-32px wide, height fills available space). Same glass overlays (scanline texture, glass highlight, corner vignette, depth gradient).
- **Mercury fill:** `div` with `height` proportional to `(currentTemp - 7) / (35 - 7)` (Celsius internally, 45-95°F / 7-35°C range). Vertical gradient in the mode color — brighter at the top (liquid surface), deeper saturation below. Subtle `box-shadow` glow in mode color.
- **Bulb:** Small circle at column base, same mode color with stronger glow. When OFF, dark (outline only).
- **Tick marks (full view only):** Horizontal lines beside the column at 5° intervals, `font-michroma text-[8px] text-stone-400`. Same tick style as BRT fader detents on LightCard.

**Mercury colors by mode:**

| Mode | Mercury Fill | Bulb Glow |
|------|-------------|-----------|
| HEAT | Orange gradient (`rgb(249,115,22)`) | Orange glow |
| COOL | Blue gradient (`rgb(59,130,246)`) | Blue glow |
| AUTO | Emerald green gradient (`rgb(52,211,153)`) | Green glow |
| OFF | Gray (`stone-600`, dim) | Dark (outline only) |

**Props:**
```ts
interface MercuryColumnProps {
  temperatureCelsius: number        // current temp (determines fill height)
  mode: 'heat' | 'cool' | 'auto' | 'off'  // determines fill color
  variant: 'compact' | 'full'      // compact = no tick labels, full = tick labels
  targetCelsius?: number            // full view: show target marker position
  unit: 'C' | 'F'                  // for tick label display
  className?: string
}
```

#### 3.2 Transport Key Bank Component

**New file:** `client/src/components/ui/transport-key-bank.tsx`

Cassette deck-style latching push-keys for mode selection. Distinct from ToggleBank — more retro/mechanical.

**Visual treatment:**
- Row of recessed rectangular push-keys, touching edge-to-edge (no gap)
- Each key: ~48px wide, ~32px tall
- **Active key:** Depressed inward (deeper `inset` box-shadow), illuminated LED edge in mode color, bold text
- **Inactive keys:** Raised (outward box-shadow like PanelButton), embossed label text in muted stone, no LED
- **Animation:** Brief spring (~60-80ms) on key depression — fast enough to feel mechanical, slight overshoot before settling
- Labels: `font-michroma text-2xs uppercase`

**How it differs from ToggleBank:**
- Rectangular keys (wider than tall) vs. square pushbuttons
- Keys touch/abut vs. gap between buttons
- No separate LED indicator dot — the key edge itself illuminates
- Depressed/raised mechanical feel vs. inset shadow + dot

**Props:**
```ts
interface TransportKeyBankProps {
  label: string
  options: { key: string; label: string; ledColor?: string }[]
  value: string
  onChange: (key: string) => void
  disabled?: boolean
}
```

#### 3.3 Compact Card Layout

Glanceable summary, no interactive controls.

**Layout (left to right):**
- **Mercury column** (left edge): Spans card body height, bulb at bottom. No tick labels (too short for legibility). Fill height = current temp.
- **ReadoutDisplay** (lg, vertically centered against column): Current temp (hero, left) + humidity `% RH` (right).
- **Mode label** (below readout): `font-michroma text-2xs uppercase` colored label — "HEATING" in orange, "COOLING" in blue, "AUTO" in green, "OFF" in muted stone.
- **No stepper, no transport keys, no F/C toggle** — these live in the detail dialog.
- `PowerButton` in card footer remains interactive (toggles between last active mode and "off").

```
 ┌────────────────────────────────┐
 │  ██  ┌──────────────────┐     │
 │  ██  │ 72°F      41%RH  │     │
 │  █▓  └──────────────────┘     │
 │  ░░       HEATING             │
 │  (●)                          │
 │  [◉]PWR              MATTER   │
 └────────────────────────────────┘
```

#### 3.4 Full View (Detail Dialog) Layout

All controls. Mercury column grows taller and becomes interactive.

**Left side — Interactive mercury column:**
- Taller column filling most of dialog height
- Mercury fill = current temp (read-only, glowing)
- **Target marker:** Draggable indicator on the tick scale. Fader thumb aesthetic (brushed aluminum knob) oriented as a horizontal pointer. Points left from tick scale toward column.
- **Implementation:** React Aria `Slider` with vertical orientation, thumb styled as the pointer.
- Tick marks at 5° intervals with temperature labels
- Bulb at bottom with mode-colored glow

**Right side — Controls:**
- **ReadoutDisplay** (lg) — current temp + humidity
- **Target readout + steppers:** `TARGET` label (Michroma), `PanelButton (−)` + `ReadoutDisplay (sm)` + `PanelButton (+)` for +-1°F or +-0.5°C. Syncs with the draggable column marker.
- **Transport key bank:** `MODE` label, four keys: OFF | COOL | AUTO | HEAT. Active key depressed with LED edge in mode color.
- **F/C toggle:** `TwoPositionToggle` for `°F / °C`, below mode selector.
- **Target bounds:** Clamped to 7-35°C (45-95°F).

```
 ┌──────────────────────────────────────┐
 │                                      │
 │   ██ ─ 95   ┌──────────────────┐    │
 │   ██ ─ 90   │ 72°F      41%RH  │    │
 │   ██ ─ 85   └──────────────────┘    │
 │   ██ ─ 80                           │
 │   ██◄─ 75   TARGET                  │
 │   ██ ─ 70   [−] ┌─────┐ [+]        │
 │   █▓ ─ 65       │ 75°F │            │
 │   ░░ ─ 60       └─────┘            │
 │   ░░ ─ 55                           │
 │   ░░ ─ 50   MODE                    │
 │   ░░ ─ 45   ┌────┐┌────┐┌────┐┌────┐│
 │   (●)       │ OFF ││COOL││AUTO││HEAT││
 │              └────┘└────┘└────┘└────┘│
 │             UNIT                     │
 │             ┌───────────┐            │
 │             │ °F ┃┃ °c  │            │
 │             └───────────┘            │
 └──────────────────────────────────────┘
 ◄ = draggable target marker (fader thumb style)
```

#### 3.5 StatusBar Mode Colors

Update `DeviceCard.tsx` StatusBar logic for thermostats. Currently thermostats fall through to the generic `isOn ? emerald : muted` branch because they have no `state.on`.

**Approach:** Synthesize `state.on` in the adapter (`on = mode !== 'off'`), then add thermostat-specific StatusBar colors:

```
type === 'thermostat' && mode === 'heat'  → orange accent bar
type === 'thermostat' && mode === 'cool'  → blue accent bar
type === 'thermostat' && mode === 'auto'  → emerald green accent bar
type === 'thermostat' && mode === 'off'   → muted bar
```

StatusBar, mercury column, and transport key LEDs all use the same mode color constants. AUTO uses emerald green (not amber) to avoid visual confusion with HEAT's orange in the glowing mercury context.

#### 3.6 Adapter: Synthesize `state.on`

In `server/src/integrations/resideo/adapter.ts`, when building `DeviceState` in both `fetchDevices` and `fetchDeviceState`, add:

```ts
on: mode !== 'off',
```

This gives the card shell, StatusBar, and PowerButton correct behavior. The PowerButton toggles between the last active mode and "off".

#### 3.7 NaN/Infinity Guards

Add `Number.isFinite()` guards in `ThermostatCard` before calling `.toFixed()` or displaying temperature values. Use `'--.-'` as the fallback display for non-finite values. The `displayTemp` utility from Phase 2 handles this.

#### 3.8 Offline State

When `device.online === false`:
- **Mercury column:** Fill drops to minimum height, color shifts to dim gray regardless of mode
- **Bulb:** Dark (outline only, no glow)
- **ReadoutDisplay:** Shows last known temperature at `opacity-50`
- **"OFFLINE" label:** `font-michroma text-2xs text-stone-400` below the readout
- **All controls disabled:** Steppers, transport keys, and column drag are disabled

## Acceptance Criteria

- [x] Slider thumbs never overlap the navbar on scroll
- [x] Mercury column gauge renders in compact card with mode-tinted fill and glowing bulb
- [x] Mercury column fill height maps current temp linearly within 45-95°F (7-35°C) range
- [x] Mercury colors: orange (heat), blue (cool), emerald green (auto), gray (off)
- [x] Compact card shows mercury column + ReadoutDisplay + mode label only (no controls)
- [x] Full view shows interactive mercury column with draggable target marker
- [x] Full view has transport key bank for mode selection (cassette deck style, not ToggleBank)
- [x] Transport keys have ~60-80ms spring animation on depression
- [x] Full view has target temp steppers (+-1°F / +-0.5°C) synced with column marker
- [x] F/C preference persists across page reloads (localStorage via zustand)
- [x] F/C toggle changes temperature display globally across all cards
- [x] Target temperature is clamped to 7-35°C (45-95°F) bounds
- [x] StatusBar shows mode-appropriate colors (orange/blue/green/muted)
- [x] Offline: mercury column goes gray, bulb dark, readout dimmed, "OFFLINE" label, controls disabled
- [x] NaN/Infinity temperatures show `--.-` instead of broken text
- [x] `bun run system:check --force` passes with 0 errors

## Implementation Order

1. **Phase 1** — z-index fix (one line, `isolate` on CardShell)
2. **Phase 2.1–2.2** — preferences store + temperature utility
3. **Phase 3.6** — adapter: synthesize `state.on`
4. **Phase 3.1** — MercuryColumn component
5. **Phase 3.2** — TransportKeyBank component
6. **Phase 3.3** — thermostat compact card layout (mercury column + readout)
7. **Phase 3.4** — thermostat full view layout (interactive column + transport keys + steppers)
8. **Phase 3.5** — StatusBar mode colors (orange/blue/green/muted)
9. **Phase 2.3–2.4** — wire up F/C preference to all temperature displays + toggle
10. **Phase 3.7–3.8** — NaN guards + offline state

## Sources & References

- **Visual design brainstorm:** `docs/brainstorms/2026-03-06-thermostat-visual-redesign-brainstorm.md` (mercury column, transport keys, mode colors, layout decisions)
- Design language brainstorms: `docs/brainstorms/2026-03-03-device-card-redesign-brainstorm.md`, `docs/brainstorms/2026-03-04-device-card-layout-redesign-brainstorm.md`, `docs/brainstorms/2026-03-04-instrument-panel-controls-brainstorm.md`
- Resideo integration plan: `docs/plans/2026-03-06-feat-resideo-honeywell-thermostat-integration-plan.md` (defers F/C toggle and dual setpoints)
- LightCard pattern reference: `client/src/components/device-cards/LightCard.tsx` (compact/full differentiation)
- Current ThermostatCard: `client/src/components/device-cards/ThermostatCard.tsx` (variant prop ignored at line 29)
- Navbar z-index: `client/src/components/Navbar.tsx:34` (`z-10`)
- Slider thumb z-index: `client/src/components/device-cards/LightCard.tsx:304,361` (`z-10`)
