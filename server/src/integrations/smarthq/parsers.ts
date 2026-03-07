import type { CycleStatus, DeviceState, DeviceType } from '../types'
import type { SmartHQDeviceDetail, SmartHQService } from './types'

// ─── Device type classification ──────────────────────────────────────────────

export function mapSmartHQDeviceType(deviceType: string): DeviceType | null {
	if (deviceType.includes('washer') || deviceType.includes('combilaundry') || deviceType.includes('dryer')) return 'washer_dryer'
	if (deviceType.includes('dishwasher')) return 'dishwasher'
	if (deviceType.includes('oven') || deviceType.includes('cooktop') || deviceType.includes('microwave')) return 'oven'
	if (deviceType.includes('refrigerator')) return 'fridge'
	return null
}

// ─── Service state extraction ────────────────────────────────────────────────

function findService(services: SmartHQService[], typeFragment: string): SmartHQService | undefined {
	return services.find((s) => s.serviceType.includes(typeFragment))
}

function findServiceState<T>(services: SmartHQService[], typeFragment: string, key: string): T | undefined {
	const service = findService(services, typeFragment)
	return service?.state[key] as T | undefined
}

/** extract cycle status from operational state service */
function parseCycleStatus(services: SmartHQService[]): CycleStatus | undefined {
	const stateService = findService(services, '.state.') ?? findService(services, '.toggle.')
	if (!stateService) return undefined

	const on = stateService.state.on
	if (on === true) return 'running'
	if (on === false) return 'idle'
	return undefined
}

// ─── Unified appliance parser ────────────────────────────────────────────────

function parseApplianceState(services: SmartHQService[]): DeviceState {
	const on = findServiceState<boolean>(services, 'toggle', 'on')
	return {
		on: on ?? false,
		cycleStatus: parseCycleStatus(services) ?? 'idle',
	}
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseSmartHQDeviceState(device: SmartHQDeviceDetail): DeviceState {
	const type = mapSmartHQDeviceType(device.deviceType)
	const services = device.services ?? []

	switch (type) {
		case 'washer_dryer':
		case 'dishwasher':
		case 'oven':
			return parseApplianceState(services)
		case 'fridge':
			return { on: findServiceState<boolean>(services, 'toggle', 'on') ?? false }
		default:
			return {}
	}
}
