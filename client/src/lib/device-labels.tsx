import { AirPurifierCard } from '../components/device-cards/AirPurifierCard'
import { ApplianceCard } from '../components/device-cards/ApplianceCard'
import { FridgeCard } from '../components/device-cards/FridgeCard'
import { GenericCard } from '../components/device-cards/GenericCard'
import { LightCard } from '../components/device-cards/LightCard'
import { MediaCard } from '../components/device-cards/MediaCard'
import { SensorCard } from '../components/device-cards/SensorCard'
import { ThermostatCard } from '../components/device-cards/ThermostatCard'
import { VacuumCard } from '../components/device-cards/VacuumCard'
import type { Device, DeviceState } from '../types'

interface DeviceBodyProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onAccentChange?: (
		accent: {
			brightness?: number
			colorTemp?: number
			color?: { r: number; g: number; b: number }
		} | null,
	) => void
}

export function DeviceBody({
	device,
	variant = 'compact',
	onStateChange,
	onAccentChange,
}: Readonly<DeviceBodyProps>) {
	switch (device.type) {
		case 'light':
			return (
				<LightCard
					device={device}
					variant={variant}
					onStateChange={onStateChange}
					onAccentChange={onAccentChange}
				/>
			)
		case 'thermostat':
			return <ThermostatCard device={device} variant={variant} onStateChange={onStateChange} />
		case 'air_purifier':
			return <AirPurifierCard device={device} variant={variant} onStateChange={onStateChange} />
		case 'vacuum':
			return <VacuumCard device={device} onStateChange={onStateChange} />
		case 'washer_dryer':
		case 'dishwasher':
		case 'oven':
			return <ApplianceCard device={device} />
		case 'tv':
		case 'media_player':
			return <MediaCard device={device} variant={variant} onStateChange={onStateChange} />
		case 'fridge':
			return <FridgeCard device={device} variant={variant} />
		case 'sensor':
			return <SensorCard device={device} />
		default:
			return <GenericCard device={device} onStateChange={onStateChange} />
	}
}
