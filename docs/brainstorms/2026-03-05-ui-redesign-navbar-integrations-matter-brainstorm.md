# UI Redesign: Navbar, Integrations, Matter

**Date:** 2026-03-05
**Status:** Complete
**Branch:** `feat/scanner-refactor-design-refresh`

## What We're Building

A design refresh of the three areas that didn't get the Sony Making Modern treatment during the dashboard card redesign: the **navbar**, **integrations page**, and **matter page**. Plus systematic **zustand adoption** to replace all React Query state hacks as a clean break.

## Design Direction

### Overall Feel

- Navbar + integrations: **instrument continuity meets content-forward** — retro instrument DNA carries through but typography hierarchy and spacing do the heavy lifting
- Matter page: **full console experience** — the showpiece, darkest and most immersive page, HAL-inspired
- Retro and instruments with color, not "web dark mode" mentality
- Typography and spacing are always a focus

### Two-Font System

**Drop Commit Mono entirely.** Two fonts only:

- **IoskeleyMono** — everything: nav, body text, readouts, data. The mono voice of the app.
- **Michroma** — labels, headings, section titles. Geometric, uppercase, engraved hardware feel.

## Key Decisions

### Navbar

- **No brand name** — no "Home Jarvis" in the navbar. Page context speaks for itself.
- **Elevated feel** — sits above the page like a physical control surface, not just a sticky bar.
- **Slash-path convention** — nav items styled as `/dashboard` `/integrations` `/matter` in IoskeleyMono.
- **LED dot active indicator** — small colored dot to the left of the active path. Like a channel indicator on a mixer.
- **Contextual readout strip** — right side, three slots:
  - Slot 1: connection status dot (always present)
  - Slot 2 + 3: two readout values that change per page context
  - Notifications temporarily take over the full strip, then scramble back to page context

#### Readout Content Per Page

| Page | Slot 2 | Slot 3 |
|------|--------|--------|
| Dashboard | device count (`12 devices`) | online count (`9 online`) |
| Integrations | connected count (`4 connected`) | scan state (`scanning...` / `scan complete`) |
| Matter | bridge state (`bridge: paired`) | bridged count (`8 bridged`) |

Values are dynamic — examples above show format, not fixed strings.

**Notifications** go through the readout strip for ambient system status (new device discovered, scan complete, bridge state changes). Sonner toasts stay for important alerts that demand attention (errors, confirmations, actions). Both coexist — readout strip is passive awareness, toasts are active interrupts.

### Readout Strip Animations

Two animation modes, chosen by content type:

- **Segment scramble** — for short readouts (data values). Each character cycles through random glyphs before landing on the real value, staggered left-to-right. IoskeleyMono's fixed width = zero layout shift. Like an instrument display recalibrating.
- **Vertical ticker** — for notifications and longer text. Text slides up/down like a mechanical flip display.

Using `motion` v12 (already installed, currently unused).

### Integrations Page

**Mix approach** — scan gets instrument treatment, catalog gets module rack aesthetic.

#### Scan Section: Readout Log

A dark ReadoutDisplay window that streams scan events in IoskeleyMono as they happen:
```
scanning hue...        3 found
scanning elgato...     1 found
scanning vesync...     2 found
scan complete          6 devices
```
Live terminal/diagnostic feel. Reuses the existing ReadoutDisplay component language.

#### Integration Catalog: Module Rack

Each integration is a **module panel** — like a eurorack module or Teenage Engineering pocket operator face:
- Brand icon/logo centered
- Small status LED
- Device count as readout display digit
- Action area (connect/configure) as physical-feeling button

**Same form factor, different power state:**
- **Connected modules** — lit status LED (green/amber), ReadoutDisplay showing device count, full opacity brand mark, configure/remove actions
- **Available modules** — unlit LED (dim dot), empty readout window or dashed placeholder, reduced opacity brand mark, connect button

The grid of modules feels like looking at a rack of installed hardware. Connected ones are "powered on" (warm glow, lit indicators), available ones are "empty slots."

### Matter Page: Solar System Console

**Full console experience** — the darkest, most immersive page in the app.

#### Two Modes: Unpaired vs Paired

**Unpaired / bridge off:** different layout entirely. Keeps the current QR code panel approach — no solar system. The orbital visualization only appears once the bridge is paired and has devices to show. This avoids an empty/skeleton constellation that looks broken.

**Paired + running:** full solar system console.

#### HAL-Inspired Orbital Visualization (paired state)

Three concentric rings + device satellites:

1. **Core (the sun)** — bridge status. Glowing orb that pulses gently when active. Color = state (emerald = running, amber = starting, red = error). The HAL eye.
2. **Metadata ring** — thin ring with readout segments: port, pairing status, uptime. Subtle animated dashes or slow rotation.
3. **Integration ring** — integration nodes (the planets). Each connected brand is a larger node on the orbit.
   - **Device satellites** — each integration node has its own tiny cluster of device dots. Hue node has 6 dots for 6 lights, VeSync has 2 dots for 2 purifiers.

**Hierarchy:** bridge → metadata → integrations → devices as satellites of their integration.

Retro instruments with color — warm darks with accent colors, not flat web dark mode. Can pull back to just integration nodes (no device satellites) if it gets too busy in practice.

### State Management: Zustand

**All at once, clean break.** Migrate all three React Query hacks + add the new readout store:

| Current Hack | Zustand Store |
|---|---|
| `['stream:status']` — dummy queryFn, `staleTime: Infinity` | Connection store |
| `['devices']` — SSE populates cache, never fetches | Device store |
| `['scan:state']` — full state machine in query cache | Scan store |
| *(new)* navbar readout system | Readout store |

React Query stays for actual server data: `['integrations']`, `['sections']`, `['matter']`, `['matter', 'qr']`.

Key benefits:
- SSE handler writes to zustand outside React (no `queryClient` needed)
- Cleaner imperative actions (`pushNotification()`, `setPageContext()`)
- Readout store drives animations — subscribers know *when* values changed

## Resolved Questions

1. **Integrations scan section** → Readout log. Dark ReadoutDisplay window streaming scan events in IoskeleyMono.
2. **Integration catalog layout** → Module rack. Same form factor for all, "power state" differentiates connected vs available.
3. **Matter HAL circle** → Bridge + device constellation. Solar system: core (bridge) → metadata ring → integration planets → device satellites.
4. **Readout strip content** → Three slots: status dot + two contextual readouts. Content changes per page.
5. **Zustand migration scope** → All at once. Clean break, treat as fresh approach.
6. **Navbar active state** → LED dot to the left of the active path.
7. **Matter unpaired state** → Different layout entirely. QR code panel for pairing, solar system only appears after paired.
8. **Toasts vs readout strip** → Both coexist. Readout strip = ambient status. Sonner toasts = important alerts needing attention.
