import '@matter/nodejs' // platform bindings — must be first import
import { Environment, StorageService, VendorId } from '@matter/main'
import { AggregatorEndpoint } from '@matter/main/endpoints/aggregator'
import { Endpoint, ServerNode } from '@matter/main/node'
import { eq } from 'drizzle-orm'
import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import type { DB } from '../db'
import type { Device } from '../db/schema'
import type { DeviceState } from '../integrations/types'

import { devices } from '../db/schema'
import { eventBus } from '../lib/events'
import { log } from '../lib/logger'
import { parseJson } from '../lib/parse-json'
import { createMatterEndpoint } from './device-factory'

// ─── Types ──────────────────────────────────────────────────────────────────

type BridgeStatus = 'stopped' | 'starting' | 'running' | 'error'

type InboundCommandHandler = (deviceId: string, state: Partial<DeviceState>) => void

// ─── Helpers ────────────────────────────────────────────────────────────────

// 0-254 matter level → 0-100 brightness
function fromMatterLevel(level: number): number {
	return Math.round(Math.min(254, Math.max(0, level)) / 2.54)
}

// mired → kelvin
function miredToKelvin(mired: number): number {
	return Math.round(1_000_000 / mired)
}

// 0-100 brightness → 0-254 matter level
function toMatterLevel(brightness: number): number {
	return Math.round(Math.min(100, Math.max(0, brightness)) * 2.54)
}

// kelvin → mired
function kelvinToMired(kelvin: number): number {
	return Math.round(1_000_000 / kelvin)
}

// clamp fan speed to 0-100
function clampPercent(value: number): number {
	return Math.round(Math.min(100, Math.max(0, value)))
}

// celsius → matter fixed-point (celsius * 100)
function toMatterTemp(celsius: number): number {
	return Math.round(celsius * 100)
}

// ─── Storage setup ──────────────────────────────────────────────────────────

const STORAGE_DIR = path.resolve(process.cwd(), 'data/matter-storage')

function ensureStorageDir() {
	mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 })
	// explicit chmod in case the dir already existed with looser perms
	chmodSync(STORAGE_DIR, 0o700)
}

function configureStorage() {
	const env = Environment.default
	const storage = env.get(StorageService)
	storage.location = STORAGE_DIR
}

// ─── MatterBridge ───────────────────────────────────────────────────────────

class MatterBridge {
	status: BridgeStatus = 'stopped'
	pairingQrCode: string | null = null
	paired = false
	port = 5540

	private node: ServerNode | null = null
	private aggregator: Endpoint | null = null
	private endpoints = new Map<string, Endpoint>()
	private db: DB | null = null
	private onInboundCommand: InboundCommandHandler | null = null

	get deviceCount(): number {
		return this.endpoints.size
	}

	// ── Status accessors (for the controller) ─────────────────────────────

	getStatus() {
		return {
			status: this.status,
			paired: this.paired,
			deviceCount: this.deviceCount,
			port: this.port,
		}
	}

