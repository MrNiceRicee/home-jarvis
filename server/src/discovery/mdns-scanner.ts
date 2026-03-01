/**
 * mDNS scanner using @homebridge/ciao (already bundled with hap-nodejs).
 * Looks for Philips Hue bridges advertising _hue._tcp on the local network.
 */

import { getResponder, Protocol } from '@homebridge/ciao'

export interface MdnsDevice {
  brand: string
  name: string
  host: string
  port: number
  ip?: string
}

export async function scanForHueBridges(timeoutMs = 5000): Promise<MdnsDevice[]> {
  const found: MdnsDevice[] = []

  return new Promise((resolve) => {
    // @homebridge/ciao exposes a responder; we use its underlying mDNS stack for browsing
    // Since ciao is primarily a responder library, we fall back to N-UPnP for Hue discovery.
    // mDNS browsing is used via the bonjour-hap package (already installed as dep of hap-nodejs).
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bonjour = require('bonjour-hap')()
      const browser = bonjour.find({ type: 'hue' })

      browser.on('up', (service: { name: string; host: string; port: number; addresses?: string[] }) => {
        found.push({
          brand: 'hue',
          name: service.name,
          host: service.host,
          port: service.port,
          ip: service.addresses?.[0],
        })
      })

      setTimeout(() => {
        browser.stop()
        bonjour.destroy()
        resolve(found)
      }, timeoutMs)
    } catch {
      // bonjour-hap not available — fall through to N-UPnP discovery
      resolve([])
    }
  })
}
