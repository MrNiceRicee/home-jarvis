# Multi-Device Integration Model + Matter Bridge

**Date:** 2026-03-02
**Status:** Ready for planning

## What We're Building

Two interconnected improvements to the device integration architecture:

1. **Multi-device model fix** — The integration model assumes one integration = one connection endpoint. This breaks for discovery-based brands like Elgato where each device is independently addressable. We need per-device connection info (metadata column) and a poller that can reach all devices.

2. **Matter bridge** — Replace the stubbed HAP-based HomeKit bridge (Phase 5) with a Matter bridge built on [matter.js](https://github.com/project-chip/matter.js/). This gives us HomeKit + Google Home + Alexa support through one protocol. Non-Matter devices (Elgato, Hue, Govee) get bridged through their brand adapters. Matter-native devices get discovered and controlled directly via a Matter controller.

The flow for every device:
```
[Non-Matter device] → Brand adapter → Matter bridge → HomeKit / Google / Alexa
[Matter-native device] → Matter controller → direct control (no adapter needed)
```

## Why This Approach

**Brand-level integration + per-device metadata + Matter as the universal bridge layer.**

- Preserves existing brand adapters for non-Matter devices (they still work)
- Matter bridge replaces the HAP stub — one implementation covers HomeKit + Google + Alexa
- Matter controller adds native Matter device support as a new "brand" integration
- Per-device metadata column solves the multi-IP poller problem cleanly

Alternatives considered:
- **HAP-only bridge** — only covers HomeKit, requires separate work for Google/Alexa
- **Skip multi-device fix, go straight to Matter** — risky; the metadata/poller fixes are needed regardless and inform how Matter bridge reads device state
- **Remove integrations for discovery brands** — breaks the consistent "all brands have an integration row" model

## Key Decisions

### 1. Integration stays brand-level (one row per brand)

The `unique(brand)` constraint remains. For discovery-based brands like Elgato, the integration config can be empty `{}` — it exists to signal "this brand is enabled." Credential brands continue storing their API keys/passwords in the config blob. Matter gets its own integration row (`brand: 'matter'`).

### 2. New `metadata` JSON column on devices table

A nullable `text` column called `metadata` on the `devices` table, storing arbitrary per-device info as JSON:

```json
{ "ip": "192.168.1.29", "port": 9123 }
```

This is the mutable connection endpoint. `externalId` remains the stable unique identifier. Adapters read connection info from metadata when available, falling back to parsing externalId for backward compatibility.

### 3. Poller has two paths: integration-level vs device-level

- **Credential brands (Hue, Govee, etc.):** Poller creates one adapter per integration, passes integration config, calls `discover()` — existing behavior unchanged.
- **Discovery brands (Elgato):** Poller iterates device rows for that brand, creates a mini-adapter per device using its metadata IP, polls state individually.

The adapter's existing `discoveryMethod` field (currently unused) becomes the branch condition.

### 4. No Edit button for discovery-based brands

Discovery brands have no credentials to edit. The integration card shows only Remove (disconnects the entire brand + all its devices). Per-device management belongs on the Dashboard.

### 5. Matter bridge replaces HAP bridge

The current `toHomeKitAccessory()` method on `DeviceAdapter` and the HomeKit pairing page (`homekit.tsx`) get replaced with a Matter bridge using matter.js. The bridge:
- Maps internal `DeviceState` to Matter clusters (OnOff, LevelControl, ColorControl, Thermostat, etc.)
- Exposes bridged devices to all Matter-compatible controllers (Apple Home, Google Home, Alexa)
- Replaces the per-device `homekitEnabled` toggle with a `matterExposed` toggle

### 6. Matter controller as a new integration

A `matter` integration that acts as a Matter controller:
- Discovers Matter-native devices on the local network via commissioning
- Controls them using Matter protocol directly (no brand-specific adapter)
- Devices appear in the dashboard like any other brand

## Scope

### In scope
- Add `metadata` column to devices schema
- Populate metadata with `{ ip }` during Elgato discover/add-from-scan
- Update cloud poller to iterate devices for discovery brands
- Hide Edit button for discovery brands on integrations page
- Matter bridge (matter.js) exposing all enabled devices
- Replace `homekitEnabled` / `toHomeKitAccessory()` with Matter bridge approach
- Update homekit.tsx to show Matter pairing (QR code commissioning)
- Backward compat: Elgato adapter falls back to parsing externalId if no metadata

### Out of scope (future)
- Matter controller for native Matter device discovery (separate feature)
- Per-device remove/rename from Dashboard
- Multiple Hue bridges
- Google Home / Alexa specific UI (they just work via Matter)

## Resolved Questions

- **Where does per-device address live?** In a `metadata` JSON column on devices.
- **How does the poller reach multiple devices?** Two polling paths branching on `discoveryMethod`.
- **What does Edit do for discovery brands?** Nothing — hide it.
- **What replaces HAP?** Matter bridge via matter.js — covers HomeKit + Google + Alexa.
- **What about devices that don't match Matter?** Matter covers lights, switches, thermostats, sensors, air purifiers, vacuums, media, cameras. Anything unsupported stays dashboard-only.
- **Do we need a Matter controller too?** Yes eventually, but out of scope for this plan. Focus is on bridging existing devices first.
