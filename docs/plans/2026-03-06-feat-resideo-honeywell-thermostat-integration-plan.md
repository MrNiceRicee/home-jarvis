---
title: "feat: Resideo (Honeywell Home) Thermostat Integration"
type: feat
status: active
date: 2026-03-06
---

# Resideo (Honeywell Home) Thermostat Integration

## Enhancement Summary

**Deepened on:** 2026-03-06
**Research agents used:** OAuth flow researcher, Token refresh researcher, TCC/LCC researcher, Temperature conversion researcher, Repo research analyst
**Review agents used:** Security sentinel, Architecture strategist, TypeScript reviewer, Pattern recognition specialist, Code simplicity reviewer, SpecFlow analyzer, Performance oracle

### Key Improvements from Deepening

1. **Use `deviceModel` not `deviceID` prefix** for TCC/LCC branching — homebridge-resideo branches on `deviceModel` exclusively
2. **Fixed 2-min buffer for token refresh** instead of 50% of `expiresIn` — with ~10-min token lifetime, 50% means refreshing every poll cycle
3. **Extract state from `/v2/locations` response** — skip per-device GET, reduce discover from 1+N to 1 request
4. **Separate `OAUTH_STATE_SECRET`** — don't reuse consumer secret as HMAC key
5. **Bug fix at line 48 too** — manual `/discover` endpoint has the same missing-session bug as line 187
6. **Both setpoints always required** in POST payload, even if only one changed
7. **`autoChangeoverActive` required for ALL device classes** — not just TCC
8. **Clamp setpoints in API's native unit** — never in Celsius-space (rounding can produce false rejections)
9. **Proactive refresh is best-effort** — if refresh fails but access token still valid, continue with current token
10. **Callback must explicitly clear `authError: null`** — or re-auth leaves stale error state
11. **`setState` metadata gap** — DeviceAdapter interface has no metadata parameter; pass device metadata from controller
12. **IntegrationForm hardcodes LG** — line 334 must be parameterized with `meta.brand`

### Key Decisions

1. **OAuth Authorization Code flow** — user authorizes in browser, server handles callback + token exchange. No manual token pasting.
2. **Generalized OAuth callback route** — `/api/integrations/:brand/oauth/start` and `/api/integrations/:brand/oauth/callback` pattern, reusable for LG and future OAuth brands. *(IntegrationForm already has `oauthFlow` branch hardcoded to LG — fixing that to use `meta.brand` makes generalization nearly free.)*
3. **Separate state signing secret** — HMAC-SHA256 signed state using `OAUTH_STATE_SECRET` env var (NOT the consumer secret). Includes random nonce for replay protection. Stateless CSRF — no DB table needed.
4. **VeSync session pattern** — constructor takes `(config, session?)`, `get session()` getter, `withTokenRetry()` for automatic refresh, rotating refresh token persistence.
5. **Fix `devices.controller.ts`** — pass `integration.session` to `createAdapter()` at BOTH line 48 (manual discover) and line 187 (setState). Pre-existing bug that blocks all session-based adapters.
6. **Temperature in Celsius internally** — convert F/C on read using device's `units` field, C→F/C on write. Store `units` in device metadata.
7. **Single target temp for MVP** — in auto mode, surface `heatSetpoint` as `targetTemperature`. Dual-setpoint UI is a follow-up.
8. **`deviceModel`-based branching** — branch setState payload on `deviceModel` (e.g., `"Round"`, `"T5-T6"`), not `deviceID` prefix. Store `deviceModel` in metadata.
9. **Defer fan control** — fan is a separate endpoint with discrete modes (Auto/On/Circulate), not a 0-100 slider. Needs UI work. Follow-up.
10. **Defer schedule/hold** — send `PermanentHold` on manual changes for MVP. Hold types are a follow-up.

## Overview

Add a Resideo (Honeywell Home) adapter that connects thermostats via the Honeywell Home cloud API. This is the first OAuth-based integration and the first thermostat, exercising both the OAuth infrastructure and the existing `ThermostatCard` UI.

## Problem Statement

The `thermostat` device type exists in the schema, the `ThermostatCard` is built, but no adapter produces thermostat data. Resideo/Honeywell Home has a well-documented cloud API and is common in US homes. The integration requires OAuth2 Authorization Code flow — a pattern not yet implemented but needed for LG and future brands.

## Proposed Solution

Four-phase implementation:

1. **OAuth infrastructure** — generalized start/callback routes, state signing, token exchange
2. **Resideo adapter** — discover, getState, setState following VeSync session pattern
3. **Bug fix** — pass session to `createAdapter` in devices controller (both callsites)
4. **Client polish** — authError display on ModulePanel, OAuth return handling, IntegrationForm generalization

## Technical Approach

### Phase 1: OAuth Infrastructure

Build generalized OAuth routes that work for any `oauthFlow: true` brand.

