---
title: "feat: Instrument Panel Controls Redesign"
type: feat
status: active
date: 2026-03-04
origin: docs/brainstorms/2026-03-04-instrument-panel-controls-brainstorm.md
---

# Instrument Panel Controls Redesign

## Overview

Transform device cards and full-controls dialog from web-app conventions into a physical instrument panel. Build a small vocabulary of panel-mount controls and apply them consistently across Light, Thermostat, and AirPurifier cards, plus the card shell and dialog.

## Problem Statement

The unified-surface plan delivered cosmetic cleanup (flat `#fffdf8` surface, 2 fonts, edge glow) but didn't bridge the gap to "instrument panel." Supporting elements — buttons, badges, toggles, status indicators — still use web conventions while signature elements (ReadoutDisplay, faders) feel physical. This split personality undermines the design intent.

## Proposed Solution

Establish a panel-mount control vocabulary (see brainstorm: `docs/brainstorms/2026-03-04-instrument-panel-controls-brainstorm.md`) and apply it universally:

| Control | Component | Used For |
|---------|-----------|----------|
| Fader (enhanced) | existing `Slider` | BRT, CCT (with tappable detent stops) |
| Toggle bank | `ToggleBank` (new) | Scenes, thermostat modes, color presets |
| Two-position toggle | `TwoPositionToggle` (new) | White/Color mode |
| Stepped radial dial | `SteppedRadialDial` (new) | Fan speed |
| Panel pushbutton | `PanelButton` (new) | POWER, thermostat +/− |
| Recessed LED | CSS pattern | Online status, active indicators |
| Engraved mark | CSS pattern | Expand chevron |

Plus physical treatment on card shell + dialog shell (emboss, shadow, corner mounting dots).

## Critical Design Decisions

Resolved during brainstorming and SpecFlow analysis:

### Power button location in dialog view

The power button moves from each device card's body to the card footer (compact) and dialog footer (full). Implementation: extract a shared `PowerButton` component. `CardShell` renders it in footer alongside MATTER. `DeviceDetailDialog` renders it in its own footer alongside the close button. Individual card components (`LightCard`, `AirPurifierCard`) no longer render their own power buttons.

Only render when `device.state.on !== undefined` — sensors, fridges, appliances don't get a power button.

### Radial dial interaction model

Tappable detent positions arranged around a knob visual, not a truly rotatable knob. Each detent position is a button (React Aria `Button`) arranged in a circle with a central knob indicator showing current selection. Keyboard: arrow keys step through positions. This avoids the complexity of circular gesture tracking while preserving the rotary metaphor.

### Toggle bank ARIA semantics

Two modes via a `role` prop:
- `"radiogroup"` — for mutually exclusive selection (thermostat modes, fan speeds). Children are `role="radio"` with `aria-checked`.
- `"toolbar"` — for action triggers (scene presets, color presets). Children are `role="button"`.

Implementation: React Aria `RadioGroup` + `Radio` for selection mode, `Button` group for action mode.

### Toggle bank compact vs. full visibility

Follows the current visibility of whatever it replaces:
- **Thermostat modes:** both compact and full (replaces existing compact buttons)
- **Scene presets:** full only (currently dialog-only)
- **Color presets:** full only (currently dialog-only)
- **Fan speed:** full only → now radial dial (currently dialog-only)

### CCT fader detent behavior

- **Tap on notch mark:** jumps slider to that value, fires `onChangeEnd`
- **Drag:** remains fully continuous, no snap. Snapping during drag would prevent fine adjustment.
- Implementation: make notch marks at CCT_SWATCHES positions clickable (remove `pointer-events-none`, add `onClick` handler)

### Power button loading indicator

The compact square button has no room for text. During toggling state, the LED indicator pulses (CSS animation: opacity oscillates between 0.3 and 1.0) instead of showing "..." text.

### Corner mounting dots

Rendered as absolutely positioned pseudo-elements (`:before` on the Card component), inside the card border, respecting `overflow-hidden`. Four dots at corners, positioned inset by ~6px. Use `bg-stone-300/30` — extremely subtle.

## Implementation Phases

### Phase 1: Card Shell + Header Physical Treatment

Physical character on the card and dialog surfaces. No interaction changes — purely visual.

**Card shell (`client/src/components/ui/card.tsx`):**