	getQrPairingCode(): string | null {
		return this.pairingQrCode
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────

	async start(db: DB) {
		if (this.status === 'running' || this.status === 'starting') {
			log.warn('matter bridge already running or starting')
			return
		}

		this.status = 'starting'
		this.db = db

		try {
			ensureStorageDir()
			configureStorage()

			this.node = await ServerNode.create({
				id: 'jarvis-bridge',
				network: { port: this.port },
				commissioning: {
					passcode: 20202021,
					discriminator: 3840,
				},
				productDescription: {
					name: 'Jarvis Matter Bridge',
					deviceType: AggregatorEndpoint.deviceType,
				},
				basicInformation: {
					vendorName: 'home-jarvis',
					productName: 'Jarvis Matter Bridge',
					vendorId: VendorId(0xfff1),
					productId: 0x8000,
				},
			})

			this.aggregator = new Endpoint(AggregatorEndpoint, { id: 'aggregator' })
			await this.node.add(this.aggregator)

			// start node before adding devices — the aggregator supports dynamic add
			await this.node.start()

			// pairing info
			this.paired = this.node.lifecycle.isCommissioned
			if (!this.paired) {
				const codes = this.node.state.commissioning.pairingCodes
				this.pairingQrCode = codes.qrPairingCode
				log.info('matter bridge awaiting pairing', { qr: this.pairingQrCode })
			} else {
				log.info('matter bridge already paired')
			}

			// lifecycle hooks
			this.node.lifecycle.commissioned.on(() => {
				this.paired = true
				log.info('matter bridge commissioned')
			})

			// load all matter-enabled devices
			await this.loadDevices()

			this.status = 'running'
			log.info('matter bridge started', { port: this.port, devices: this.deviceCount })
		} catch (error) {
			this.status = 'error'
			log.error('matter bridge failed to start', {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	async stop() {
		if (this.status === 'stopped') return

		log.info('matter bridge stopping', { devices: this.deviceCount })

		try {
			// close all endpoints first
			for (const [id, endpoint] of this.endpoints) {
				try {
					await endpoint.close()
				} catch (error) {
					log.warn('matter bridge endpoint close failed', {
						deviceId: id,
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}
			this.endpoints.clear()

			if (this.node) {
				await this.node.close()
				this.node = null
				this.aggregator = null
			}

			this.status = 'stopped'
			this.pairingQrCode = null
			log.info('matter bridge stopped')
		} catch (error) {
			this.status = 'error'
			log.error('matter bridge stop failed', {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// ── Device management ─────────────────────────────────────────────────

	async addDevice(device: Device, state: DeviceState) {
		if (!this.aggregator) {
			log.warn('matter bridge not running, cannot add device', { deviceId: device.id })
			return
		}

		if (this.endpoints.has(device.id)) {
			log.debug('matter device already exposed', { deviceId: device.id })
			return
		}

		const result = createMatterEndpoint(device, state)
		if (result.isErr()) {
			log.warn('matter endpoint creation failed', {
				deviceId: device.id,
				type: device.type,
				error: result.error.message,
			})
			return
		}

		const endpoint = result.value

		try {
			await this.aggregator.add(endpoint)
			this.endpoints.set(device.id, endpoint)
			this.setupInboundHandlers(device.id, endpoint)

			log.info('matter device added', { deviceId: device.id, name: device.name, type: device.type })
		} catch (error) {
			log.error('matter device add failed', {
				deviceId: device.id,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	async removeDevice(deviceId: string) {
		const endpoint = this.endpoints.get(deviceId)
		if (!endpoint) return

		try {
			await endpoint.close()
			this.endpoints.delete(deviceId)
			log.info('matter device removed', { deviceId })
		} catch (error) {
			log.error('matter device remove failed', {
				deviceId,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// ── State sync (outbound: our state → matter) ─────────────────────────

	async updateDeviceState(deviceId: string, state: Partial<DeviceState>) {
		const endpoint = this.endpoints.get(deviceId)
		if (!endpoint) return

		try {
			// use setStateOf(string, values) for each cluster — works on untyped endpoints
			if (state.on !== undefined) {
				await endpoint.setStateOf('onOff', { onOff: state.on })
			}

			if (state.brightness !== undefined) {
				await endpoint.setStateOf('levelControl', { currentLevel: toMatterLevel(state.brightness) })
			}

			if (state.colorTemp !== undefined) {
				await endpoint.setStateOf('colorControl', { colorTemperatureMireds: kelvinToMired(state.colorTemp) })
			}

			if (state.fanSpeed !== undefined) {
				await endpoint.setStateOf('fanControl', {
					percentSetting: clampPercent(state.fanSpeed),
					percentCurrent: clampPercent(state.fanSpeed),
				})
			}

			if (state.temperature !== undefined || state.targetTemperature !== undefined) {
				const thermostatPatch: Record<string, unknown> = {}
				if (state.temperature !== undefined) {
					thermostatPatch.localTemperature = toMatterTemp(state.temperature)
				}
				if (state.targetTemperature !== undefined) {
					thermostatPatch.occupiedHeatingSetpoint = toMatterTemp(state.targetTemperature)
					thermostatPatch.occupiedCoolingSetpoint = toMatterTemp(state.targetTemperature)
				}
				await endpoint.setStateOf('thermostat', thermostatPatch)
			}
		} catch (error) {
			log.error('matter state push failed', {
				deviceId,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// ── Inbound commands (matter → our devices) ───────────────────────────

	onCommand(handler: InboundCommandHandler) {
		this.onInboundCommand = handler
	}

	setupInboundHandlers(deviceId: string, endpoint: Endpoint) {
		// subscribe to cluster events using the string-based eventsOf() API
		// so we don't need the concrete endpoint type at compile time

		// onOff cluster
		const onOffEvents = endpoint.maybeStateOf('onOff')
		if (onOffEvents) {
			const events = endpoint.eventsOf('onOff')
			events.onOff$Changed?.on((value: unknown) => {
				if (typeof value !== 'boolean') return
				log.debug('matter inbound: onOff', { deviceId, value })
				this.handleInboundCommand(deviceId, { on: value })
			})
		}

		// levelControl cluster
		const levelState = endpoint.maybeStateOf('levelControl')
		if (levelState) {
			const events = endpoint.eventsOf('levelControl')
			events.currentLevel$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const brightness = fromMatterLevel(value)
				log.debug('matter inbound: brightness', { deviceId, brightness })
				this.handleInboundCommand(deviceId, { brightness })
			})
		}

		// colorControl cluster — color temperature
		const colorState = endpoint.maybeStateOf('colorControl')
		if (colorState) {
			const events = endpoint.eventsOf('colorControl')
			events.colorTemperatureMireds$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const colorTemp = miredToKelvin(value)
				log.debug('matter inbound: colorTemp', { deviceId, colorTemp })
				this.handleInboundCommand(deviceId, { colorTemp })
			})
		}

		// fanControl cluster
		const fanState = endpoint.maybeStateOf('fanControl')
		if (fanState) {
			const events = endpoint.eventsOf('fanControl')
			events.percentSetting$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				log.debug('matter inbound: fanSpeed', { deviceId, fanSpeed: value })
				this.handleInboundCommand(deviceId, { fanSpeed: value })
			})
		}
	}

	// ── Private ───────────────────────────────────────────────────────────

	private handleInboundCommand(deviceId: string, state: Partial<DeviceState>) {
		if (this.onInboundCommand) {
			this.onInboundCommand(deviceId, state)
		}

		// emit to SSE bus so the dashboard updates
		eventBus.publish({
			type: 'device:update',
			deviceId,
			state,
			timestamp: Date.now(),
			source: 'matter',
		})
	}

	private async loadDevices() {
		if (!this.db) return

		const matterDevices = this.db
			.select()
			.from(devices)
			.where(eq(devices.matterEnabled, true))
			.all()

		log.info('matter bridge loading devices', { count: matterDevices.length })

		for (const device of matterDevices) {
			const state = parseJson<DeviceState>(device.state).unwrapOr({})
			await this.addDevice(device, state)
		}
	}
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const matterBridge = new MatterBridge()
