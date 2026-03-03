import { useState } from 'react'
import { Button, Label, Switch, Tooltip, TooltipTrigger } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

import { cn } from '../lib/cn'
import { type LightAccent, lightAccentStyle } from '../lib/color-utils'
import { AirPurifierCard } from './device-cards/AirPurifierCard'
import { ApplianceCard } from './device-cards/ApplianceCard'
import { FridgeCard } from './device-cards/FridgeCard'
import { GenericCard } from './device-cards/GenericCard'
import { LightCard } from './device-cards/LightCard'
import { MediaCard } from './device-cards/MediaCard'
import { SensorCard } from './device-cards/SensorCard'
import { ThermostatCard } from './device-cards/ThermostatCard'
import { VacuumCard } from './device-cards/VacuumCard'
import { Card, CardBody, CardFooter, CardHeader } from './ui/card'

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

// Brands with native HomeKit support — show "Native ✓" instead of toggle
const NATIVE_HOMEKIT_BRANDS = new Set(['hue', 'aqara'])

interface DeviceCardProps {
	device: Device
	isSelected?: boolean
	onHomekitToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onToggleSelect?: () => void
}

export function DeviceCard({
	device,
	isSelected,
	onStateChange,
	onHomekitToggle,
	onToggleSelect,
}: Readonly<DeviceCardProps>) {
	const accent = device.type === 'light' ? lightAccentStyle(device.state) : undefined

	return (
		<CardShell
			device={device}
			onHomekitToggle={onHomekitToggle}
			accent={accent}
			isSelected={isSelected}
			onToggleSelect={onToggleSelect}
		>
			{renderBody(device, onStateChange)}
		</CardShell>
	)
}

function renderBody(
	device: Device,
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>,
) {
	switch (device.type) {
		case 'light':
			return <LightCard device={device} onStateChange={onStateChange} />
		case 'thermostat':
			return <ThermostatCard device={device} onStateChange={onStateChange} />
		case 'air_purifier':
			return <AirPurifierCard device={device} onStateChange={onStateChange} />
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

interface CardShellProps {
	accent?: LightAccent
	children: React.ReactNode
	device: Device
	isSelected?: boolean
	onHomekitToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onToggleSelect?: () => void
}

function CardShell({
	accent,
	children,
	device,
	isSelected,
	onHomekitToggle,
	onToggleSelect,
}: Readonly<CardShellProps>) {
	const [hkLoading, setHkLoading] = useState(false)
	const isNativeHomeKit = NATIVE_HOMEKIT_BRANDS.has(device.brand)

	async function handleHomekitToggle(enabled: boolean) {
		if (!onHomekitToggle) return
		setHkLoading(true)
		try {
			await onHomekitToggle(device.id, enabled)
		} finally {
			setHkLoading(false)
		}
	}

	const nativeTooltip =
		device.brand === 'hue'
			? 'Hue supports HomeKit natively. Add via the Apple Home app.'
			: 'Aqara supports HomeKit natively. Add via the Apple Home app.'

	const icon = TYPE_ICON[device.type] ?? '📦'

	return (
		<Card
			accent={accent?.borderColor}
			muted={!device.online}
			selected={isSelected}
		>
			<CardHeader style={accent ? { background: accent.headerBackground } : undefined}>
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						{onToggleSelect !== undefined ? (
							<button
								type="button"
								onClick={onToggleSelect}
								className={cn(
									'relative text-xl shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all',
									isSelected
										? 'bg-blue-100 ring-2 ring-blue-500'
										: 'hover:bg-white/60 hover:ring-2 hover:ring-white/80',
								)}
								aria-label={isSelected ? 'Deselect' : 'Select'}
							>
								{icon}
								{isSelected && (
									<span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[9px] leading-none font-bold">
										✓
									</span>
								)}
							</button>
						) : (
							<span className="text-xl shrink-0 w-9 h-9 flex items-center justify-center">
								{icon}
							</span>
						)}
						<div className="min-w-0">
							<p className="text-sm font-semibold text-gray-900 truncate">{device.name}</p>
							<p className="text-xs text-gray-500 truncate">
								{BRAND_LABEL[device.brand] ?? device.brand}
							</p>
						</div>
					</div>
					<OnlineBadge online={device.online} accented={!!accent} />
				</div>
			</CardHeader>

			<CardBody>{children}</CardBody>

			<CardFooter>
				<span className="text-xs text-gray-400">HomeKit</span>
				{isNativeHomeKit ? (
					<TooltipTrigger delay={200}>
						<Button className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 cursor-default focus:outline-none">
							Native ✓
						</Button>
						<Tooltip className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
							{nativeTooltip}
						</Tooltip>
					</TooltipTrigger>
				) : (
					<Switch
						isSelected={device.homekitEnabled}
						onChange={handleHomekitToggle}
						isDisabled={hkLoading || !device.online}
						className="group flex items-center gap-2 cursor-default"
					>
						<div className="w-9 h-5 rounded-full transition-colors bg-gray-200 group-selected:bg-emerald-500 group-disabled:opacity-40">
							<div className="w-4 h-4 bg-white rounded-full shadow-sm m-0.5 transition-transform group-selected:translate-x-4" />
						</div>
						<Label className="sr-only">Enable HomeKit</Label>
					</Switch>
				)}
			</CardFooter>
		</Card>
	)
}

function badgeBg(online: boolean, accented: boolean): string {
	if (accented) return 'bg-white/70'
	return online ? 'bg-emerald-50' : 'bg-gray-100'
}

function OnlineBadge({ online, accented }: Readonly<{ online: boolean; accented: boolean }>) {
	return (
		<span
			className={cn('flex items-center gap-1 text-xs font-medium shrink-0 px-1.5 py-0.5 rounded-full', badgeBg(online, accented), online ? 'text-emerald-700' : 'text-gray-400')}
		>
			<span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-gray-300')} />
			{online ? 'Online' : 'Offline'}
		</span>
	)
}