#### 1.1 Update IntegrationMeta for Resideo

In `server/src/integrations/registry.ts`, replace the current Resideo entry (which has stale manual credential fields):

```ts
resideo: {
  brand: 'resideo',
  displayName: 'Resideo (Honeywell Home)',
  fields: [],
  oauthFlow: true,
},
```

Remove the manual `apiKey` + `accessToken` credential fields — tokens come from OAuth, not user input.

#### 1.2 OAuth Config Registry

Add an OAuth config map alongside `INTEGRATION_META` in `registry.ts`:

```ts
interface OAuthConfig {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
}

function getOAuthConfig(brand: string): OAuthConfig | null {
  switch (brand) {
    case 'resideo': {
      const clientId = process.env.RESIDEO_CONSUMER_KEY
      const clientSecret = process.env.RESIDEO_CONSUMER_SECRET
      if (!clientId || !clientSecret) return null
      return {
        authorizeUrl: 'https://api.honeywellhome.com/oauth2/authorize',
        tokenUrl: 'https://api.honeywellhome.com/oauth2/token',
        clientId,
        clientSecret,
      }
    }
    default:
      return null
  }
}
```

> **Research insight — env var validation:** The original plan used `?? ''` for missing env vars, which silently swallows misconfiguration. Returning `null` forces callers to handle the missing-config case explicitly, matching the `default: return null` branch.

#### 1.3 OAuth Routes

Add to `server/src/routes/integrations.controller.ts`:

**`GET /api/integrations/:brand/oauth/start`**

1. Look up `OAuthConfig` for the brand — if null, return 400
2. Generate a signed state parameter:
   ```ts
   const nonce = randomBytes(8).toString('hex')
   const payload = JSON.stringify({ brand, ts: Date.now(), nonce })
   const sig = createHmac('sha256', STATE_SIGNING_KEY)
     .update(payload)
     .digest('base64url')
   const state = `${Buffer.from(payload).toString('base64url')}.${sig}`
   ```
3. Build the authorization URL:
   ```
   https://api.honeywellhome.com/oauth2/authorize
     ?response_type=code
     &client_id={clientId}
     &redirect_uri=http://localhost:3001/api/integrations/resideo/oauth/callback
     &state={state}
   ```
4. Return `{ url }` — client opens this via `window.location.href`

> **Research insight — signing key:** Use `OAUTH_STATE_SECRET` env var (or generate `randomBytes(32)` at server startup), NOT the consumer secret. This provides key separation — if the signing key leaks, the consumer secret remains safe. Per RFC 9700 and security review.

> **Research insight — nonce:** Include `randomBytes(8)` in the signed payload to prevent replay of captured state tokens within the 10-minute window.

> **Research insight — `timingSafeEqual`:** Use constant-time comparison when verifying the HMAC signature to prevent timing attacks.

**`GET /api/integrations/:brand/oauth/callback`**

1. If `query.error` is present (user denied consent): redirect to client with error
2. Verify the `state` parameter: decode base64url, check HMAC signature with `timingSafeEqual`, check timestamp (< 10 min)
3. **Verify `decodedState.brand === params.brand`** — prevents cross-brand confusion
4. Extract `code` from query params — if missing, redirect with error
5. Exchange code for tokens:
   ```
   POST https://api.honeywellhome.com/oauth2/token
   Authorization: Basic base64(clientId:clientSecret)
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code={code}
   &redirect_uri={same redirect_uri}
   ```
6. Parse response: `{ access_token, refresh_token, expires_in }` (note: `expires_in` may be a string — parse to number)
7. Build session JSON: `{ accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 }`
8. Upsert integration row: `brand='resideo'`, `config='{}'`, `session={sessionJson}`, `enabled=true`, **`authError=null`**
9. Start polling for this integration
10. Redirect browser to `http://localhost:5173/integrations?oauth=success&brand=resideo`

**Callback error handling matrix:**

| Error | Action |
|---|---|
| `query.error` present (user denied) | Redirect `?oauth=error&brand=X&error=access_denied` |
| Missing `code` param | Redirect `?oauth=error&brand=X&error=missing_code` |
| Invalid/expired state | Redirect `?oauth=error&brand=X&error=invalid_state` |
| Brand mismatch in state | Redirect `?oauth=error&brand=X&error=brand_mismatch` |
| Token exchange HTTP error | Redirect `?oauth=error&brand=X&error=exchange_failed`, log details server-side |
| Token exchange `invalid_grant` | Redirect `?oauth=error&brand=X&error=code_expired` |

> **Research insight — GET that mutates:** The callback is GET (required by OAuth spec) but performs mutations (DB upsert, start polling). This is the only GET route in the codebase that mutates state. Document why in a code comment.

> **Research insight — `authError: null`:** The upsert MUST explicitly clear `authError`. Without this, re-authorization after a token expiry would succeed but the UI would still show the error.

