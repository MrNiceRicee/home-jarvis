# Thermostat Card Visual Redesign

**Date:** 2026-03-06
**Status:** active
**Builds on:** `docs/plans/2026-03-06-feat-thermostat-redesign-temp-units-plan.md`, `2026-03-04-instrument-panel-controls-brainstorm.md`

## What We're Building

A visual redesign of the thermostat compact and full (detail dialog) views that leans hard into a retro thermometer metaphor while staying within our Sony Making Modern + Teenage Engineering instrument panel vocabulary. The hero element is a **mercury column gauge** — a vertical temperature visualization using the ReadoutDisplay dark glass material, with mode-tinted mercury fill that glows inside the cavity.

This gives thermostat cards a unique physical identity on the dashboard, distinct from lights (readout + faders) and air purifiers (meters + radial dial). Each device type now has its own signature control: lights have faders, purifiers have the stepped dial, thermostats have the mercury column.

## Why This Approach

### Mercury column = thermometer identity

A thermostat card should feel like a thermometer. Not a web form with temperature numbers, not a generic readout panel — a thermometer. The mercury column is the most iconic, instantly recognizable symbol of temperature measurement. By rendering it in our existing ReadoutDisplay dark glass material, it fits the established design language while adding a completely new visual element.

### Mode-tinted mercury = ambient information

Instead of relying solely on mode labels or LED indicators, the mercury fill color itself communicates mode: orange for HEAT, blue for COOL, emerald green for AUTO, gray for OFF. You can read the thermostat mode from across the room by glancing at the column color. This is ambient information design — the most important state is the most visually prominent element.

### Cassette transport keys = retro mode control

The current ToggleBank pattern (square pushbuttons with LEDs) works for lights and purifiers but feels too modern/web-UI for a thermostat that's leaning into retro. Cassette transport keys — recessed rectangular push-keys with latching behavior where pressing one pops the others out — are a deeply Sony ES control type. They communicate "mechanical mode selector" in a way the ToggleBank can't.

## Key Decisions

### 1. Compact Card Layout — Mercury Column + Readout

The compact card is glanceable only — no interactive controls.

**Layout (left to right):**
- **Mercury column** (left edge): Narrow vertical ReadoutDisplay glass tube spanning the card body height. Fill height maps current temperature within the fixed 45-95°F range. Mercury fill color = mode color. Lit bulb circle at the column base, colored by mode. No tick labels in compact (column is too short for legible labels).
- **ReadoutDisplay** (center-right, vertically centered against column): Standard lg ReadoutDisplay showing current temp (hero, left-aligned) and humidity `% RH` (right-aligned). Same treatment as LightCard/AirPurifierCard readouts.
- **Mode label** (below readout): `font-michroma text-2xs uppercase` colored label — "HEATING" in orange, "COOLING" in blue, "AUTO" in green, "OFF" in muted stone.

**No controls in compact:** No stepper, no mode toggle, no F/C switch. These all live in the detail dialog. The power button in the card footer remains interactive (toggles between last active mode and "off").

The column and readout fill the card body — no empty vertical space. The column stretches from the top of the body area to just above the footer, with the bulb sitting at the bottom of the column.

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

### 2. Full View (Detail Dialog) — Interactive Column + Transport Keys

The detail dialog is the interactive view. The mercury column grows taller and becomes interactive.

**Layout:**
- **Left side — Interactive mercury column:**
  - Taller column (fills most of the dialog height)
  - Current temperature shown as mercury fill level (read-only, glowing)
  - **Target temperature marker** — a draggable indicator on the column's tick scale. Drag up/down to adjust target. Uses the existing fader thumb aesthetic (brushed aluminum knob) oriented horizontally as an arrow/pointer.
  - Tick marks with temperature labels at 5-degree intervals along the column
  - Mercury bulb at bottom with mode-colored glow

- **Right side — Controls panel:**
  - **ReadoutDisplay** (lg) — current temp + humidity (same as compact)
  - **Target readout + steppers** — `TARGET` label (Michroma), `PanelButton (−)` + `ReadoutDisplay (sm)` + `PanelButton (+)` for precise +-1°F or +-0.5°C adjustment. Works in tandem with the draggable column marker.
  - **Cassette transport keys** — `MODE` label, four recessed rectangular push-keys: OFF | COOL | AUTO | HEAT. Active key depressed with illuminated LED edge in mode color. Others raised with embossed labels.
  - **F/C toggle** — `TwoPositionToggle` for `°F / °C`, placed below mode selector.

