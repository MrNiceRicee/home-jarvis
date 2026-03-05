# Instrument Panel Controls Redesign

**Date:** 2026-03-04
**Status:** complete
**Builds on:** `2026-03-04-device-card-layout-redesign-brainstorm.md`, `feat-card-shell-unified-surface-plan.md`

## What We're Building

A deeper design pass that transforms the device cards and full-controls dialog from "web app with nice fonts" into an instrument panel that feels physical and tactile. The previous unified-surface plan delivered cosmetic cleanup but didn't achieve the Sony Making Modern × Teenage Engineering instrument faceplate promise.

## Why This Approach

The current cards have the right *signature elements* (ReadoutDisplay, fader sliders, light bar, edge glow) but every supporting element — buttons, badges, toggles, status indicators — still uses web UI conventions (pill badges, iOS-style segmented controls, floating color dots, plain green circles). This creates a split personality: half instrument, half web app.

The fix: establish a small vocabulary of **panel-mount controls** and apply them consistently across every device type. Real instrument panels use a handful of repeated control types — this dashboard should too.

## Key Decisions

### 1. Card Shell — Subtle Physical Character

**Decision:** All three physical cues at ~30% intensity — whisper of physicality, not skeuomorphism.

- **Thin emboss/bevel:** Inset border or inner shadow suggesting a stamped faceplate recessed into a chassis
- **Warm multi-layer shadow:** Depth and visual weight (OP-1 housing feel)
- **Corner mounting dots:** Tiny decorative rivets at corners suggesting rack-mount fastening

These should be barely noticeable individually but collectively shift the feel from "div" to "panel."

### 2. Header — Recessed LED + Engraved Chevron

**Decision:** Replace web UI indicators with panel-mount equivalents.

- **Online status:** Plain green dot → recessed LED with inset bezel shadow. Glows emerald when online, dark when offline. Looks like a panel-mount indicator lamp.
- **Expand button:** Generic arrow icon → engraved/debossed chevron mark pressed into the panel surface. Not a floating icon but a mark that belongs to the material.

### 3. Power Button — Compact, Footer-Mounted

**Decision:** Small square pushbutton in the card footer, left-aligned alongside MATTER badge.

- **Size:** Compact, not full-width. Real power buttons are small and purposeful.
- **Style:** Square pushbutton with mounting bezel/recess. Sits IN the panel, not ON it.
- **LED:** Recessed indicator dot, emerald when on.
- **Position:** Footer area, treating power as a system-level action separated from adjustment controls (faders).

```
 [ReadoutDisplay          ]
 BRT  ▬▬▬▬▬▬▬▬▬▬▬▬●
 CCT  ▬▬▬▬▬▬▬▬▬▬▬▬●

 [◉]PWR          MATTER
```

### 4. Toggle Bank — Universal Multi-Option Selector

**Decision:** Every multi-option selector (3+ choices) uses a labeled toggle bank pattern.

Layout: silk-screened label above each option, square pushbutton with LED below (same shape as PWR button — all pushbuttons are square with recessed bezel). Only one active at a time (radio behavior). Active button gets inset shadow + illuminated LED. LED tint carries semantic color.

Applied to:
- **Scene presets** (light dialog): RELAX / READ / FOCUS / ENRG
- **Thermostat mode:** HEAT / COOL / AUTO / OFF (LED tint: orange/blue/amber/none)
- **Air purifier fan speed:** ~~toggle bank~~ → **stepped radial dial** (see Decision 7)
- **Color presets** (light dialog): RED / ORG / YLW / GRN / BLU / PRP (LED tint: preset color)

```
 SCENES
 RELAX  READ  FOCUS  ENRG
  [◉]   [ ]   [ ]   [ ]
```

### 5. Two-Position Toggle Switch — Binary Selector

**Decision:** Binary choices (exactly 2 options) use a distinct two-position toggle switch.

Looks like a source selector toggle on a receiver — a single control that snaps between positions. Active side gets inset shadow + bold text, inactive side is raised + muted text. Visually distinct from the toggle bank to communicate "this is either/or."

