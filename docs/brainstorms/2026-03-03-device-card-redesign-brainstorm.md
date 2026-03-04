---
title: "Device Card Redesign — Sony ES Retro 3D Panels"
type: brainstorm
status: active
date: 2026-03-03
---

# Device Card Redesign — Sony ES Retro 3D Panels

## What We're Building

A complete redesign of all device cards using React Three Fiber (R3F) to render 3D panels styled after Sony ES-series rack equipment from the late '70s to mid-'80s. Deep champagne gold, warm amber backlighting, heavy brushed aluminum with visible grain, smoked glass readout windows, and analog VU-meter bars that glow. The look is fully retro — not retro-inspired, not a nod — but built with modern depth: physically-based materials, real-time lighting, smooth 60fps interaction. Timeless warmth meets tactile precision. Two interaction layers: compact uniform card in the dashboard grid, and a full-control detail dialog on expand. Devices organized into user-defined sections with labeled rack bay filler panels, and a 3D drag-and-drop system where panels slide off the rack surface and slot into new positions.

### Air purifier enhancements (driving the redesign)

- **PM2.5 readout** — live sensor value in ug/m3
- **Air quality level** — segmented VU bar (green to red, 4 levels)
- **Filter life** — thin progress bar draining over weeks, amber <30%, red <10%
- **Mode control** — rotary knob dial (Auto / Sleep / 1 / 2 / 3) with snap positions
- **Fan speed** — raw 1-3 levels (Core 300S), not 0-100 percentage mapping

## Why This Approach

### Sony ES Rack Uniformity

Every device card shares the same 3D chassis — same width, same champagne gold brushed faceplate, same corner screws, same beveled edges. Controls and displays vary per device type, but the shell is identical. A wall of matching panels is the aesthetic — the way a rack of Sony ES components looks when you see a full stack: TA-E86B preamp, STR-6800SD receiver, TC-K71 cassette deck, all the same warm champagne face. That's the feeling.

### Two-Layer Interaction

1. **Card (compact panel)** — shows at a glance: device name, power state, one key metric (PM2.5 for purifiers, brightness for lights, temperature for thermostats). Think faceplate with a small readout window. Tapping the power LED toggles power directly.
2. **Dialog (full control)** — opens via an explicit "expand" button on the card (not by clicking the whole card). Like pulling the unit out of the rack. Full rotary knob, all meters, mode selection, secondary controls. This keeps the card surface free for quick direct interactions while the expand button is the gateway to full control.

This solves the "different controls per type" problem — uniform grid stays tight, each device type gets a custom dialog layout.

### R3F for the Whole Card

React Three Fiber renders the panels with real depth — not flat cards with drop shadows, but actual 3D objects with physically-based materials that respond to lighting. The chassis has visible brushed grain that shifts with viewing angle. Display windows are recessed behind smoked glass. Knobs have machined grooves and cast subtle shadows. VU meters glow with bloom. This is the difference between a photo of gear and the gear itself. drei provides the building blocks (RoundedBox, Text, environment maps), but the final result should feel like you're looking at real equipment through a camera.

## Key Decisions

- **Aesthetic**: Full Sony ES-era retro. Champagne gold chassis, warm amber glow on active elements, smoked glass display windows, analog VU meters with real depth. Not retro-inspired — authentically retro, rendered with modern PBR materials and lighting.
- **Chassis**: Uniform 3D panel for ALL device types. Same shell, different face controls.
- **AQ visualization**: Segmented VU bar (horizontal, LED-style segments light up green-yellow-red).
- **Mode/speed control**: Rotary knob dial with snap positions. Available in the detail dialog.
- **Filter life**: Thin progress bar at bottom of card, always visible.
- **Scope**: All device types get the new design, not just air purifiers.
- **Interaction**: Card shows status at a glance. Power LED (left of name) tap to toggle directly. Expand is a recessed circular push-button (◎) top-right — depresses inward on click like a receiver function button.
- **Sections**: User-defined groupings (rooms or freeform). Labeled bay filler panels as visual dividers. Hybrid management — inline rename, drag to reorder, utility panel for create/delete.
- **Drag-and-drop**: 3D slide — panel lifts off rack, slides to new position, other panels shuffle. Initiated from dedicated grip zone (corner screws). Cross-section moves with amber glow confirmation at boundary.
- **New devices**: Section assignment prompt on discovery — no unsorted state.
- **Persistence**: Database — `sections` table + `sectionId`/`position` on devices. Layout survives across browsers.

## Design Language

### Color Palette

