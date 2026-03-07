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
import {
	clampPercent,
	fromMatterLevel,
	kelvinToMired,
	miredToKelvin,
	toMatterAirQuality,
	toMatterLevel,
	toMatterTemp,
} from '../lib/unit-conversions'
import { type ComposedEndpoint, createMatterEndpoint } from './device-factory'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMatterErrorDetails(error: unknown): string {
	const causes = (error as { causes?: Error[] })?.causes
		?? (error as { errors?: Error[] })?.errors
		?? []
	if (causes.length > 0) {
		return causes.map((c: Error) => {
			const inner = c.cause instanceof Error ? c.cause.message : ''
			return inner || c.message
		}).join('; ')
	}
	return error instanceof Error ? error.message : String(error)
}

// ─── Types ──────────────────────────────────────────────────────────────────

type BridgeStatus = 'stopped' | 'starting' | 'running' | 'error'

type InboundCommandHandler = (deviceId: string, state: Partial<DeviceState>) => void

// tracks a device's matter endpoints — simple (one endpoint) or composed (parent + children)
type DeviceEntry =
	| { type: 'simple'; root: Endpoint }
	| { type: 'composed'; root: Endpoint; fan: Endpoint; sensor: Endpoint }
	| { type: 'thermostat'; root: Endpoint; thermostat: Endpoint; humidity: Endpoint | null }

// ─── Pairing code generation ────────────────────────────────────────────────

const INVALID_PASSCODES = new Set([
	0, 11111111, 22222222, 33333333, 44444444,
	55555555, 66666666, 77777777, 88888888, 99999999,
	12345678, 87654321,
])

function generatePasscode(): number {
	const buf = new Uint32Array(1)
	let passcode: number
	do {
		crypto.getRandomValues(buf)
		passcode = (buf[0] ?? 0) % 99999999
	} while (INVALID_PASSCODES.has(passcode))
	return passcode
}

function generateDiscriminator(): number {
	const buf = new Uint16Array(1)
	crypto.getRandomValues(buf)
	return (buf[0] ?? 0) % 4096
}

// ─── Storage setup ──────────────────────────────────────────────────────────

const STORAGE_DIR = path.resolve(process.cwd(), 'data/matter-storage')

