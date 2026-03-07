import Bonjour from 'bonjour-hap'
import { ResultAsync, ok } from 'neverthrow'
import * as dgram from 'node:dgram'

import { discoverHueBridges } from '../integrations/hue/adapter'
import { toErrorMessage } from '../lib/error-utils'
import { log } from '../lib/logger'

export interface DetectedDevice {
	brand: string
	label: string
	/** Keys match the IntegrationMeta.fields[].key names — used to prefill the connect form */
	details: Record<string, string>
	via: 'upnp' | 'mdns' | 'udp'
}

export interface ScanCallbacks {
	onDevice: (device: DetectedDevice) => void
	onBrandComplete: (brand: string, count: number, error?: string) => void
}

// ─── Philips Hue — cloud N-UPnP + local mDNS in parallel ────────────────────

function scanHueCloud(): ResultAsync<DetectedDevice[], Error> {
	return ResultAsync.fromPromise(
		discoverHueBridges().then((result) =>
			result.match(
				(bridges) =>
					bridges.map((b) => ({
						brand: 'hue',
						label: `Philips Hue bridge at ${b.internalipaddress}`,
						details: { bridgeIp: b.internalipaddress },
						via: 'upnp' as const,
					})),
				() => [],
			),
		),
		(e) => new Error(`Hue cloud discovery failed: ${toErrorMessage(e)}`),
	)
}

function scanHueMdns(timeoutMs = 3000): ResultAsync<DetectedDevice[], Error> {
	return ResultAsync.fromPromise(
		new Promise<DetectedDevice[]>((resolve) => {
			const found: DetectedDevice[] = []
			const seen = new Set<string>()
			const instance = new Bonjour()
			const browser = instance.find({ type: 'hue' })

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
					instance.destroy()
				} catch { /* cleanup */ }
				resolve(found)
			}, timeoutMs)
		}),
		(e) => new Error(`Hue mDNS scan failed: ${toErrorMessage(e)}`),
	)
}

function scanHue(): ResultAsync<DetectedDevice[], Error> {
	return ResultAsync.fromPromise(
		Promise.all([
			scanHueCloud().unwrapOr([]),
			scanHueMdns().unwrapOr([]),
		]).then(([cloud, mdns]) => {
			const seen = new Set<string>()
			return [...cloud, ...mdns].filter((d) => {
				const ip = d.details.bridgeIp
				if (!ip || seen.has(ip)) return false
				seen.add(ip)
				return true
			})
		}),
		(e) => new Error(`Hue scan failed: ${toErrorMessage(e)}`),
	)
}

// ─── Govee via UDP LAN API ────────────────────────────────────────────────────

interface GoveeResponseData {
	ip: string
	device: string
	sku: string
}

function scanGovee(timeoutMs = 3000): ResultAsync<DetectedDevice[], Error> {
	return ResultAsync.fromPromise(
		new Promise<DetectedDevice[]>((resolve) => {
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
				} catch { /* malformed UDP packet */ }
			})

			socket.on('error', (e) => {
				log.error('scanGovee socket error', { error: e.message })
				try { socket.close() } catch { /* already closed */ }
				resolve(found)
			})

			socket.bind(4002, () => {
				try {
					// eslint-disable-next-line sonarjs/no-hardcoded-ip -- multicast address (protocol constant)
					socket.addMembership('239.255.255.250')
				} catch { /* multicast may not be available */ }

				const payload = Buffer.from(
					JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }),
				)
				// eslint-disable-next-line sonarjs/no-hardcoded-ip -- multicast address (protocol constant)
				socket.send(payload, 4003, '239.255.255.250', (err) => {
					if (err) {
						try { socket.close() } catch { /* ignore */ }
						resolve(found)
					}
				})
			})

			setTimeout(() => {
				try { socket.close() } catch { /* ignore */ }
				resolve(found)
			}, timeoutMs)
		}),
		(e) => new Error(`Govee scan failed: ${toErrorMessage(e)}`),
	)
}

// ─── Generic mDNS scan ──────────────────────────────────────────────────────

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
): ResultAsync<DetectedDevice[], Error> {
	return ResultAsync.fromPromise(
		new Promise<DetectedDevice[]>((resolve) => {
			const found: DetectedDevice[] = []
			const instance = new Bonjour()
			const browser = instance.find({ type: serviceType, protocol })

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
					instance.destroy()
				} catch { /* cleanup */ }
				resolve(found)
			}, timeoutMs)
		}),
		(e) => new Error(`${brand} mDNS scan failed: ${toErrorMessage(e)}`),
	)
}

// ─── Brand registry ──────────────────────────────────────────────────────────

type BrandScanner = () => ResultAsync<DetectedDevice[], Error>

const BRAND_SCANNERS: Record<string, BrandScanner> = {
	hue: () => scanHue(),
	govee: () => scanGovee(),
	aqara: () => scanMdns('miio', 'aqara', 'Aqara Hub', 'ip', 3000, 'udp'),
	elgato: () => scanMdns('elg', 'elgato', 'Elgato Key Light', 'ip', 5000),
}

export const SCANNABLE_BRANDS = Object.keys(BRAND_SCANNERS)

// ─── Streaming scan ──────────────────────────────────────────────────────────

export async function runStreamingScan(
	callbacks: ScanCallbacks,
	brands?: string[],
): Promise<DetectedDevice[]> {
	const targetBrands = brands?.filter((b) => b in BRAND_SCANNERS) ?? SCANNABLE_BRANDS
	const allDevices: DetectedDevice[] = []

	await Promise.all(
		targetBrands.map(async (brand) => {
			const scanner = BRAND_SCANNERS[brand]
			if (!scanner) return

			const result = await scanner()
				.orElse((e) => {
					log.error('scan failed', { brand, error: e.message })
					callbacks.onBrandComplete(brand, 0, e.message)
					return ok([])
				})

			const devices = result.isOk() ? result.value : []
			for (const device of devices) {
				callbacks.onDevice(device)
				allDevices.push(device)
			}
			// only emit brand complete if we didn't already (from error path)
			if (result.isOk()) {
				callbacks.onBrandComplete(brand, devices.length)
			}
		}),
	)

	return allDevices
}

// ─── Backward-compatible wrapper ─────────────────────────────────────────────

export async function runLocalScan(): Promise<DetectedDevice[]> {
	return runStreamingScan({ onDevice: () => {}, onBrandComplete: () => {} })
}
