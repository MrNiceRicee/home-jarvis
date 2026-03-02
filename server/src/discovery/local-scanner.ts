import * as dgram from 'node:dgram'

import { discoverHueBridges } from '../integrations/hue/adapter'

export interface DetectedDevice {
	brand: string
	label: string
	/** Keys match the IntegrationMeta.fields[].key names — used to prefill the connect form */
	details: Record<string, string>
	via: 'upnp' | 'mdns' | 'udp'
}

// ─── Philips Hue — cloud N-UPnP + local mDNS in parallel ────────────────────
// Cloud discovery (discovery.meethue.com) is unreliable; mDNS is the local fallback.
// Both run concurrently and results are merged by IP to avoid duplicates.

async function scanHueCloud(): Promise<DetectedDevice[]> {
	const result = await discoverHueBridges()
	return result.match(
		(bridges) =>
			bridges.map((b) => ({
				brand: 'hue',
				label: `Philips Hue bridge at ${b.internalipaddress}`,
				details: { bridgeIp: b.internalipaddress },
				via: 'upnp' as const,
			})),
		() => [],
	)
}

async function scanHueMdns(timeoutMs = 3000): Promise<DetectedDevice[]> {
	return new Promise((resolve) => {
		const found: DetectedDevice[] = []
		const seen = new Set<string>()
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const bonjour = require('bonjour-hap')()
			// Hue bridges advertise on _hue._tcp (v2+)
			const browser = bonjour.find({ type: 'hue' })

			browser.on('up', (service: { name: string; addresses?: string[]; host: string }) => {
				const ip = service.addresses?.[0] ?? service.host
				if (!seen.has(ip)) {
					seen.add(ip)
					found.push({
						brand: 'hue',
						label: `Philips Hue bridge at ${ip}`,
						details: { bridgeIp: ip },
						via: 'mdns',
					})
				}
			})

			setTimeout(() => {
				try {
					browser.stop()
					bonjour.destroy()
				} catch { /* ignore */ }
				resolve(found)
			}, timeoutMs)
		} catch {
			resolve([])
		}
	})
}

async function scanHue(): Promise<DetectedDevice[]> {
	const [cloud, mdns] = await Promise.all([scanHueCloud(), scanHueMdns()])
	// Merge, deduplicate by bridgeIp
	const seen = new Set<string>()
	return [...cloud, ...mdns].filter((d) => {
		const ip = d.details.bridgeIp
		if (!ip || seen.has(ip)) return false
		seen.add(ip)
		return true
	})
}

// ─── Govee via UDP LAN API ────────────────────────────────────────────────────
// Requires "LAN Control" to be enabled in the Govee mobile app (Settings → Device → LAN Control)

interface GoveeResponseData {
	ip: string
	device: string
	sku: string
}

function scanGovee(timeoutMs = 3000): Promise<DetectedDevice[]> {
	return new Promise((resolve) => {
		const found: DetectedDevice[] = []
		const seen = new Set<string>()

		const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

		socket.on('message', (msg) => {
			try {
				const parsed = JSON.parse(msg.toString()) as { msg?: { data?: GoveeResponseData } }
				const device = parsed?.msg?.data
				if (device?.ip && device?.sku && !seen.has(device.ip)) {
					seen.add(device.ip)
					found.push({
						brand: 'govee',
						label: `Govee ${device.sku} at ${device.ip}`,
						details: { ip: device.ip, sku: device.sku },
						via: 'udp',
					})
				}
			} catch {
				/* malformed UDP packet — skip */
			}
		})

		socket.on('error', () => {
			try {
				socket.close()
			} catch {
				/* already closed */
			}
			resolve(found)
		})

		socket.bind(4002, () => {
			try {
				// eslint-disable-next-line sonarjs/no-hardcoded-ip -- mDNS multicast address (protocol constant)
				socket.addMembership('239.255.255.250')
			} catch {
				/* multicast may not be available */
			}

			const payload = Buffer.from(
				JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }),
			)
			// eslint-disable-next-line sonarjs/no-hardcoded-ip -- mDNS multicast address (protocol constant)
			socket.send(payload, 4003, '239.255.255.250', (err) => {
				if (err) {
					try {
						socket.close()
					} catch {
						/* ignore */
					}
					resolve(found)
				}
			})
		})

		setTimeout(() => {
			try {
				socket.close()
			} catch {
				/* ignore */
			}
			resolve(found)
		}, timeoutMs)
	})
}

// ─── mDNS scan ────────────────────────────────────────────────────────────────

interface BonjourService {
	name: string
	host: string
	port: number
	addresses?: string[]
}

function scanMdns(
	serviceType: string,
	brand: string,
	displayName: string,
	detailsKey: string,
	timeoutMs = 3000,
	protocol: 'tcp' | 'udp' = 'tcp',
): Promise<DetectedDevice[]> {
	return new Promise((resolve) => {
		const found: DetectedDevice[] = []
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const bonjour = require('bonjour-hap')()
			const browser = bonjour.find({ type: serviceType, protocol })

			browser.on('up', (service: BonjourService) => {
				const ip = service.addresses?.[0] ?? service.host
				found.push({
					brand,
					label: `${displayName}: ${service.name} (${ip})`,
					details: { [detailsKey]: ip, host: service.host },
					via: 'mdns',
				})
			})

			setTimeout(() => {
				try {
					browser.stop()
					bonjour.destroy()
				} catch {
					/* ignore */
				}
				resolve(found)
			}, timeoutMs)
		} catch {
			resolve([])
		}
	})
}

// ─── Unified scan ─────────────────────────────────────────────────────────────

export async function runLocalScan(): Promise<DetectedDevice[]> {
	const results = await Promise.allSettled([
		scanHue(),
		scanGovee(),
		scanMdns('miio', 'aqara', 'Aqara Hub', 'ip', 3000, 'udp'),
		scanMdns('elg', 'elgato', 'Elgato Key Light', 'ip', 5000),
	])

	return results
		.filter((r): r is PromiseFulfilledResult<DetectedDevice[]> => r.status === 'fulfilled')
		.flatMap((r) => r.value)
}
