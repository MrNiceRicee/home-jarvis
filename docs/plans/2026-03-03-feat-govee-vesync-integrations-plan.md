---
title: "feat: Add Govee and VeSync cloud integrations"
type: feat
status: active
date: 2026-03-03
---

# feat: Add Govee and VeSync Cloud Integrations

## Context

home-jarvis has two working adapters (Hue, Elgato). Both Govee and VeSync are already pre-registered in `INTEGRATION_META` with credential fields, `DEFAULTS` poll intervals exist in `cloud-poller.ts`, and client brand icons/labels are in place. Only the adapter implementations and `createAdapter()` case branches are missing. This plan adds both cloud-based adapters following the established `DeviceAdapter` pattern.

## Proposed Solution

Two new adapter files + two case branches in the registry. Each adapter implements `validateCredentials`, `discover`, `getState`, `setState` using `ResultAsync` from neverthrow, following the Hue adapter pattern.

### Govee — Official API v2

- **Auth**: `Govee-API-Key` header (single API key from developer.govee.com)
- **Base URL**: `https://openapi.api.govee.com`
- **Endpoints**:
  - `GET /router/api/v1/user/devices` — list all devices (capabilities included)
  - `POST /router/api/v1/device/state` — get device state (body: `{ requestId, payload: { sku, device } }`)
  - `POST /router/api/v1/device/control` — control device (one capability per request)
- **Rate limits**: 10,000 req/day + **10 req/min per device** (429 with `Retry-After`)
- **Capability model**: devices declare capabilities (`on_off`, `range`, `color_setting`, etc.) — parse dynamically, don't hardcode by SKU
- **externalId encoding**: `${device}::${sku}` — both MAC address and model are required for all API calls
- **Device type mapping**: `devices.types.light` → `light`, `devices.types.socket` → `switch`, `devices.types.air_purifier` → `air_purifier`, `devices.types.humidifier` → `air_purifier` (map to existing type)
- **Color encoding**: packed 24-bit integer — `(r << 16) | (g << 8) | b`
- **Color temp**: Kelvin directly (range from capability parameters, typically 2000–9000K)

### VeSync — Unofficial API (pyvesync-based)

- **Auth**: Two-step login — email + MD5(password) → authorize code → token + accountID
  - Step 1: `POST /globalPlatform/api/accountAuth/v1/authByPWDOrOTM`
  - Step 2: `POST /user/api/accountManage/v1/loginByAuthorizeCode4Vesync`
