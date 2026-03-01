import type { Accessory } from '@homebridge/hap-nodejs'
import type { DeviceAdapter, DiscoveredDevice, DeviceState } from '../types'
import type { Device } from '../../db/schema'

interface HueBridgeInfo {
  id: string
  internalipaddress: string
}

interface HueLight {
  uniqueid: string
  name: string
  type: string
  state: {
    on: boolean
    bri?: number      // 1–254
    ct?: number       // Mired color temp
    hue?: number
    sat?: number
    reachable: boolean
  }
}

export class HueAdapter implements DeviceAdapter {
  readonly brand = 'hue'
  readonly displayName = 'Philips Hue'
  readonly discoveryMethod = 'local' as const

  private bridgeIp: string
  private apiKey: string

  constructor(config: Record<string, string>) {
    this.bridgeIp = config.bridgeIp ?? ''
    this.apiKey = config.apiKey ?? ''
  }

  get baseUrl() {
    return `http://${this.bridgeIp}/api/${this.apiKey}`
  }

  async validateCredentials(config: Record<string, string>): Promise<void> {
    const ip = config.bridgeIp
    const key = config.apiKey
    if (!ip) throw new Error('Bridge IP is required')
    if (!key) throw new Error('API key is required — press the button on the bridge first')

    const res = await fetch(`http://${ip}/api/${key}/config`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Bridge returned ${res.status}`)
    const data = await res.json() as { name?: string; error?: { description: string } }
    if ('error' in data || (Array.isArray(data) && data[0]?.error)) {
      throw new Error(data.error?.description ?? 'Invalid API key')
    }
  }

  async discover(): Promise<DiscoveredDevice[]> {
    const res = await fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Hue bridge error: ${res.status}`)
    const lights = await res.json() as Record<string, HueLight>

    return Object.entries(lights).map(([id, light]) => ({
      externalId: light.uniqueid || id,
      name: light.name,
      type: 'light' as const,
      state: this.parseState(light.state),
      online: light.state.reachable,
    }))
  }

  async getState(externalId: string): Promise<DeviceState> {
    // Find light by uniqueid
    const res = await fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(5000) })
    const lights = await res.json() as Record<string, HueLight>
    const entry = Object.values(lights).find(l => l.uniqueid === externalId)
    if (!entry) throw new Error(`Light ${externalId} not found`)
    return this.parseState(entry.state)
  }

  async setState(externalId: string, state: Partial<DeviceState>): Promise<void> {
    // Find the numeric light ID
    const res = await fetch(`${this.baseUrl}/lights`, { signal: AbortSignal.timeout(5000) })
    const lights = await res.json() as Record<string, HueLight>
    const entry = Object.entries(lights).find(([, l]) => l.uniqueid === externalId)
    if (!entry) throw new Error(`Light ${externalId} not found`)
    const [lightId] = entry

    const body: Record<string, unknown> = {}
    if (state.on !== undefined) body.on = state.on
    if (state.brightness !== undefined) body.bri = Math.round((state.brightness / 100) * 253 + 1)
    if (state.colorTemp !== undefined) {
      // Convert Kelvin to mired: mired = 1,000,000 / K
      body.ct = Math.round(1_000_000 / state.colorTemp)
    }
    if (state.color) {
      // Convert RGB to XY (CIE color space) — simplified
      const { r, g, b } = state.color
      const R = r / 255, G = g / 255, B = b / 255
      const X = R * 0.664511 + G * 0.154324 + B * 0.162028
      const Y = R * 0.283881 + G * 0.668433 + B * 0.047685
      const Z = R * 0.000088 + G * 0.072310 + B * 0.986039
      const sum = X + Y + Z
      body.xy = sum > 0 ? [X / sum, Y / sum] : [0.3127, 0.3290]
    }

    await fetch(`${this.baseUrl}/lights/${lightId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
  }

  // Not implementing HomeKit bridging here — handled in accessory-factory.ts in Phase 5
  toHomeKitAccessory(_device: Device): Accessory | null {
    return null // Phase 5
  }

  private parseState(s: HueLight['state']): DeviceState {
    return {
      on: s.on,
      brightness: s.bri !== undefined ? Math.round(((s.bri - 1) / 253) * 100) : undefined,
      colorTemp: s.ct !== undefined ? Math.round(1_000_000 / s.ct) : undefined,
    }
  }
}

/** N-UPnP discovery — returns list of Hue bridges on the local network */
export async function discoverHueBridges(): Promise<HueBridgeInfo[]> {
  const res = await fetch('https://discovery.meethue.com/', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return []
  return res.json() as Promise<HueBridgeInfo[]>
}

/** Create an API key by POST-ing to the bridge (user must press the button first) */
export async function createHueApiKey(bridgeIp: string): Promise<string> {
  const res = await fetch(`http://${bridgeIp}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ devicetype: 'home-jarvis#server' }),
    signal: AbortSignal.timeout(10_000),
  })
  const data = await res.json() as Array<{ success?: { username: string }; error?: { description: string } }>
  if (!Array.isArray(data) || !data[0]) throw new Error('Unexpected response from bridge')
  if (data[0].error) throw new Error(data[0].error.description)
  if (!data[0].success?.username) throw new Error('No username in response')
  return data[0].success.username
}
