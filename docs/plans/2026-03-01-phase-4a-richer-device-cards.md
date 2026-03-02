---
title: "Phase 4a: Richer Device Cards"
type: feat
status: complete
date: 2026-03-01
---

# Phase 4a: Richer Device Cards

## Context

All devices previously rendered with the same generic `DeviceCard` regardless of type — lights showed a power button, thermostats were read-only, air purifiers had no fan control. Phase 4a refactors the card system into a type-specific dispatcher, expands the domain model to cover all hardware, and prepares the UI for the full device inventory.

**Hardware inventory driving this phase:** Hue lights, Levoit purifiers (VeSync), Eufy S1 Pro vacuum, GE washer/dryer/dishwasher/oven, Samsung fridge/TV, Sonos, Resideo HVAC.

---

## Changes Made

### 1. Server — Expanded Types (`server/src/integrations/types.ts`)

**`DeviceType`** expanded from 5 to 12 types:

| New Type | Hardware |
|---|---|
| `vacuum` | Eufy S1 Pro |
| `washer_dryer` | GE washer/dryer |
| `dishwasher` | GE dishwasher |
| `oven` | GE oven |
| `fridge` | Samsung fridge |
| `tv` | Samsung TV |
| `media_player` | Sonos |

**`DeviceState`** new fields:

| Field | Type | Purpose |
|---|---|---|
| `status` | `string` | Vacuum: `'cleaning' \| 'docked' \| 'returning' \| 'paused' \| 'error'` |
| `battery` | `number` | Vacuum battery 0–100% |
| `volume` | `number` | Media/TV volume 0–100 |
| `playing` | `boolean` | Media play state |
| `track` | `string` | Currently playing track name |
| `cycleStatus` | `string` | Appliances: `'running' \| 'paused' \| 'done' \| 'idle'` |
| `timeRemaining` | `number` | Appliance cycle minutes remaining |
| `doorLocked` | `boolean` | Washer/dishwasher door lock |
| `targetCoolTemp` | `number` | Fridge setpoint °C |
| `targetFreezeTemp` | `number` | Freezer setpoint °C |

### 2. Server — PATCH Schema (`server/src/routes/devices.controller.ts`)

Added to `PATCH /:id/state` body:

| Field | Purpose |
|---|---|
| `targetTemperature` | Thermostat setpoint |
| `mode` | Thermostat mode: heat/cool/auto/off |
| `volume` | Media/TV volume |
| `status` | Vacuum command: start/pause/dock |

### 3. Client — Device Card Architecture

**Before:** Single `DeviceCard.tsx` with inline `StateDisplay` switch.

**After:** Dispatcher pattern:

```
client/src/components/
  DeviceCard.tsx                ← dispatcher + CardShell (shared header/footer)
  device-cards/
    LightCard.tsx               ← power toggle + brightness slider + color temp slider
    ThermostatCard.tsx          ← temp display + target ±0.5°C + mode pills
    AirPurifierCard.tsx         ← power toggle + fan speed slider + AQI badge
    VacuumCard.tsx              ← status badge + battery bar + Start/Pause/Dock
    ApplianceCard.tsx           ← cycle status + time remaining (read-only)
    MediaCard.tsx               ← power toggle + volume slider + play/pause
    FridgeCard.tsx              ← fridge + freezer temp (read-only)
    SensorCard.tsx              ← temperature + humidity (read-only)
    GenericCard.tsx             ← fallback: power toggle for switches + state KV dump
```

**`CardShell`** (extracted from `DeviceCard`) renders: outer border, header (icon + name + brand + online badge), and HomeKit footer. Each sub-component fills the body slot via `children`.

**Dispatch logic in `DeviceCard`:**

```ts
switch (device.type) {
  case 'light':        → LightCard
  case 'thermostat':   → ThermostatCard
  case 'air_purifier': → AirPurifierCard
  case 'vacuum':       → VacuumCard
  case 'washer_dryer':
  case 'dishwasher':
  case 'oven':         → ApplianceCard
  case 'tv':
  case 'media_player': → MediaCard
  case 'fridge':       → FridgeCard
  case 'sensor':       → SensorCard
  default:             → GenericCard
}
```

### 4. Native HomeKit Treatment

Brands with native HomeKit (`hue`, `aqara`) show **"Native ✓"** in the card footer instead of the HomeKit toggle switch, preventing user confusion.

Previously only `aqara` had this treatment; `hue` was incorrectly showing the toggle.

---

## Slider UX Pattern

All sliders use controlled state + `onChangeEnd` to avoid spamming the API during drag:

```ts
const [brightness, setBrightness] = useState(device.state.brightness ?? 100)
useEffect(() => { setBrightness(device.state.brightness ?? 100) }, [device.state.brightness])

<Slider
  value={brightness}
  onChange={setBrightness}       // updates local state visually during drag
  onChangeEnd={(v) => { void onStateChange?.(device.id, { brightness: v }) }}
/>
```

SSE confirms the real value shortly after the API call resolves.

---

## Verification

1. `bun run system:check --force` — passes clean
2. Hue lights render with brightness slider + "Native ✓" badge
3. DB studio (`bun run db:studio`) can be used to set `type` to simulate other device cards
4. Thermostat: ± buttons call `onStateChange({ targetTemperature })`
5. Vacuum: Start/Pause/Dock buttons disabled when offline
6. Appliances: read-only, show cycle status and time remaining