> **Security note:** Never include raw Honeywell error details in the redirect URL — they could contain sensitive information. Log server-side, redirect with generic error codes only.

#### 1.4 Client OAuth Trigger

In `client/src/routes/integrations.tsx`, when a user clicks "Connect" on an `oauthFlow` module:

1. Call `GET /api/integrations/:brand/oauth/start` via Eden Treaty
2. Receive `{ url }`
3. `window.location.href = url` — redirect the current tab to the Honeywell login
4. After OAuth completes, the server redirects back to `/integrations?oauth=success&brand=resideo`
5. The integrations page reads the query params, shows a toast, and refetches the integration list

**Critical fix: Parameterize IntegrationForm OAuth handler.**

`client/src/components/IntegrationForm.tsx` line 334 hardcodes LG:
```ts
// CURRENT (broken for Resideo):
window.location.href = '/api/integrations/lg/oauth/start'
// text: "you'll be redirected to LG to authorize"
// button: "Authorize with LG"
```

Must be updated to use `meta.brand` and `meta.displayName`:
```ts
window.location.href = `/api/integrations/${meta.brand}/oauth/start`
// text: `you'll be redirected to ${meta.displayName} to authorize`
// button: `Authorize with ${meta.displayName}`
```

**`AvailableActions` in ModulePanel:** Currently, `oauthFlow` brands fall through to the default branch which opens an `IntegrationFormInner` dialog. With `fields: []`, this shows an empty form. The `IntegrationFormInner` already detects `meta.oauthFlow` and shows an OAuth button — so this works, but the dialog wrapper is unnecessary. Consider adding an `oauthFlow` branch to `AvailableActions` that triggers OAuth directly without opening a dialog.

> **Why not a popup?** Popup blockers are aggressive on mobile browsers. A full redirect is simpler and more reliable for a personal dashboard.

---

### Phase 2: Resideo Adapter

#### 2.1 Adapter Class

**New file:** `server/src/integrations/resideo/adapter.ts`

Follows the VeSync pattern: constructor takes `(config, session?)`, session getter for poller persistence, `withTokenRetry()` for automatic refresh.

```ts
interface ResideoSession {
  accessToken: string
  refreshToken: string
  expiresAt: number    // unix ms — when access token expires
}
```

> **Research insight — dropped `expiresIn`:** The original plan stored `expiresIn` for percentage-based refresh calculation. With the fixed 2-minute buffer approach, only `expiresAt` is needed. Simpler session shape.

**Constructor:**

```ts
readonly brand = 'resideo'
readonly displayName = 'Resideo (Honeywell Home)'
readonly discoveryMethod = 'cloud' as const