```
 Full detail dialog:
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

### 3. Mercury Column Construction

The column uses the **ReadoutDisplay material** — not a new element, just a vertical orientation of the existing dark UV glass:

- **Outer container:** Same `background`, `border`, `box-shadow` as ReadoutDisplay. Tall and narrow (roughly 24-32px wide, height determined by card/dialog size).
- **Glass overlays:** Same scanline texture, glass highlight at top, corner vignette, depth gradient.
- **Mercury fill:** A `div` inside the glass cavity with height proportional to current temp within the visible range. Uses a vertical gradient in the mode color — brighter at the top (liquid surface) fading to deeper saturation below.
- **Mercury glow:** Subtle `box-shadow` glow on the fill in the mode color, like backlit liquid.
- **Bulb:** A small circle at the column base, same mode color with a stronger glow. When OFF, the bulb is dark (no fill, just the glass circle outline).
- **Tick marks:** Small horizontal lines beside the column at regular temperature intervals, rendered in `font-michroma text-[8px] text-stone-400` — same tick mark style as the BRT fader detents on LightCard.

### 4. Mercury Colors by Mode

| Mode | Mercury Fill | Bulb Glow | LED / Label Color | StatusBar |
|------|-------------|-----------|-------------------|-----------|
| HEAT | Orange gradient (`rgb(249,115,22)` warm) | Orange glow | Orange | Orange accent |
| COOL | Blue gradient (`rgb(59,130,246)` cool) | Blue glow | Blue | Blue accent |
| AUTO | Emerald green gradient (`rgb(52,211,153)`) | Green glow | Green | Green accent |
| OFF | Gray (`stone-600`, dim) | Dark (outline only) | Muted stone | Muted bar |

**Note:** AUTO uses emerald green instead of amber to avoid visual confusion with HEAT's orange — they were too similar in the glowing mercury context.

### 5. Cassette Transport Keys — New UI Component

A new control component distinct from ToggleBank, specific to mode selection:

**Visual treatment:**
- Row of recessed rectangular push-keys, touching edge-to-edge
- Each key: ~48px wide, ~32px tall, recessed into the panel surface
- **Active key:** Depressed inward (deeper `inset` box-shadow), illuminated LED edge/pip in mode color, bold text
- **Inactive keys:** Raised (outward box-shadow like PanelButton), embossed label text in muted stone, no LED
- **Latching behavior:** Pressing one key depresses it and releases all others — like a cassette deck's PLAY/STOP/REC mechanism
- Labels: `font-michroma text-2xs uppercase` — OFF, COOL, AUTO, HEAT

**How it differs from ToggleBank:**
- Rectangular keys (wider than tall) vs. square pushbuttons
- Keys touch/abut vs. gap between buttons
- No separate LED indicator dot — the key edge itself illuminates
- Depressed/raised mechanical feel vs. inset shadow + dot

### 6. Target Temperature Marker (Interactive Column)

In the full view, the target temperature is shown as a draggable marker on the mercury column:

- **Appearance:** Horizontal arrow/pointer extending left from the tick scale toward the column, using the fader thumb aesthetic (brushed aluminum, gradient, center-line detail). Points at the column to indicate target position on the scale.
- **Interaction:** Drag vertically to adjust target temperature. Snaps to nearest step (1°F or 0.5°C depending on unit preference). The target ReadoutDisplay and steppers update in sync.
- **Implementation:** React Aria `Slider` with vertical orientation, thumb styled as the pointer. The column tick marks serve as the visual scale.

### 7. Offline State

- **Mercury column:** Fill drops to minimum height, color shifts to dim gray regardless of mode
- **ReadoutDisplay:** Shows last known temperature at `opacity-50`
- **"OFFLINE" label:** `font-michroma text-2xs text-stone-400` below the readout
- **Bulb:** Dark (outline only, no glow)
- **All controls disabled** (steppers, transport keys, column drag)

## Existing Vocabulary Used

| Element | Usage in Thermostat |
|---------|-------------------|
| ReadoutDisplay (lg) | Current temp + humidity readout |
| ReadoutDisplay (sm) | Target temp display between steppers |
| ReadoutDisplay material | Mercury column glass tube |
| PanelButton | Target temp stepper +/- buttons |
| TwoPositionToggle | F/C unit preference switch |
| Michroma font | Labels (TARGET, MODE, UNIT, tick marks) |
| IoskeleyMono font | Readout values (temperature, humidity) |
| Fader thumb aesthetic | Target temp draggable marker |
| StatusBar | Mode-colored accent bar |

## New Vocabulary Introduced

| Element | Description |
|---------|------------|
| Mercury column gauge | Vertical ReadoutDisplay glass with fill level + bulb |
| Cassette transport keys | Latching rectangular push-key bank for mode selection |
| Target marker | Draggable pointer on vertical scale (vertical slider thumb) |

## Resolved Questions

1. **Mercury column temperature range** — Fixed HVAC range: 45-95°F (7-35°C). Matches stepper bounds from the plan. Stable and predictable like a real thermometer with a printed scale. Column fill maps linearly within this range.

2. **Compact card height** — Same height as all other cards. Mercury column shrinks to fit the card's natural height. Grid uniformity maintained. The column is short in compact, tall in the detail dialog.

3. **Transport key animation** — Brief spring (~60-80ms). Fast enough to feel mechanical, slow enough to register visually. The button "settles" into its pressed position with a micro-overshoot.

4. **Column in compact vs full** — Same column (same data range, 45-95°F), just taller in the full view. Compact has no tick labels and no target marker — purely visual. Full view stretches the column taller, adds tick labels at 5° intervals, and the interactive draggable target marker.