- [x] Add thin emboss: `border border-[rgba(168,151,125,0.12)]` inner edge with `shadow-[inset_0_0.5px_0_rgba(255,255,255,0.5)]` top highlight
- [x] Enhance warm shadow: add third shadow layer for depth — `0 1px 2px rgba(120,90,50,0.05), 0 4px 12px rgba(120,90,50,0.04), 0 8px 24px rgba(120,90,50,0.02)`
- [x] Add corner mounting dots: four `::before`/`::after` pseudo-elements (or four absolutely positioned tiny divs), `w-1 h-1 rounded-full bg-stone-300/30` at each corner, inset ~6px
- [x] Verify glow shadow composition still works with new base shadow layers

**Header indicators (`client/src/components/DeviceCard.tsx`):**

- [x] Replace online dot with recessed LED: inset bezel shadow (`inset 0 1px 2px rgba(0,0,0,0.3)`) + color glow when online (`0 0 4px rgba(52,211,153,0.6)`). Reuse the `StatusLed` bezel pattern from `client/src/routes/matter.tsx` lines 196-225
- [x] Replace expand arrow with engraved chevron: `text-stone-400/40` with `text-shadow: 0 1px 0 rgba(255,255,255,0.6)` (debossed highlight). Remove button styling, keep as React Aria `Button` for accessibility

**Dialog shell (`client/src/components/DeviceDetailDialog.tsx`):**

- [x] Apply same emboss + shadow + corner dots to the dialog modal panel
- [x] Ensure warm shadow layers match the card treatment

**Skeleton card (`client/src/routes/index.tsx`):**

- [x] Update `SkeletonCard` to show corner dots and emboss to prevent visual jump when real cards mount

**Acceptance:**
- Cards feel like stamped faceplates, not divs
- Corner dots visible on close inspection, invisible at a glance
- Edge glow and selection ring still work correctly
- Dialog matches card physical character

### Phase 2: PanelButton + Power Button Relocation

New shared pushbutton component, then move power from card body to shell footer.

**PanelButton (`client/src/components/ui/panel-button.tsx`):**

- [x] Create `PanelButton` component wrapping React Aria `Button`
- [x] Props: `led?: 'on' | 'off' | 'pulse'`, `ledColor?: string`, `size?: 'sm' | 'md'`, `label?: string`, standard Button props
- [x] Visual: square (`rounded-sm`), recessed bezel (mount recess via `shadow-[inset_0_1px_2px_rgba(0,0,0,0.15),_0_1px_0_rgba(255,255,255,0.4)]`), `bg-stone-100 border border-stone-300`
- [x] States: OFF = raised shadow, ON = inset shadow (`shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]`), pressed = deeper inset
- [x] LED indicator: `w-1.5 h-1.5 rounded-full` dot inside button face. When `led="on"`: colored dot + glow shadow. When `led="pulse"`: CSS animation `animate-pulse`. When `led="off"`: `bg-stone-400/30`
- [x] Sizing: `sm` = `w-7 h-7`, `md` = `w-9 h-9`
- [x] Text label (when provided): `font-michroma text-2xs uppercase` below the button (outside, not inside)

**PowerButton extraction:**

- [x] Create shared `PowerButton` component using `PanelButton` with power-specific logic
- [x] Props: `isOn`, `isDisabled`, `isToggling`, `onToggle`
- [x] LED: emerald when on (`led="on" ledColor="rgb(52,211,153)"`), off when off, pulse when toggling
- [x] Label: "PWR" below the button in `font-michroma text-2xs`

**Power button relocation — compact cards (`client/src/components/DeviceCard.tsx`):**

- [x] Add `PowerButton` to `CardFooter` in `CardShell`, left-aligned before MATTER badge
- [x] Pass `device.state.on`, `device.online`, and `onStateChange` to `CardShell` for power wiring
- [x] Only render when `device.state.on !== undefined`
- [x] Remove power button from `LightCard` compact body
- [x] Remove power button from `AirPurifierCard` compact body

**Power button relocation — dialog (`client/src/components/DeviceDetailDialog.tsx`):**

- [x] Add `PowerButton` to dialog footer, left-aligned alongside close button (right-aligned)
- [x] Wire same state/callbacks as compact card

**Acceptance:**
- Power button is compact square with LED in footer, not full-width in body
- LED pulses during toggle (replaces "..." text)
- All device types that had power buttons still have them
- Devices without `state.on` (sensor, fridge, thermostat) show no power button
- Thermostat uses mode OFF — no power button needed

### Phase 3: ToggleBank + LightCard Dialog Controls

New toggle bank component, then apply to LightCard's full-dialog controls.

**ToggleBank (`client/src/components/ui/toggle-bank.tsx`):**