constructor(config: Record<string, string>, session?: string | null) {
  this._session = this.parseSession(session ?? null)
}
```

Config is empty for Resideo (all auth is in session). The constructor still accepts it for interface consistency.

**Required interface methods:**

- `get session(): string | null` — serializes current session for poller to persist
- `validateCredentials()` — returns `okAsync(undefined)` (no-op for OAuth brands; the integrations controller already skips validation for `oauthFlow`)
- `discover()` — see 2.2
- `getState()` — see 2.2 (delegates to same logic as discover for single device)
- `setState()` — see 2.4
- `parseSession(raw)` — validates JSON, checks required fields with `typeof` narrowing, returns null if malformed

**Token management methods:**

- `shouldRefresh()` — true if `Date.now() >= expiresAt - 120_000` (2-minute buffer)
- `ensureValidToken()` — if `shouldRefresh()`, attempt refresh (best-effort: catch errors, continue if access token not yet expired)
- `refreshToken()` — POST to token endpoint with `grant_type=refresh_token`, update `_session`
- `withTokenRetry(fn)` — try fn, on 401 refresh and retry once, on `invalid_grant` throw `TokenExpiredError`

> **Research insight — 2-minute buffer, not 50%:** Honeywell tokens expire in ~600 seconds (10 minutes). At 50%, that triggers refresh every 5 minutes — on literally every poll cycle. A fixed 2-minute buffer refreshes at the 8-minute mark, meaning roughly every other poll. This halves refresh frequency and reduces rotating-token crash risk.

> **Research insight — best-effort proactive refresh:** If `shouldRefresh()` returns true but `doRefresh()` fails with a transient error (network timeout, 500), do NOT fail the operation. The access token may still be valid (`Date.now() < expiresAt`). Log a warning and continue. Only fail when the access token is truly expired AND refresh fails.

#### 2.2 Discover

```ts
discover(): ResultAsync<DiscoveredDevice[], Error>
```

1. Ensure session is valid (refresh if needed — best-effort)
2. `GET /v2/locations?apikey={clientId}` with bearer token
3. For each location, for each device where `deviceClass === 'Thermostat'`:
   - Extract state directly from the locations response (it includes `indoorTemperature`, `indoorHumidity`, `changeableValues`, `isAlive`)
   - Map to `DiscoveredDevice`:
     - `externalId`: `{locationId}::{deviceId}` (need both for API calls)
     - `name`: `userDefinedDeviceName` (fallback to `name`)
     - `type`: `'thermostat'`
     - `state`: see state mapping below
     - `online`: `isAlive`
     - `metadata`: `{ locationId, deviceId, deviceModel, units }`

> **Research insight — 1 request instead of 1+N:** The `/v2/locations` response already includes thermostat state data. Skip the per-device `GET /v2/devices/thermostats/{id}` calls during discovery. This reduces API usage from 1+N to 1 request per cycle, making the integration safe even for accounts with many thermostats.

> **Research insight — `deviceModel` not `deviceClass`:** The `deviceClass` field just says `"Thermostat"` — it's for filtering device types, not for TCC/LCC classification. Store `deviceModel` (e.g., `"Round"`, `"D6"`, `"T5-T6"`, `"T9-T10"`) in metadata for setState payload branching.

> **Research insight — skip multi-location name prefix:** For MVP, always use `userDefinedDeviceName` without location prefix. If multi-location support is needed later, it's a trivial addition.

> **Rate limit:** Discovery runs every 15 min = 4 req/hr. State poll runs every 5 min = 12 req/hr. Total: 16 req/hr (regardless of thermostat count) vs ~240 allowed.

#### 2.3 State Mapping

**Read (API → DeviceState):**

| Resideo Field | DeviceState Field | Conversion |
|---|---|---|
| `indoorTemperature` | `temperature` | `apiToCelsius(val, units)` — F→C if Fahrenheit, pass-through if Celsius |
| `indoorHumidity` | `humidity` | Direct (0-100) |
| `changeableValues.heatSetpoint` | `targetTemperature` (when mode is heat or auto) | `apiToCelsius(val, units)` |
| `changeableValues.coolSetpoint` | `targetTemperature` (when mode is cool) | `apiToCelsius(val, units)` |
| `changeableValues.mode` | `mode` | Lowercase: `'heat'`, `'cool'`, `'auto'`, `'off'` |
| `isAlive` | `online` | Direct boolean |

**Auto mode target temp:** Use `heatSetpoint` for MVP. The ThermostatCard shows a single target stepper — dual setpoints need UI work (follow-up).

**Mode when `off`:** Show the last `heatSetpoint` as `targetTemperature` so it's ready when the user turns the thermostat on. The ThermostatCard stepper remains enabled — setting a target while off is valid (the setpoint takes effect when mode changes).

**Temperature conversion utilities:**

Place in `server/src/lib/unit-conversions.ts` alongside existing `miredToKelvin`, `kelvinToMired`:

```ts
function fToC(f: number): number {
  return Math.round(((f - 32) * 5 / 9) * 10) / 10  // one decimal place
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32)  // whole number for Fahrenheit API
}

function apiToCelsius(value: number, unit: 'Fahrenheit' | 'Celsius'): number {
  if (unit === 'Celsius') return Math.round(value * 10) / 10
  return fToC(value)
}