Applied to:
- **White/Color mode** (light dialog)

```
 MODE
 ┌──────────────────┐
 │ WHITE ┃┃ color │
 └──────────────────┘
```

### 6. CCT Swatches — Eliminated, Merged into Fader

**Decision:** Remove separate CCT swatch buttons. Make the existing CCT fader's notch marks tappable detent stops at the 5 preset values (2700/3500/4000/5000/6500K).

Major notch marks become tap targets. Fader snaps to nearest preset when a notch is tapped. Reduces clutter and makes the fader the single source of CCT control.

```
 CCT  ▬▬▬▬▬▬▬▬▬▬▬▬●  4000K
      │   │   │   │   │
     2.7  3.5  4K  5K 6.5
```

### 7. Fan Speed — Stepped Radial Dial

**Decision:** Replace toggle bank with a stepped radial dial for air purifier fan speed.

A circular dial with click-stop detent positions for each speed (AUTO/SLP/1/2/3). The fan metaphor is natural — you turn a knob to control a fan. Knob marker shows current position. Detents prevent continuous sweep (discrete speeds only).

```
 FAN
       AUTO
    SLP    1
      ●
     3   2
```

This is the one device-specific control that breaks from the toggle bank pattern, justified because the physical metaphor is too strong to ignore.

## Control Vocabulary Summary

| Control Type | When Used | Example |
|---|---|---|
| **Fader** (slider + notch marks) | Continuous value adjustment | BRT, CCT |
| **Toggle bank** (label + LED pushbutton) | Multi-option selection (3+) | Scenes, modes, fan speed, color presets |
| **Two-position toggle** | Binary selection (exactly 2) | White/Color mode |
| **Stepped radial dial** | Discrete rotary selection (physical metaphor) | Fan speed |
| **Pushbutton** (square, recessed) | Momentary/latching action | POWER |
| **Recessed LED** | Status indication | Online/offline, active state |
| **ReadoutDisplay** | Value display (dark UV glass) | Brightness %, temp, PM2.5 |
| **Engraved mark** | Navigation hint | Expand chevron |

## What Stays Unchanged

- ReadoutDisplay (dark UV glass window) — signature element
- Fader sliders with notch marks — already physical
- Light bar in footer — reflects device color
- Edge glow on card border — ambient lighting effect
- Color wheel/area picker in full dialog — appropriate for RGB
- Fonts: Michroma (labels) + IoskeleyMono (readout values)
- Surface color: `#fffdf8` warm matte
- No dark mode

## Out of Scope — Future Work

The following cards are NOT part of this redesign but need the panel language treatment in a follow-up pass:

| Card | Current State | Priority |
|---|---|---|
| **MediaCard** | Full web-app: emoji transport buttons, white circle slider thumb, plain "Volume" label. Needs panel controls (transport pushbuttons, volume fader with notch marks). | High |
| **VacuumCard** | Web pill badges for status, progress bar for battery, colored action buttons (Start/Pause/Dock). | Medium |
| **ApplianceCard** | Web pill badges for cycle status, emoji lock icons, plain text timer. Read-only. | Medium |
| **FridgeCard** | Read-only text for fridge/freezer temps. Should use ReadoutDisplay. | Low — quick swap |
| **GenericCard** | Fallback card with web buttons and raw state dump. | Low — fallback |
| **SensorCard** | Already uses ReadoutDisplay. Panel-ready. | None — already done |

## Resolved Questions

1. **Thermostat target temp +/- buttons** → Small square panel-mount pushbuttons with recessed bezel, matching PWR button style. Engraved +/− marks. Target value shown in a ReadoutDisplay between them.
2. **Dialog shell treatment** → Yes, same full treatment (emboss + shadow + corner rivets). The dialog is a larger panel but the same physical object. Consistency across surfaces.
3. **Hex color input field** → Restyle as editable ReadoutDisplay. Dark glass window aesthetic that's also tappable to type a hex value. Matches the panel language instead of looking like a web form input.