- [ ] Create `ToggleBank` component
- [ ] Props:
  ```ts
  interface ToggleBankProps {
    label: string                    // section label ("SCENES", "MODE", "COLOR")
    options: ToggleBankOption[]      // { key, label, ledColor? }
    value: string | null             // active option key (null = none active)
    onChange: (key: string) => void  // selection callback
    mode: 'selection' | 'action'    // radiogroup vs toolbar
    disabled?: boolean
  }
  ```
- [ ] Layout: section label (`font-michroma text-2xs uppercase tracking-widest text-stone-400`) above, row of option columns below. Each column: option label above (`font-michroma text-2xs uppercase tracking-wider text-stone-400`), square `PanelButton` below
- [ ] Selection mode: React Aria `RadioGroup` + `Radio`, `aria-checked` on active
- [ ] Action mode: React Aria `Button` group in a `role="toolbar"` container
- [ ] Active state: PanelButton with `led="on"` + `ledColor` from option config, inset shadow
- [ ] Inactive state: PanelButton with `led="off"`, raised shadow
- [ ] Wrapping: `flex flex-wrap gap-x-3 gap-y-2` to handle 6-option rows (color presets)

**LightCard scene presets (`client/src/components/device-cards/LightCard.tsx`):**

- [ ] Replace pill-shaped `rounded-full bg-white/80` scene buttons with `<ToggleBank mode="action" label="SCENES" />`
- [ ] Options: RELAX / READ / FOCUS / ENRG (shortened from ENERGIZE to fit)
- [ ] `onChange` fires compound state update (colorTemp + brightness + on: true)
- [ ] No `value` tracking (scenes are fire-and-forget actions) — or track last applied scene

**LightCard color presets (`client/src/components/device-cards/LightCard.tsx`):**

- [ ] Replace floating colored circles with `<ToggleBank mode="action" label="COLOR" />`
- [ ] Options: RED / ORG / YLW / GRN / BLU / PRP
- [ ] `ledColor` per option: the preset's RGB color
- [ ] `onChange` fires color state update

**CCT fader detent stops (`client/src/components/device-cards/LightCard.tsx`):**

- [ ] Remove separate `CCT_SWATCHES` button row (full variant only)
- [ ] Make CCT slider notch marks at `CCT_SWATCHES` positions interactive:
  - Remove `pointer-events-none` from CCT notch marks
  - Add `onClick` to each major notch mark
  - On click: set slider value to swatch kelvin, fire `onChangeEnd`
  - Add `cursor-default` (matches instrument panel feel)
- [ ] Add CCT swatch labels below notch marks: `2.7 / 3.5 / 4K / 5K / 6.5` in `font-michroma text-2xs text-stone-400`
- [ ] Notch marks for CCT should be taller/bolder than decorative BRT notches to signal interactivity

**Acceptance:**
- Scenes render as labeled toggle bank with square pushbuttons + LEDs
- Color presets render as toggle bank with color-tinted LEDs
- CCT swatches eliminated — tapping a notch mark on the fader jumps to that value
- All controls are keyboard accessible (tab between options, enter/space to activate)

### Phase 4: TwoPositionToggle + White/Color Mode

**TwoPositionToggle (`client/src/components/ui/two-position-toggle.tsx`):**

- [ ] Create `TwoPositionToggle` component
- [ ] Props:
  ```ts
  interface TwoPositionToggleProps {
    label: string                      // section label ("MODE")
    options: [string, string]          // exactly 2 option labels
    value: string                      // which side is active
    onChange: (value: string) => void
    disabled?: boolean
  }
  ```
- [ ] Visual: single rectangle container with center divider (`border-r`), two halves. Active half: inset shadow + bold text + slightly darker bg. Inactive half: raised feel + muted text
- [ ] Container: `rounded-sm border border-stone-300`, warm background
- [ ] Divider: thin `border-r border-stone-300` center line (the `┃┃` visual from brainstorm)
- [ ] Accessibility: React Aria `RadioGroup` with 2 `Radio` options
- [ ] Keyboard: arrow keys toggle between positions
- [ ] Section label above: same `font-michroma text-2xs uppercase` pattern

**LightCard White/Color mode (`client/src/components/device-cards/LightCard.tsx`):**

- [ ] Replace `rounded-full bg-stone-100 p-0.5` segmented control with `<TwoPositionToggle />`
- [ ] Options: `["WHITE", "COLOR"]`
- [ ] Preserve existing mode switching logic (colorMode state toggle)

**Acceptance:**
- White/Color mode looks like a receiver source selector, not an iOS toggle
- Visually distinct from toggle bank (different physical metaphor)
- Keyboard accessible (arrow keys toggle)