function celsiusToApi(celsius: number, unit: 'Fahrenheit' | 'Celsius'): number {
  if (unit === 'Celsius') return Math.round(celsius * 2) / 2  // 0.5C increments
  return cToF(celsius)
}
```

> **Research insight — `* 10 / 10`, NEVER `/ 0.1 * 0.1`:** Division by 0.1 introduces IEEE 754 artifacts. Multiplication by 10 is exact.

> **Research insight — guard against NaN:** The Honeywell API could return `null` for offline sensors. Guard conversion inputs: `if (!Number.isFinite(f)) return undefined`. Return `number | undefined` to force callers to handle absence.

> **Research insight — unit from device, not assumed:** The `units` field is per-device/location. Don't assume Fahrenheit. Read it from the API response and store in metadata.

> **Research insight — 0.5C stepper drift:** The ThermostatCard uses 0.5C steps. For F accounts, round-trip C→F→C produces up to 0.3C drift (e.g., 22.5C → 73F → 22.8C). This is cosmetically imperfect but functionally correct. Acceptable for MVP.

#### 2.4 setState

```ts
setState(externalId: string, state: Partial<DeviceState>): ResultAsync<void, Error>
```

1. Parse `externalId` → `{ locationId, deviceId }`
2. Read device metadata — **interface gap: `DeviceAdapter.setState` has no metadata parameter.** Solution: read the device row from DB in `devices.controller.ts` and pass `device.metadata` to the adapter through a new optional parameter, OR encode essential metadata in the adapter's constructor/instance. For MVP, the simplest approach: have the controller pass metadata as part of the state object via `extras`, or fetch current device state from the API (a single GET that also provides `changeableValues` for the merge).
3. Fetch current `changeableValues` from `GET /v2/devices/thermostats/{deviceId}?apikey={clientId}&locationId={locationId}` — this also provides `deviceModel` and current setpoints for the merge
4. If `state.mode` is set, capitalize: `'heat'` → `'Heat'`
5. If `state.targetTemperature` is set:
   - Convert C→API unit via `celsiusToApi(temp, units)`
   - Clamp to min/max bounds **in the API's native unit** (from the GET response)
   - Based on effective mode: set `heatSetpoint` (heat/auto) or `coolSetpoint` (cool)
   - Preserve the OTHER setpoint from the GET response (both are always required)
6. Build POST body based on `deviceModel`:

   **TCC devices (`deviceModel` is `"Round"` or `"D6"`):**
   ```json
   {
     "mode": "Heat",
     "autoChangeoverActive": false,
     "heatSetpoint": 72,
     "coolSetpoint": 78
   }
   ```
   - `autoChangeoverActive` is REQUIRED — set `true` when mode is Auto, otherwise preserve current value
   - Do NOT send `thermostatSetpointStatus` — TCC devices may reject it
   - Note: TCC "Auto" is NOT in `allowedModes` — achieved via `autoChangeoverActive: true`

   **LCC devices (`deviceModel` is `"T5-T6"`, `"T9-T10"`, or other):**
   ```json
   {
     "mode": "Heat",
     "autoChangeoverActive": true,
     "heatSetpoint": 64,
     "coolSetpoint": 82,
     "thermostatSetpointStatus": "PermanentHold"
   }
   ```
   - `thermostatSetpointStatus` is REQUIRED for manual changes
   - `autoChangeoverActive` is ALSO required — preserve current value from GET response

7. POST to `/v2/devices/thermostats/{deviceId}?apikey={clientId}&locationId={locationId}`

> **Research insight — both setpoints always required:** The Resideo API expects the full `changeableValues` object, not a partial diff. Always send `mode`, `heatSetpoint`, and `coolSetpoint`, even if only one changed. This is confirmed by homebridge-resideo source and the official docs.

> **Research insight — `autoChangeoverActive` for ALL device classes:** The original plan only sent this for TCC. Homebridge-resideo sends it for ALL device classes, preserving the current value from `changeableValues`.

> **Research insight — TCC Auto mode is special:** TCC/Round devices do NOT list `"Auto"` in `allowedModes`. Auto is achieved by setting `autoChangeoverActive: true` while `mode` remains Heat or Cool. The `heatCoolMode` field indicates which sub-mode is active.

> **Research insight — clamp in API's native unit:** Convert Celsius to the API's unit FIRST, then clamp to bounds. Clamping in Celsius-space can produce false rejections due to rounding (e.g., 9.9C → 50F is valid, but clamping to "min 10C" would reject it).

> **Research insight — GET before POST is warranted:** While the simplicity reviewer suggested using DB state instead of an extra GET, the API requires the full `changeableValues` object including fields we don't track (like `autoChangeoverActive`). The GET ensures we have all required fields. Cost: 1 extra request per user action (rare — a few times per day).

#### 2.5 Token Refresh

```ts
private refreshLock: Promise<void> | null = null

private async ensureValidToken(): Promise<void> {
  if (!this._session) throw new Error('No session — re-authorization required')

  // proactive refresh: best-effort
  if (this.shouldRefresh()) {
    try {
      await this.acquireAndRefresh()
    } catch (e) {
      // if access token is still valid, continue — retry refresh next cycle
      if (Date.now() < this._session.expiresAt) {
        console.warn('resideo: proactive refresh failed, continuing with current token', e)
        return
      }
      // access token is expired AND refresh failed — fatal
      throw e
    }
  }
}

private shouldRefresh(): boolean {
  if (!this._session) return false
  return Date.now() >= this._session.expiresAt - 120_000  // 2 minutes before expiry
}

private async acquireAndRefresh(): Promise<void> {
  if (this.refreshLock) {
    await this.refreshLock
    return
  }
  this.refreshLock = this.doRefresh()
  try {
    await this.refreshLock
  } finally {
    this.refreshLock = null
  }
}
```

The `doRefresh()` method:
1. POST to `https://api.honeywellhome.com/oauth2/token` with `grant_type=refresh_token`
2. Authorization: `Basic base64(clientId:clientSecret)`
3. Parse response, update `_session` with new tokens + expiry
4. If `invalid_grant` error: clear session, throw `TokenExpiredError`

> **Research insight — rotating refresh tokens:** Honeywell rotates refresh tokens on every refresh. The old token is invalidated immediately. The new token MUST be persisted before it can be lost. The poller already calls `persistSession()` synchronously after every adapter operation — the crash window is the duration between `doRefresh()` returning and `persistSession()` executing (effectively zero for synchronous SQLite).