function ensureStorageDir() {
	mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 })
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
	private entries = new Map<string, DeviceEntry>()
	private db: DB | null = null
	private onInboundCommand: InboundCommandHandler | null = null

	get deviceCount(): number {
		return this.entries.size
	}

	// ── Status accessors ──────────────────────────────────────────────────

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

			const passcode = generatePasscode()
			const discriminator = generateDiscriminator()
			log.info('matter bridge pairing credentials', { passcode, discriminator })

			this.node = await ServerNode.create({
				id: 'jarvis-bridge',
				network: { port: this.port },
				commissioning: {
					passcode,
					discriminator,
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

			await this.node.start()

			this.paired = this.node.lifecycle.isCommissioned
			if (!this.paired) {
				const codes = this.node.state.commissioning.pairingCodes
				this.pairingQrCode = codes.qrPairingCode
				log.info('matter bridge awaiting pairing', { qr: this.pairingQrCode })
			} else {
				log.info('matter bridge already paired')
			}

			this.node.lifecycle.commissioned.on(() => {
				this.paired = true
				log.info('matter bridge commissioned')
			})

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
			for (const [id, entry] of this.entries) {
				try {
					await entry.root.close()
				} catch (error) {
					log.warn('matter bridge endpoint close failed', {
						deviceId: id,
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}
			this.entries.clear()

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

		if (this.entries.has(device.id)) {
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

		try {
			const endpointResult = result.value
			if (endpointResult.composed) {
				await this.addComposedDevice(device, endpointResult.composed_device)
			} else {
				await this.addSimpleDevice(device, endpointResult.endpoint)
			}
		} catch (error) {
			const msg = extractMatterErrorDetails(error)
			log.error('matter device add failed', { deviceId: device.id, error: msg })
			throw new Error(`Matter bridge error: ${msg}`, { cause: error })
		}
	}

	private async addSimpleDevice(device: Device, endpoint: Endpoint) {
		await this.aggregator!.add(endpoint)
		this.entries.set(device.id, { type: 'simple', root: endpoint })
		this.setupInboundHandlers(device.id, endpoint)
		log.info('matter device added', { deviceId: device.id, name: device.name, type: device.type })
	}

	private async addComposedDevice(device: Device, composed: ComposedEndpoint) {
		if (composed.kind === 'air_purifier') {
			await this.aggregator!.add(composed.parent)
			await composed.parent.add(composed.fanEndpoint)
			await composed.parent.add(composed.sensorEndpoint)

			this.entries.set(device.id, {
				type: 'composed',
				root: composed.parent,
				fan: composed.fanEndpoint,
				sensor: composed.sensorEndpoint,
			})
			this.setupInboundHandlers(device.id, composed.fanEndpoint)
		} else {
			await this.aggregator!.add(composed.parent)
			await composed.parent.add(composed.thermostatEndpoint)
			if (composed.humidityEndpoint) {
				await composed.parent.add(composed.humidityEndpoint)
			}

			this.entries.set(device.id, {
				type: 'thermostat',
				root: composed.parent,
				thermostat: composed.thermostatEndpoint,
				humidity: composed.humidityEndpoint,
			})
			this.setupInboundHandlers(device.id, composed.thermostatEndpoint)
		}

		log.info('matter composed device added', { deviceId: device.id, name: device.name, type: device.type })
	}

	async removeDevice(deviceId: string) {
		const entry = this.entries.get(deviceId)
		if (!entry) return

		try {
			await entry.root.close()
			this.entries.delete(deviceId)
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
		const entry = this.entries.get(deviceId)
		if (!entry) return

		try {
			if (entry.type === 'composed') {
				await this.updateAirPurifierDevice(entry, state)
			} else if (entry.type === 'thermostat') {
				await this.updateThermostatDevice(entry, state)
			} else {
				await this.updateSimpleDevice(entry.root, state)
			}
		} catch (error) {
			log.error('matter state push failed', {
				deviceId,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	private async updateSimpleDevice(endpoint: Endpoint, state: Partial<DeviceState>) {
		if (state.on !== undefined) {
			await endpoint.setStateOf('onOff', { onOff: state.on })
		}

		if (state.brightness !== undefined) {
			await endpoint.setStateOf('levelControl', { currentLevel: toMatterLevel(state.brightness) })
		}

		if (state.colorTemp !== undefined) {
			await endpoint.setStateOf('colorControl', { colorTemperatureMireds: kelvinToMired(state.colorTemp) })
		}
	}

	private async updateThermostatDevice(entry: DeviceEntry & { type: 'thermostat' }, state: Partial<DeviceState>) {
		const thermostatPatch: Record<string, unknown> = {}

		if (state.temperature !== undefined) {
			thermostatPatch.localTemperature = toMatterTemp(state.temperature)
		}

		if (state.targetTemperature !== undefined) {
			// maintain deadband between setpoints
			const target = toMatterTemp(state.targetTemperature)
			const mode = state.mode
			if (mode === 'cool') {
				thermostatPatch.occupiedCoolingSetpoint = target
				thermostatPatch.occupiedHeatingSetpoint = target - 250
			} else {
				thermostatPatch.occupiedHeatingSetpoint = target
				thermostatPatch.occupiedCoolingSetpoint = target + 250
			}
		}

		if (state.mode !== undefined) {
			const modeMap: Record<string, number> = { off: 0, auto: 1, cool: 3, heat: 4 }
			thermostatPatch.systemMode = modeMap[state.mode] ?? 1
		}

		if (Object.keys(thermostatPatch).length > 0) {
			await entry.thermostat.setStateOf('thermostat', thermostatPatch)
		}

		// humidity sensor
		if (state.humidity !== undefined && entry.humidity) {
			await entry.humidity.setStateOf('relativeHumidityMeasurement', {
				measuredValue: state.humidity * 100,
			})
		}
	}

	private async updateAirPurifierDevice(entry: DeviceEntry & { type: 'composed' }, state: Partial<DeviceState>) {
		// fan endpoint: power, fan speed, filter life
		if (state.on !== undefined) {
			await entry.fan.setStateOf('onOff', { onOff: state.on })
		}

		if (state.fanSpeed !== undefined) {
			await entry.fan.setStateOf('fanControl', {
				percentSetting: clampPercent(state.fanSpeed),
				percentCurrent: clampPercent(state.fanSpeed),
			})
		}

		if (state.filterLife !== undefined) {
			await entry.fan.setStateOf('hepaFilterMonitoring', {
				condition: state.filterLife,
			})
		}

		// sensor endpoint: air quality + PM2.5
		if (state.airQuality !== undefined) {
			await entry.sensor.setStateOf('airQuality', {
				airQuality: toMatterAirQuality(state.airQuality),
			})
		}

		if (state.pm25 !== undefined) {
			await entry.sensor.setStateOf('pm25ConcentrationMeasurement', {
				measuredValue: state.pm25,
			})
		}
	}

	// ── Inbound commands (matter → our devices) ───────────────────────────

	onCommand(handler: InboundCommandHandler) {
		this.onInboundCommand = handler
	}

	setupInboundHandlers(deviceId: string, endpoint: Endpoint) {
		// onOff cluster
		if (endpoint.maybeStateOf('onOff')) {
			const events = endpoint.eventsOf('onOff')
			events.onOff$Changed?.on((value: unknown) => {
				if (typeof value !== 'boolean') return
				log.debug('matter inbound: onOff', { deviceId, value })
				this.handleInboundCommand(deviceId, { on: value })
			})
		}

		// levelControl cluster
		if (endpoint.maybeStateOf('levelControl')) {
			const events = endpoint.eventsOf('levelControl')
			events.currentLevel$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const brightness = fromMatterLevel(value)
				log.debug('matter inbound: brightness', { deviceId, brightness })
				this.handleInboundCommand(deviceId, { brightness })
			})
		}

		// colorControl cluster
		if (endpoint.maybeStateOf('colorControl')) {
			const events = endpoint.eventsOf('colorControl')
			events.colorTemperatureMireds$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const colorTemp = miredToKelvin(value)
				log.debug('matter inbound: colorTemp', { deviceId, colorTemp })
				this.handleInboundCommand(deviceId, { colorTemp })
			})
		}

		// fanControl cluster
		if (endpoint.maybeStateOf('fanControl')) {
			const events = endpoint.eventsOf('fanControl')
			events.percentSetting$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				log.debug('matter inbound: fanSpeed', { deviceId, fanSpeed: value })
				this.handleInboundCommand(deviceId, { fanSpeed: value })
			})
		}

		// thermostat cluster
		if (endpoint.maybeStateOf('thermostat')) {
			const events = endpoint.eventsOf('thermostat')
			events.systemMode$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const modeMap: Record<number, string> = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat' }
				const mode = modeMap[value]
				if (!mode) return
				log.debug('matter inbound: thermostat mode', { deviceId, mode })
				this.handleInboundCommand(deviceId, { mode })
			})
			events.occupiedHeatingSetpoint$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const targetTemperature = value / 100
				log.debug('matter inbound: heating setpoint', { deviceId, targetTemperature })
				this.handleInboundCommand(deviceId, { targetTemperature })
			})
			events.occupiedCoolingSetpoint$Changed?.on((value: unknown) => {
				if (typeof value !== 'number') return
				const targetTemperature = value / 100
				log.debug('matter inbound: cooling setpoint', { deviceId, targetTemperature })
				this.handleInboundCommand(deviceId, { targetTemperature })
			})
		}
	}

	// ── Private ───────────────────────────────────────────────────────────

	private handleInboundCommand(deviceId: string, state: Partial<DeviceState>) {
		if (this.onInboundCommand) {
			this.onInboundCommand(deviceId, state)
		}

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