### Phase 5: ThermostatCard Controls

**Mode selection (`client/src/components/device-cards/ThermostatCard.tsx`):**

- [ ] Replace `flex gap-1` mode buttons with `<ToggleBank mode="selection" label="MODE" />`
- [ ] Options: HEAT / COOL / AUTO / OFF
- [ ] `ledColor` per mode: orange (`rgb(249,115,22)`) / blue (`rgb(59,130,246)`) / amber (`rgb(245,158,11)`) / none
- [ ] Renders in both compact and full variants (matches current behavior)

**Target temperature stepper (`client/src/components/device-cards/ThermostatCard.tsx`):**

- [ ] Replace `w-7 h-7 rounded-full bg-stone-100` +/− buttons with `PanelButton` (size `sm`)
- [ ] Engraved labels: `−` and `+` rendered as the button text content
- [ ] Add `ReadoutDisplay size="sm"` between the +/− buttons showing target temp (`22.0°`)
- [ ] Layout: `flex items-center gap-2` — `[−] [readout] [+]`
- [ ] Section label "TARGET" above the row

**Acceptance:**
- Thermostat modes are a toggle bank with color-tinted LEDs
- +/− are square pushbuttons flanking a small ReadoutDisplay
- All controls work in both compact and full variants
- Mode LED colors match semantic meaning (heat=warm, cool=cold)

### Phase 6: AirPurifierCard — Stepped Radial Dial

**SteppedRadialDial (`client/src/components/ui/stepped-radial-dial.tsx`):**

- [ ] Create `SteppedRadialDial` component
- [ ] Props:
  ```ts
  interface SteppedRadialDialProps {
    label: string                           // "FAN"
    options: { key: string; label: string }[]  // detent positions
    value: string                           // current position key
    onChange: (key: string) => void
    disabled?: boolean
  }
  ```
- [ ] Layout: circular arrangement of detent labels around a center knob indicator
  - Labels positioned around the circumference using `transform: rotate(Ndeg) translateY(-Rpx)` + counter-rotation for readability
  - Center: knob body (`w-12 h-12 rounded-full`) with metallic gradient (reuse fader thumb gradient: `linear-gradient(180deg, #e8e4de, #d4d0ca, #c0bcb6, #d4d0ca)`)
  - Knob marker: small notch/line pointing toward the active detent position
  - Knob shadow: `0 2px 6px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3)`
- [ ] Each detent position: React Aria `Button`, minimum touch target 44x44px (use padding around the label)
- [ ] Active detent: label becomes `text-stone-700 font-medium` (vs. `text-stone-400` inactive)
- [ ] Keyboard: React Aria `RadioGroup` with `Radio` children for proper semantics. Arrow keys step clockwise/counterclockwise through positions
- [ ] Section label "FAN" above the dial
- [ ] Overall size: ~120px diameter to fit 5 positions with adequate touch targets

**AirPurifierCard fan speed (`client/src/components/device-cards/AirPurifierCard.tsx`):**

- [ ] Replace `flex gap-1` fan speed buttons with `<SteppedRadialDial />`
- [ ] Options: AUTO / SLP / 1 / 2 / 3
- [ ] Full variant only (matches current visibility)

**Acceptance:**
- Fan speed is a rotary knob with 5 detent positions
- Knob marker points to current speed
- Tapping a position label selects it (no circular drag needed)
- Keyboard accessible via arrow keys
- Minimum 44x44px touch targets per detent

### Phase 7: Hex Input + Visual Verification

**Hex color input (`client/src/components/device-cards/LightCard.tsx`):**

- [ ] Restyle `ColorField` + `Input` with ReadoutDisplay visual treatment:
  - Container: `bg-[#2a2924] rounded border border-[#1a1914]` with ReadoutDisplay's inset shadow
  - Text: `font-ioskeley text-xs text-[#faf0dc]`
  - Input is always editable (no tap-to-edit mode — just an input that looks like a display)
  - Cursor color: set `caret-color: #faf0dc` for visibility against dark background
  - Selection highlight: add `selection:bg-stone-600` for contrast
- [ ] Keep React Aria `ColorField` + `Input` for validation and color picker sync

**Visual verification — all states:**