> **Research insight — 15s timeout for token refresh:** Use `AbortSignal.timeout(15_000)` for token endpoint requests (vs 10s for data endpoints). A premature timeout during refresh is catastrophic: the old token is already invalidated server-side, but the new token was never received.

> **Research insight — error classification:**
> - **401**: token expired — worth one refresh + retry
> - **403**: permission denied — do NOT retry (not a token problem)
> - **400 `invalid_grant`**: refresh token dead — surface `authError`, require re-auth
> - **429**: rate limited — back off, retry next poll cycle
> - **5xx/timeout**: transient — do NOT set `authError`, retry next cycle

#### 2.6 withTokenRetry

```ts
private async withTokenRetry<T>(fn: (session: ResideoSession) => Promise<T>): Promise<T> {
  await this.ensureValidToken()
  const session = this._session!

  try {
    return await fn(session)
  } catch (err) {
    if (err instanceof TokenExpiredError) throw err

    // only retry on 401
    if (isHttpStatus(err, 401)) {
      await this.acquireAndRefresh()
      return fn(this._session!)
    }

    throw err
  }
}
```

> **Research insight — exactly 1 retry:** Universal consensus (homebridge-resideo, Nango, Auth0, Okta): try once, refresh once, retry once. More retries create loop risk.

#### 2.7 Register Adapter

In `server/src/integrations/registry.ts`:

```ts
case 'resideo':
  return ok(new ResideoAdapter(config, session))
```

---

### Phase 3: Bug Fix — Session in createAdapter

**File:** `server/src/routes/devices.controller.ts`

**Two callsites need fixing (not just one):**

**Line 48 (manual `/discover` endpoint):**
```ts
// Current:
const adapterResult = createAdapter(integration.brand, config)
// Fix:
const adapterResult = createAdapter(integration.brand, config, integration.session)
```

**Line 187 (PATCH `/:id/state`):**
```ts
// Current:
const adapterResult = createAdapter(integration.brand, config)
// Fix:
const adapterResult = createAdapter(integration.brand, config, integration.session)
```

This is a pre-existing bug. VeSync works around it because it can re-login with email/password from config. Resideo (and any future OAuth adapter) cannot — the session contains the only valid tokens.

> **Research insight — confirmed by 4 reviewers:** TypeScript reviewer, architecture strategist, pattern recognition specialist, and spec flow analyzer all independently identified the line 48 instance.

---

### Phase 4: Client — authError Display + OAuth Generalization

#### 4.1 ModulePanel Error State

The `ModulePanel` component currently has `connected`, `available`, `error`, and `connecting` states. Add handling for when `authError` is set on a connected integration:

- Add a new discriminated union variant (e.g., `state: 'auth-error'`) with props for `errorMessage`, `onReconnect`, `onRemove`
- Show amber/red StatusLED instead of green
- Display `authError` text (e.g., "Re-authorization required")
- Show "RECONNECT" + "REMOVE" actions
- "RECONNECT" triggers the same OAuth start flow as initial connect

The `integrations.tsx` page must check `integration.authError` when rendering connected modules:
```ts
const state = integration.authError ? 'auth-error' : 'connected'
```

The `authError` field IS available to the client — `stripSensitive` removes `config` and `session` but preserves `authError`.

#### 4.2 Integrations Page — OAuth Return

When the page loads with `?oauth=success&brand=resideo`:
- Show toast: "Resideo connected"
- Clear the query params from the URL via `window.history.replaceState({}, '', '/integrations')`
- Refetch the integrations list via `queryClient.invalidateQueries`

When `?oauth=error&brand=resideo`:
- Show error toast (use `error` query param for message if available)
- Clear query params

#### 4.3 IntegrationForm Generalization

Fix the hardcoded LG references in `IntegrationFormInner` (lines 319-341 of `IntegrationForm.tsx`):
- URL: `'/api/integrations/lg/oauth/start'` → `'/api/integrations/${meta.brand}/oauth/start'`
- Text: "you'll be redirected to LG to authorize" → use `meta.displayName`
- Button: "Authorize with LG" → use `meta.displayName`

---

## System-Wide Impact

### Interaction Graph

```
User clicks "Connect"
  → GET /api/integrations/resideo/oauth/start
  → Browser redirects to Honeywell login
  → Honeywell redirects to /api/integrations/resideo/oauth/callback
  → Server validates state, exchanges code for tokens
  → Integration row created (session = tokens, authError = null)
  → Cloud poller starts for resideo
  → Poller calls discover() — single GET /v2/locations (1 request)
  → Devices upserted to DB
  → SSE emits device:new / device:update events
  → Client receives thermostat data
  → ThermostatCard renders current temp, target, mode

User adjusts target temp
  → PATCH /api/devices/:id/state { targetTemperature: 21 }
  → createAdapter('resideo', config, session)
  → adapter.setState() → GET changeableValues → C→F conversion → POST to Honeywell API
  → Optimistic state update in DB + SSE
  → Next poll confirms actual state
```

