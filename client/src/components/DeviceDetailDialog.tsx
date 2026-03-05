import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

import { cn } from '../lib/cn'
import { AirPurifierCard } from './device-cards/AirPurifierCard'
import { ApplianceCard } from './device-cards/ApplianceCard'
import { FridgeCard } from './device-cards/FridgeCard'
import { GenericCard } from './device-cards/GenericCard'
import { LightCard } from './device-cards/LightCard'
import { MediaCard } from './device-cards/MediaCard'
import { SensorCard } from './device-cards/SensorCard'
import { ThermostatCard } from './device-cards/ThermostatCard'
import { VacuumCard } from './device-cards/VacuumCard'
import { RaisedButton } from './ui/button'

const TYPE_ICON: Record<string, string> = {
	light: '💡',
	switch: '🔌',
	thermostat: '🌡️',
	air_purifier: '💨',
	sensor: '📡',
	vacuum: '🤖',
	washer_dryer: '🧺',
	dishwasher: '🍽️',
	oven: '🫕',
	fridge: '🧊',
	tv: '📺',
	media_player: '🎵',
}

const BRAND_LABEL: Record<string, string> = {
	aqara: 'Aqara',
	elgato: 'Elgato',
	eufy: 'Eufy',
	ge: 'GE',
	govee: 'Govee',
	hue: 'Hue',
	lg: 'LG',
	resideo: 'Resideo',
	samsung: 'Samsung',
	smartthings: 'SmartThings',
	sonos: 'Sonos',
	vesync: 'VeSync',
}

interface DeviceDetailDialogProps {
	device: Device | null
	onClose: () => void
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function DeviceDetailDialog({ device, onClose, onStateChange }: Readonly<DeviceDetailDialogProps>) {
	if (!device) return null

	const icon = TYPE_ICON[device.type] ?? '📦'

	return (
		<ModalOverlay
			isOpen
			onOpenChange={(open) => { if (!open) onClose() }}
			isDismissable
			className="fixed inset-0 bg-stone-900/15 backdrop-blur-sm z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out"
		>
			<AriaModal
				className={cn(
					'w-full max-w-lg mx-4',
					'bg-linear-to-b from-[#fffdf8] to-stone-50/80',
					'rounded-2xl',
					'border border-[rgba(168,151,125,0.15)]',
					'shadow-[0_8px_40px_rgba(120,90,50,0.08),0_2px_8px_rgba(120,90,50,0.06),inset_0_1px_0_rgba(255,253,245,0.8)]',
					'entering:animate-in entering:zoom-in-95',
					'exiting:animate-out exiting:zoom-out-95',
				)}
			>
				<Dialog className="outline-none">
					{/* header */}
					<div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-stone-200/60">
						<span className="text-2xl">{icon}</span>
						<div className="min-w-0 flex-1">
							<Heading slot="title" className="text-sm font-michroma text-stone-800 truncate">
								{device.name}
							</Heading>
							<p className="font-michroma text-[10px] uppercase tracking-wider text-stone-400 truncate">
								{BRAND_LABEL[device.brand] ?? device.brand}
								{!device.online && ' · Offline'}
							</p>
						</div>
						<OnlineDot online={device.online} />
					</div>

					{/* body — full controls */}
					<div className="px-6 py-4">
						{renderDetailBody(device, onStateChange)}
					</div>

					{/* footer */}
					<div className="flex justify-end px-6 pb-5">
						<RaisedButton variant="ghost" onPress={onClose}>
							Close
						</RaisedButton>
					</div>
				</Dialog>
			</AriaModal>
		</ModalOverlay>
	)
}

function renderDetailBody(
	device: Device,
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>,
) {
	switch (device.type) {
		case 'light':
			return <LightCard device={device} variant="full" onStateChange={onStateChange} />
		case 'thermostat':
			return <ThermostatCard device={device} variant="full" onStateChange={onStateChange} />
		case 'air_purifier':
			return <AirPurifierCard device={device} variant="full" onStateChange={onStateChange} />
		case 'vacuum':
			return <VacuumCard device={device} onStateChange={onStateChange} />
		case 'washer_dryer':
		case 'dishwasher':
		case 'oven':
			return <ApplianceCard device={device} />
		case 'tv':
		case 'media_player':
			return <MediaCard device={device} onStateChange={onStateChange} />
		case 'fridge':
			return <FridgeCard device={device} />
		case 'sensor':
			return <SensorCard device={device} />
		default:
			return <GenericCard device={device} onStateChange={onStateChange} />
	}
}

function OnlineDot({ online }: Readonly<{ online: boolean }>) {
	return (
		<span
			className={cn(
				'w-2.5 h-2.5 rounded-full shrink-0',
				online ? 'bg-emerald-500' : 'bg-stone-300',
			)}
			title={online ? 'Online' : 'Offline'}
		/>
	)
}