- [ ] Light card compact: ReadoutDisplay, BRT fader, CCT fader (with detent labels), footer with PWR + LightBar
- [ ] Light card full: above + scenes toggle bank, White/Color two-position toggle, color wheel, color presets toggle bank, hex readout input
- [ ] Thermostat compact: ReadoutDisplay (temp + humidity), target stepper (PanelButton − + ReadoutDisplay + PanelButton +), mode toggle bank
- [ ] Thermostat full: same as compact (no additional full-only controls)
- [ ] Air purifier compact: ReadoutDisplay (PM2.5 + AQI badge), AQI segment bar, filter bar, footer with PWR
- [ ] Air purifier full: above + stepped radial dial for fan speed
- [ ] Offline state: all controls disabled, muted opacity, LED indicators dark
- [ ] Multi-select mode: selection ring + corner dots don't conflict
- [ ] DnD ghost: physical treatment renders at reduced opacity
- [ ] Edge glow: still composes correctly with new shadow layers
- [ ] Dialog: physical treatment applied, power button in footer, close button alongside
- [ ] Skeleton cards: corner dots + emboss preview, no visual jump on mount

## System-Wide Impact

### Interaction graph

Card shell changes affect every device card equally (Light, Thermostat, AirPurifier, plus out-of-scope cards like Media, Vacuum, etc.). Power button relocation changes the callback flow: `onStateChange` must be threaded through `CardShell` in addition to `renderBody`. The ToggleBank replaces 4 different existing control patterns in 3 different components.

### Error propagation

No new error paths. Power toggle optimistic updates follow the existing pattern (`setToggling(true)` → `onStateChange` → `finally { setToggling(false) }`). LED pulse state during toggling replaces text indicator — same timing.

### State lifecycle risks

CCT detent tap creates a new interaction path: clicking a notch mark fires `onChangeEnd` directly (bypassing `onChange` drag flow). This is simpler than drag — no partial state. Just a direct value commit, same as scene preset application.

### API surface parity

No API changes. All changes are client-side component/CSS only.

## Acceptance Criteria

### Functional Requirements

- [ ] Card shell has visible but subtle physical character (emboss + shadow + corner dots)
- [ ] Header online dot is a recessed LED with bezel
- [ ] Header expand is a debossed chevron mark
- [ ] Power button is compact square in footer with LED indicator
- [ ] Scene presets use toggle bank (labeled pushbuttons + LEDs)
- [ ] White/Color mode uses two-position toggle (receiver selector style)
- [ ] CCT swatches replaced by tappable fader detent stops with labels
- [ ] Thermostat modes use toggle bank with semantic color LEDs
- [ ] Thermostat +/− are PanelButtons flanking a ReadoutDisplay
- [ ] Air purifier fan speed uses stepped radial dial
- [ ] Dialog shell matches card physical treatment
- [ ] Hex color input looks like an editable ReadoutDisplay

### Non-Functional Requirements

- [ ] All interactive controls are keyboard accessible
- [ ] Toggle banks use correct ARIA roles (`radiogroup` for selection, `toolbar` for actions)
- [ ] Touch targets are minimum 44x44px
- [ ] No regression in existing fader, ReadoutDisplay, edge glow, or color wheel behavior
- [ ] `bun run system:check --force` passes after each phase

### Quality Gates

- [ ] Visual verification of all card types × all states (on/off/offline/multi-select/DnD)
- [ ] Keyboard-only navigation through all new controls

## Dependencies & Prerequisites

- Current branch: `feat/scanner-refactor-design-refresh`
- Builds on completed unified-surface work (all Phase 1-4 of previous plan)
- React Aria Components — `RadioGroup`, `Radio`, `Button` (already dependencies)
- No new package dependencies needed

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-03-04-instrument-panel-controls-brainstorm.md](docs/brainstorms/2026-03-04-instrument-panel-controls-brainstorm.md) — all 7 key decisions + 3 resolved questions carried forward. Control vocabulary, physical treatment intensity, power button placement, toggle bank pattern, radial dial for fan speed.

### Internal References

- Card shell: `client/src/components/ui/card.tsx`
- DeviceCard shell: `client/src/components/DeviceCard.tsx` (header lines 174-219, footer lines 223-258)
- DeviceDetailDialog: `client/src/components/DeviceDetailDialog.tsx`
- LightCard: `client/src/components/device-cards/LightCard.tsx`
- ThermostatCard: `client/src/components/device-cards/ThermostatCard.tsx`
- AirPurifierCard: `client/src/components/device-cards/AirPurifierCard.tsx`
- ReadoutDisplay: `client/src/components/ui/readout-display.tsx`
- RaisedButton: `client/src/components/ui/button.tsx`
- StatusLed bezel pattern: `client/src/routes/matter.tsx` lines 196-225
- Shadow tokens: `client/src/index.css`
- Color utilities: `client/src/lib/color-utils.ts`