### Error Propagation

- **Token near expiry during poll:** adapter refreshes proactively at 2-min buffer → transparent to poller
- **Proactive refresh fails, token still valid:** adapter logs warning, continues with current token → transparent
- **Refresh token invalid (`invalid_grant`):** adapter throws `TokenExpiredError` → poller sets `authError` → UI shows "Reconnect"
- **Rate limited (429):** adapter returns err → poller logs warning, retries next cycle (5 min)
- **Network error / 5xx:** adapter returns err → poller retries next cycle, does NOT set `authError`
- **setState fails (401):** `withTokenRetry` refreshes and retries once → if still fails, returns error to UI

> **Research insight — distinguish auth from transient errors:** The poller currently sets `authError` for ANY discovery failure. A network timeout would incorrectly trigger "Reconnect" in the UI. The adapter should throw `TokenExpiredError` only for auth failures. The poller should only set `authError` when the error message indicates an auth issue (e.g., check for a specific error prefix or error class).

### State Lifecycle Risks

- **Rotating refresh token lost on crash:** If the server crashes between token refresh and DB persist, the old refresh token is already invalidated. User must re-authorize. Mitigation: the poller persists session immediately after each adapter operation via synchronous SQLite write. The crash window is the duration of the API call between refresh and persist completion.
- **Concurrent refresh race:** Handled by `refreshLock` promise mutex in the adapter. Two parallel callers within the same adapter instance share the same refresh result. Different adapter instances (from overlapping poll timers) could still race — acceptable for MVP given the small window and re-auth as fallback.
- **Optimistic state divergence:** setState immediately persists the new state. If Honeywell rejects it (out-of-range temp), the wrong state shows for up to 5 min until the next poll corrects it. Acceptable for MVP.

---

## Acceptance Criteria

### Functional Requirements

- [ ] OAuth flow: clicking "Connect" redirects to Honeywell login, callback creates integration
- [ ] Thermostats discovered and shown in dashboard with current temperature, humidity, target temp, mode
- [ ] Target temperature adjustment works (stepper in ThermostatCard)
- [ ] Mode switching works (heat/cool/auto/off)
- [ ] Token refresh happens transparently — no user intervention
- [ ] authError shown on ModulePanel when refresh token expires, with "Reconnect" action
- [ ] Re-authorization clears authError and resumes polling
- [ ] Temperature displayed in Celsius regardless of Honeywell account settings
- [ ] IntegrationForm OAuth handler works for both Resideo and LG (generalized)

### Non-Functional Requirements

- [ ] Poll interval respects 5-minute minimum (rate limit)
- [ ] No consumer key/secret leaked to client (stays in .env + server-side only)
- [ ] `bun run system:check --force` passes after every phase
- [ ] No `as any` casts
- [ ] Route-level validation: `targetTemperature` has min/max bounds, `mode` is enum-constrained

### Quality Gates

- [ ] Test OAuth flow end-to-end with real Honeywell account
- [ ] Test token refresh by waiting for expiry (~10 min)
- [ ] Test setState with real thermostat
- [ ] Test authError display by invalidating refresh token
- [ ] Test callback error handling (cancel mid-flow, invalid state)

---

## Dependencies & Prerequisites

- **Honeywell Home developer account** — created, app registered as "Jarvis"
- **Consumer Key + Secret** — stored in `.env` (RESIDEO_CONSUMER_KEY, RESIDEO_CONSUMER_SECRET)
- **`OAUTH_STATE_SECRET`** — add to `.env` (or auto-generate at startup with `randomBytes(32)`)
- **Callback URL** — registered as `http://localhost:3001/api/integrations/resideo/oauth/callback`
- **Physical thermostat** — required for testing (no sandbox)
- No new npm dependencies needed — uses native `fetch`, `crypto`, `neverthrow` (existing)

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Refresh token lost on crash | Low | High (requires re-auth) | Persist session immediately after adapter operation; crash window is < 1ms for sync SQLite write |
| Rate limit exceeded | Very Low | Medium (polling stops temporarily) | 16 req/hr (1 per cycle, not 1+N) vs ~240 allowed |
| Device model detection wrong | Low | Medium (setState may fail) | Branch on `deviceModel` field (authoritative), store in metadata, test with real device |
| OAuth redirect fails from LAN devices | Medium | Low (dev-only limitation) | Document as known limitation; consider client-side localhost guard |
| Honeywell API changes | Low | High | Pin to v2 API; homebridge-resideo is a canary for API changes |
| Concurrent poll timers race on refresh | Low | Medium (one refresh fails) | Promise-based lock within instance; re-auth as fallback for cross-instance race |
| Proactive refresh masks transient errors | Low | Low | Best-effort: log warnings, only fail when token truly expired |