- **Base URL**: `https://smartapi.vesync.com`
- **Token management**: Module-level cache `Map<integrationId, { token, accountID, expiresAt }>`. Re-login on error code `-11001000` (TOKEN_EXPIRED). Max 3 retries.
- **Device listing**: `POST /cloud/v1/deviceManaged/devices` (paginated, pageSize=100)
- **Device control**: `POST /cloud/v2/deviceManaged/bypassV2` for modern devices (all we'll support in MVP)
  - `setSwitch` (power), `setLevel` (fan speed), `setPurifierMode` (mode), `setLightStatus` (bulbs)
- **externalId**: `cid` field from device list (stable device identifier)
- **Device type mapping**: `wifi-air` / `Core*` → `air_purifier`, `wifi-switch` / `ESW*` → `switch`, `wifi-humid` / `LUH*` → `air_purifier`, `ESL*` → `light`
- **Key fields to store in metadata**: `{ cid, uuid, configModule, deviceType, deviceRegion }` — needed for control requests

## Files to Create

### `server/src/integrations/govee/adapter.ts`

```
GoveeAdapter implements DeviceAdapter
  brand = 'govee'
  displayName = 'Govee'
  discoveryMethod = 'cloud'

  constructor(config: { apiKey }) → store apiKey

  validateCredentials(config)
    → fetch GET /router/api/v1/user/devices with Govee-API-Key header
    → check code === 200

  discover()
    → fetch GET /router/api/v1/user/devices
    → map each device to DiscoveredDevice:
      - externalId = `${device.device}::${device.sku}`
      - name = device.deviceName
      - type = mapGoveeType(device.type)
      - state = {} (capabilities not returned inline — separate call)
      - online = check online capability if present, else true
      - metadata = { sku: device.sku, mac: device.device, capabilities: device.capabilities }
    → for each device, fetch state via POST /router/api/v1/device/state (bounded concurrency=3)
    → merge state into DiscoveredDevice

  getState(externalId)
    → parse sku+device from externalId
    → POST /router/api/v1/device/state
    → parse capability states into DeviceState:
      - powerSwitch → on (1=true, 0=false)
      - brightness → brightness (1–100, already correct scale)
      - colorRgb → color (unpack 24-bit int)
      - colorTemperatureK → colorTemp (Kelvin)
      - online → used for online field

  setState(externalId, state)
    → parse sku+device from externalId
    → for each changed property, POST /router/api/v1/device/control:
      - on → { type: on_off, instance: powerSwitch, value: 1/0 }
      - brightness → { type: range, instance: brightness, value }
      - color → { type: color_setting, instance: colorRgb, value: packed int }
      - colorTemp → { type: color_setting, instance: colorTemperatureK, value }
    → sequential calls (one capability per request — API requirement)
```

### `server/src/integrations/vesync/adapter.ts`

```
Module-level:
  sessionCache = Map<string, { token, accountID, countryCode, expiresAt }>

  login(email, password) → two-step auth flow → session
  getSession(integrationKey, email, password) → check cache → login if needed

VeSyncAdapter implements DeviceAdapter
  brand = 'vesync'
  displayName = 'VeSync (Levoit)'
  discoveryMethod = 'cloud'

  constructor(config: { email, password })

  validateCredentials(config)
    → login(email, md5(password))
    → check code === 0

  discover()
    → getSession()
    → POST /cloud/v1/deviceManaged/devices
    → map each device to DiscoveredDevice:
      - externalId = device.cid
      - name = device.deviceName
      - type = mapVeSyncType(device.deviceType, device.type)
      - state = {} (separate getState call fills this)
      - online = device.connectionStatus === 'online'
      - metadata = { cid, uuid, configModule, deviceType, deviceRegion }
    → for each online device, getState() (bounded concurrency=3)
    → merge state

  getState(externalId)
    → look up device metadata (stored in DB metadata column)
    → getSession()
    → POST /cloud/v2/deviceManaged/bypassV2 with getPurifierStatus/getOutletStatus/etc.
    → parse response into DeviceState
    → handle TOKEN_EXPIRED: re-login, retry once

  setState(externalId, state)
    → look up device metadata
    → getSession()
    → build appropriate setSwitch/setLevel/setLightStatus payload
    → POST /cloud/v2/deviceManaged/bypassV2
    → handle TOKEN_EXPIRED: re-login, retry once
```

## Files to Modify

### `server/src/integrations/registry.ts` (lines 117–126)

Add two case branches in `createAdapter()`:
```typescript
case 'govee':
  return ok(new GoveeAdapter(config))
case 'vesync':
  return ok(new VeSyncAdapter(config))
```

Import both adapter classes at the top.

### `client/src/components/IntegrationForm.tsx` (line 30)

Remove `'govee'` from `SCANNABLE_BRANDS` — Govee is cloud-only, not locally scannable:
```typescript
const SCANNABLE_BRANDS = new Set(['hue', 'aqara', 'elgato'])
```

## Technical Considerations

### Rate Limit Strategy (Govee)

- **State poll interval**: Increase from 60s → 120s to conserve daily budget
  - At 120s: ~720 state requests/day (vs 1,440 at 60s)
  - With `getState` per device during discover: ~288 extra/day (assuming 1 device, 5min discover interval)
  - Leaves headroom for user-initiated setState calls
- **Per-device 10/min limit**: Debouncing is handled at the UI level (slider `onChangeEnd`). No server-side debounce needed.
- **429 handling**: Check response code, log warning, return Err — poller will retry next cycle

### Session Management (VeSync)

- Module-level `Map<string, VeSyncSession>` keyed by `${email}:${password_hash}`
- Session cached indefinitely until TOKEN_EXPIRED error triggers re-login
- Password stored as-is in DB config JSON (same as all other adapters — credentials encrypted at rest by SQLite)
- MD5 hash computed at call time, not stored separately

### VeSync Device Protocol Routing

MVP: **V2 only** (`bypassV2`). V1 devices are legacy (7A outlets from 2018). If a user reports a V1 device not working, we add V1 support later.

### Device Type Mapping

No new `DeviceType` values needed for MVP:
- Humidifiers → `air_purifier` (similar control surface: on/off, fan speed, humidity)
- This avoids touching the type union, client card routing, and client icons
- If distinct humidifier UI is needed later, add the type then

### Error Propagation

Both adapters follow HueAdapter's pattern:
- `ResultAsync.fromPromise(fetch(...), mapError)` chains
- Network errors → descriptive Error messages
- API errors → parsed from response body
- All errors bubble up to cloud-poller which logs and continues

## Implementation Order

1. **Govee adapter** — simpler auth (single API key), well-documented official API
2. **VeSync adapter** — more complex (two-step auth, session caching, device-type routing)
3. **Registry wiring** — two case branches + imports
4. **Fix SCANNABLE_BRANDS** — remove 'govee' from client-side set
5. **Update DEFAULTS** — change Govee stateIntervalMs from 60_000 → 120_000
6. **Smoke test** — add each integration via UI, verify devices appear, test control

## Acceptance Criteria

- [x] Govee adapter: discover lists devices, getState returns on/brightness/color/colorTemp, setState controls lights and plugs
- [x] VeSync adapter: discover lists devices, getState returns on/fanSpeed/airQuality for purifiers, setState toggles power and fan speed
- [x] Both adapters: validateCredentials rejects bad credentials with clear error messages
- [x] Cloud poller picks up both integrations on startup, polls at configured intervals
- [x] SSE pushes device updates to client, devices render in grid with correct type icons
- [x] Govee rate limits handled gracefully (no crashes on 429)
- [x] VeSync token expiry handled (auto re-login, no user intervention)
- [x] `bun run system:check --force` passes

## Verification

1. Add Govee integration via UI → enter API key → devices should appear in grid
2. Control a Govee light → brightness slider → verify state updates
3. Add VeSync integration via UI → enter email + password → devices should appear
4. Control a VeSync air purifier → power toggle → verify state updates
5. Restart server → verify both integrations auto-resume polling
6. Run `bun run system:check --force` — no type errors, no lint errors

## Sources

- **Govee API v2**: [developer.govee.com](https://developer.govee.com/reference/get-you-devices) — GET devices, POST state, POST control
- **Govee rate limits**: 10k/day + 10/min/device, appliances 100/day
- **VeSync API**: [pyvesync v3](https://github.com/webdjoe/pyvesync) — reverse-engineered, most complete reference
- **VeSync auth**: Two-step flow, TOKEN_EXPIRED code `-11001000`
- **Reference adapter**: `server/src/integrations/hue/adapter.ts` — ResultAsync pattern, fetch + AbortSignal.timeout
- **Registry**: `server/src/integrations/registry.ts:116` — createAdapter switch
- **Poller**: `server/src/discovery/cloud-poller.ts:20` — DEFAULTS config