| Role | Color | Usage |
|------|-------|-------|
| Chassis | Champagne gold / warm silver (#c9b99a → #a89f91) | Card body, 3D panel surface — the warm metallic tone of '80s Sony faceplates |
| Display background | Deep smoked black (#0d0d0d) | Readout windows behind tinted glass — recessed, inky |
| Active/accent | Warm amber (#f5a623) | Glowing indicators, knob position markers, VU peak needles |
| Power LED (on) | Soft green (#4ade80) with bloom | Classic power-on indicator — subtle glow spill |
| Good AQ | Amber-green (#6ec87a) | VU segments 1-2, warm emerald not neon |
| Moderate AQ | Golden amber (#e6a817) | VU segment 3 |
| Poor AQ | Burnt orange-red (#d94f00) | VU segment 4 — urgent but not garish |
| Text (readouts) | Warm cream (#faf0dc) | Monospace values glowing behind smoked glass |
| Text (labels) | Etched champagne (#8a7e6b) | Embossed/engraved text on metal — subtle relief |
| Background/scene | Dark walnut (#1a1612) | Scene background — like a wooden hi-fi rack shelf |

### Typography

- **Panel labels**: **Michroma** (Google Fonts) — free geometric extended sans-serif in the spirit of Eurostile. Wide uppercase letterforms, letter-spaced. Used for: device names, knob labels (BRI, CCT, FAN, TMP), section names, mode button labels (HEAT, COOL, AUTO), fader scale markings. Rendered as embossed/engraved text on the chassis surface.
- **Digital readouts**: **DSEG7 Classic** (github.com/keshikan/DSEG) — free 7-segment display font replicating LED/VFD displays from the era. Glowing segmented numbers behind smoked glass, like a cassette deck counter or tuner frequency display. Used for: brightness %, color temp K, temperature °F, PM2.5 ug/m3, filter life %. Rendered as emissive warm cream text on the dark display window background.
- **Hosting**: Self-hosted ttf files in `client/public/fonts/`. TTF works for both CSS `@font-face` and drei `<Text>` in R3F — one format, no duplication. Michroma from Google Fonts, DSEG7 from GitHub releases. Both free/open-source (SIL OFL).

### Materials (R3F)

- **Chassis**: MeshStandardMaterial with roughness ~0.35, metalness ~0.8, champagne-tinted color, anisotropic normal map for directional brushed grain — the material should catch light differently as you move, like real brushed aluminum
- **Display windows**: Recessed geometry (inset ~2mm) with a semi-transparent smoked glass layer over emissive text. MeshPhysicalMaterial with transmission ~0.85, roughness ~0.05 for that glassy depth
- **Knobs**: Heavier, darker metal (gunmetal/dark chrome), machined concentric grooves via normal map, bright white indicator line with subtle emissive glow at the tip
- **VU segments**: Emissive material with bloom post-processing — segments glow warmly when lit, dark when off. Slight rounded bevel on each segment for physicality
- **Screw details**: Small inset circles at panel corners with cross-slot normal map — the kind of detail that makes it feel real
- **Scene lighting**: Warm key light (~3200K) from upper-left, soft fill, subtle ambient occlusion in recessed areas. The whole scene should feel like gear sitting under warm studio lighting
- **Fader tracks**: Recessed channel with etched notch markings. Thumb handle is gunmetal slider. Track can be illuminated (emissive) for brightness/gradient effects
- **Transport buttons**: Row of recessed rectangular push-keys. Active button glows amber (emissive), inactive buttons are dark embossed labels on metal. Like cassette deck transport controls.

### Reactive Lighting (Light Cards Only)

Light panels are unique — they reflect the state of the physical light they control:

- **Display window glow**: The smoked glass readout emits the light's actual color temperature. 2700K = warm amber glow, 6500K = cool blue-white. Brightness controls emissive intensity. Light off = dark display, faint text only.
- **Fader track illumination**: Brightness fader track lights up proportionally (left-to-thumb = lit). CCT fader track is a warm→cool gradient — the thumb visually sits on the color it selects.
- **Edge light bleed**: Subtle light emission around panel edges/seams, as if the bulb is behind the rack panel and light spills through. Color and intensity match the light's state.
- **Cross-panel illumination**: Because all panels share one R3F Canvas, edge bleed from a light panel casts real light on neighboring panels' brushed metal surfaces. A warm lamp next to a cool desk light creates competing warm/cool reflections. This is emergent from the 3D scene — not simulated, just how light works.

## Card Face Layouts (per device type)

Every compact card follows the same zone layout: power LED left of device name at top, expand button top-right, corner screws as drag grip zones, controls and displays in the center body.

### Light

**Compact card:**
- **Top**: Power LED (left of name, tap to toggle) + device name + expand button
- **Center**: Two horizontal faders with notched scale markings
  - **Brightness fader**: 0–100 scale, track illuminates proportionally (left-to-thumb = lit, thumb-to-right = dark)
  - **CCT fader**: 2700K–6500K scale, track is a warm→cool gradient (thumb sits on the color it's selecting)
- **Right**: Smoked glass readout window showing brightness % + color temp value
- **Reactive lighting**: Display window glows the light's actual color temperature and brightness. Edge light bleed around panel seams radiates the light's color. Adjacent light panels cast real light on each other's chassis — emergent from the shared R3F scene, not simulated.

**Detail dialog:**
- Full brightness + CCT faders (larger)
- Color wheel for RGB-capable lights (full color selection lives here, not on compact card)
- Power toggle

### Air Purifier

**Compact card:**
- **Top**: Power LED (left of name) + device name + expand button
- **Center-left**: PM2.5 readout in smoked glass window (monospace, e.g., "12 ug/m3")
- **Center**: Segmented VU bar showing AQ level (horizontal, green→amber→red segments)
- **Center-right**: Rotary knob with snap positions (Auto / Sleep / 1 / 2 / 3)
- **Bottom**: Filter life thin bar spanning full width with percentage label

**Detail dialog:**
- Full-size VU meter bar with segment labels
- PM2.5 + AQ level readout (larger)
- Rotary knob: Auto / Sleep / 1 / 2 / 3 (larger, with labeled positions)
- Filter life bar with percentage
- Power toggle

### Thermostat

**Compact card:**
- **Top**: Power LED (left of name) + device name + expand button
- **Center-left**: Smoked glass display showing current temp + target temp (stacked)
- **Center-right**: Rotary knob to adjust target temperature directly
- **Bottom**: Transport-style mode buttons — a row of recessed mechanical push-keys like cassette transport controls: HEAT | COOL | AUTO | OFF. Active mode glows amber, others are dark embossed labels on metal.

**Detail dialog:**
- Large temperature knob
- Mode transport buttons (same style, larger)
- Humidity readout if available
- Temperature history or schedule (if supported)

### Switch

**Compact card:**
- **Top**: Power LED (left of name) + device name + expand button
- **Center**: Large mechanical toggle switch (3D, flips up/down) with ON/OFF embossed labels

**Detail dialog:**
- Same large toggle (not much more needed — switches are simple)

## Rack Organization — Sections & Drag-and-Drop

### Sections (Rack Bays)

Devices are organized into user-defined sections — like separate bays in an equipment rack. Sections can be room-based ("Living Room", "Bedroom") or freeform ("Air Quality", "Entertainment") — the user names them whatever they want.

**Visual treatment — labeled bay filler panel**: Each section starts with a half-height decorative panel. Same champagne chassis material as device cards, but no controls — just the section name in embossed small-caps text and a subtle horizontal vent pattern. Like a blank rack filler panel you'd see between components in a real rack. These panels are part of the grid flow, occupying the full row width.

**Section management (hybrid approach)**:
- **Rename**: Click the section filler panel's name text to edit inline. Embossed text becomes an editable warm cream input field, same typography.
- **Reorder sections**: Drag the section filler panel itself (same 3D slide mechanic as device cards). The entire section — filler + all its devices — moves as a unit.
- **Create / delete**: A **rack utility panel** sits at the bottom of the rack. Same champagne chassis, but with utility controls: a recessed push-button styled "+" for new section, and a small gear icon engraved into the metal for layout settings. This panel is always the last item in the rack — like a power distribution unit at the bottom of a real equipment rack.

**New device placement**: When devices are discovered, a brief dialog prompts which section to place them in. Devices are always assigned from the start — no "unsorted" limbo. The dialog matches the rack aesthetic (champagne panel background, embossed section names as selectable options, warm amber highlight on selection).

### Drag-and-Drop (3D Slide)

**Interaction choreography:**

1. **Idle** — Corner screws sit flush in the chassis. Subtle cross-slot detail, same champagne metal as the panel. No visual noise — they look structural, not interactive.
2. **Hover over any corner screw** — All four screws pulse with a soft amber halo (emissive bloom). Cursor changes to grab hand. This signals "you can move this" without adding visible UI chrome in the idle state.
3. **Press and hold (~150ms)** — Panel lifts off the rack surface (Z-axis translate ~4mm). Shadow deepens below the floating panel. Screws stay lit amber. Haptic feedback via web-haptics on lift.
4. **Drag** — Panel follows pointer with slight physics lag (spring animation, not 1:1 tracking). Neighboring panels slide apart with a staggered spring to open a slot — like gear shifting on a shelf to make room.
5. **Cross-section boundary** — When the dragged panel passes over a section filler panel, the filler glows amber as a confirmation gate. Releasing completes the move. Dragging back cancels — glow fades.
6. **Drop** — Panel settles back flush with a micro-bounce (spring overshoot then settle). Screws fade from amber to neutral. Haptic snap on drop.

**Grip zone sizing**: Each corner screw target is ~44px for thumb-friendly touch. The four corners don't conflict with power LED (left of name, top area), expand button (top-right, inset from corner), or any faders/knobs (center body).

**Accessibility**: react-three-a11y focus on grip zone. Arrow keys reposition within section. Shift+arrow for cross-section moves with the same amber confirmation. Screen reader: "Moving [device name] to [section name]."

**Persistence**: `sections` table (name, position) + `sectionId`/`position` columns on devices. Saved immediately on drop via `PATCH /api/devices/:id/position`.

### Expand Button (Full View)

**Style**: Recessed circular push-button — like a function button on a Sony receiver (source select, tape monitor, etc.). Sits top-right of the panel, inset from the corner screw.

**Interaction choreography:**

1. **Idle** — Small circular button (~32px), recessed ~1mm into the faceplate. Engraved ◎ symbol (or two outward arrows ⤢). Same champagne metal with a slightly darker ring border. Blends into the chassis — visible but not loud.
2. **Hover** — Button ring glows soft amber. Symbol becomes slightly more visible (increased contrast).
3. **Press** — Button depresses inward ~1mm with a tactile click animation. Haptic feedback via web-haptics.
4. **Transition to dialog** — The panel slides forward out of the rack (Z-axis, toward the viewer) and scales up into the detail dialog. Like pulling a component out of the rack for service. Background panels dim slightly. The dialog uses the same chassis material and design language — it's the same panel, just bigger with full controls exposed.
5. **Close dialog** — Panel slides back into its rack position and settles flush. Reverse of the open animation.

### Rack Utility Panel

The bottom panel of the rack — always present, same chassis material but slightly darker tint to distinguish it as infrastructure rather than content.

Controls (styled as rack hardware, not web buttons):
- **"+" push-button**: Recessed circular button with engraved "+" symbol. Press creates a new section with a default name ("New Section"), immediately editable.
- **Gear icon**: Engraved gear opens a minimal layout dialog (rack-styled) for destructive operations — delete empty sections, reset all positions to default.

## Future Considerations (not in scope now)

- **Per-model fan speed profiles**: Store max fan levels in device metadata, scale knob positions dynamically
- **Additional purifier metrics**: PM1, PM10, VOC, CO2 for higher-end models (API supports it)

## Resolved Questions

- **Performance**: Single R3F Canvas for the whole grid. All panels rendered as instanced meshes in one scene. Best GPU utilization, one render loop.
- **Mobile/touch**: Touch-optimized rotary knob with circular drag gestures. Snap haptics via [web-haptics](https://github.com/lochie/web-haptics) library for tactile feedback on knob positions.
- **Card dimensions**: Fixed aspect ratio (e.g., 3:2) for all panels. Grid columns adjust count responsively but each panel keeps its proportions. Authentic rack aesthetic.
- **Detail dialog trigger**: Explicit "expand" button on the card, not whole-card click. Card surface stays free for direct interactions (power LED toggle, etc.).
- **Accessibility**: Built in from the start using [react-three-a11y](https://github.com/pmndrs/react-three-a11y) — provides Tab navigation, Enter activation, screen reader announcements, and focus indicators natively in R3F. Arrow keys wired to rotary knob rotation. No hidden React Aria layer needed.
- **DnD trigger**: Dedicated grip zone at corner screws, not long-press or edit mode. Avoids conflict with power LED and expand button. Corner screws glow amber on hover to signal affordance.
- **Cross-section DnD**: Allowed with confirmation — amber glow on section filler panel when crossing boundary. Dragging back cancels.
- **Section management**: Hybrid — inline rename on filler panel click, drag filler to reorder sections, rack utility panel at bottom for create/delete.
- **New device flow**: Section assignment prompt on discovery. No "unsorted" section.
- **Layout persistence**: Database (sections table + device columns). Not localStorage — survives across browsers.

## Open Questions

- **Grid aspect ratio**: Exact ratio TBD — 3:2 vs 16:9 vs something custom. Should prototype both and see what feels right with the 3D panels. Will resolve during implementation.