---

## Implementation Order

1. **Phase 3 (bug fix)** — two-line fix at lines 48 and 187, unblocks all session-based adapters
2. **Phase 1 (OAuth infra)** — generalized routes, state signing, token exchange
3. **Phase 2 (adapter)** — core integration: discover, setState, token refresh
4. **Phase 4 (client polish)** — authError display, OAuth return handling, IntegrationForm generalization

Phase 3 is a standalone fix. Phases 1 and 2 are tightly coupled (can't test the adapter without OAuth). Phase 4 can be done last since the integration works without it (just less polished error UX).

---

## Deferred to Follow-up

- **Dual setpoint UI for auto mode** — two target controls (heat-to / cool-to) with deadband visualization
- **Fan control** — Auto/On/Circulate toggle bank in ThermostatCard + separate API endpoint
- **Schedule/hold types** — temporary hold, hold-until, follow-schedule options
- **Emergency heat mode** — `emheat` option for heat pump systems
- **Humidity control** — `targetHumidity` for whole-home humidifier systems
- **Configurable redirect URI** — for LAN access from non-localhost devices
- **F/C toggle** — let user choose display unit (currently always Celsius)
- **Stepper alignment to F values** — snap 0.5C steps to F-aligned values for F accounts to avoid cosmetic drift
- **Dedicated `getState()` per device** — more efficient than calling `discover()` for state polls (currently both call discover)
- **Module-level refresh lock** — shared across adapter instances to prevent cross-instance refresh races

---

## Sources & References

### Internal References

- Adapter pattern: `server/src/integrations/vesync/adapter.ts` — session management reference
- Registry: `server/src/integrations/registry.ts` — IntegrationMeta + createAdapter factory
- Cloud poller: `server/src/discovery/cloud-poller.ts` — polling lifecycle, session persistence
- Devices controller: `server/src/routes/devices.controller.ts` — session bug (lines 48, 187)
- ThermostatCard: `client/src/components/device-cards/ThermostatCard.tsx` — existing UI
- ModulePanel: `client/src/components/ModulePanel.tsx` — integration display
- IntegrationForm: `client/src/components/IntegrationForm.tsx` — OAuth trigger (line 334, hardcoded LG)
- Unit conversions: `server/src/lib/unit-conversions.ts` — temperature helpers go here
- Temperature utilities: `server/src/lib/temperature.ts` — F/C conversion + clamping (created during research)

### External References

- [RFC 9700 — OAuth 2.0 Security Best Current Practice (Jan 2025)](https://datatracker.ietf.org/doc/rfc9700/)
- [Resideo Developer Portal](https://developer.honeywellhome.com/)
- [OAuth2 Guide](https://developer.honeywellhome.com/content/oauth2-guide)
- [Thermostat API Methods](https://developer.honeywellhome.com/api-methods)
- [T-Series Thermostat Guide](https://developer.honeywellhome.com/content/t-series-thermostat-guide)
- [homebridge-resideo (TypeScript reference)](https://github.com/homebridge-plugins/homebridge-resideo) — battle-tested community implementation
- [Rate Limit FAQ](https://developer.honeywellhome.com/faqs/what-rate-limit-api)
- [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)

---

## Design Defaults

These are implementation decisions, not user-facing features:

- **OAuth state signing:** HMAC-SHA256 with `OAUTH_STATE_SECRET`, 10-minute expiry, includes random nonce, verified with `timingSafeEqual`
- **Token refresh:** proactive at 2 minutes before expiry (fixed buffer), reactive on 401 with single retry. Best-effort: proactive failure does not block operations if access token still valid
- **Refresh mutex:** promise-based lock per adapter instance prevents concurrent refresh within a single instance
- **Temperature precision:** 1 decimal place Celsius internally, whole-number F for Fahrenheit API, 0.5C for Celsius API
- **Temperature clamping:** always in API's native unit space, never Celsius-space
- **Device model detection:** branch on `deviceModel` field (not `deviceID` prefix) — `"Round"`/`"D6"` = TCC, default = LCC
- **Auto mode target:** surface `heatSetpoint` as the single `targetTemperature`
- **Hold type:** `PermanentHold` on LCC manual changes / no hold field for TCC
- **externalId format:** `{locationId}::{deviceId}` — both needed for API calls
- **Network timeout:** 10s for data endpoints, 15s for token endpoint (`AbortSignal.timeout`)
- **API requests:** `Authorization: Bearer {token}` header + `apikey={clientId}` **query parameter** (both required)
- **POST body:** always include `mode`, `heatSetpoint`, `coolSetpoint`, and `autoChangeoverActive` — API expects full `changeableValues`
- **Error distinction:** `TokenExpiredError` for auth failures only; transient errors (network, 5xx) do not trigger `authError`
