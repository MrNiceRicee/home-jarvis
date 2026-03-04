import { useCallback, useState } from 'react'
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

// brands with native Matter support — show "Native ✓" instead of toggle
const NATIVE_MATTER_BRANDS = new Set(['hue', 'aqara'])

interface DeviceCardProps {
	device: Device
	isSelected?: boolean
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onToggleSelect?: () => void
}

export function DeviceCard({
	device,
	isSelected,
	onExpand,
	onStateChange,
	onMatterToggle,
	onToggleSelect,
}: Readonly<DeviceCardProps>) {
	const baseAccent = device.type === 'light' ? lightAccentStyle(device.state) : undefined
	const [liveAccent, setLiveAccent] = useState<LightAccent | null>(null)

	const handleAccentChange = useCallback((override: { brightness?: number; colorTemp?: number; color?: { r: number; g: number; b: number } } | null) => {
		if (!override) { setLiveAccent(null); return }
		setLiveAccent(lightAccentStyle({
			on: true,
			brightness: override.brightness,
			colorTemp: override.colorTemp,
			color: override.color,
		}) ?? null)
	}, [])

	const accent = liveAccent ?? baseAccent

	return (
		<CardShell
			device={device}
			onMatterToggle={onMatterToggle}
			onExpand={onExpand}
			accent={accent}
			isSelected={isSelected}
			onToggleSelect={onToggleSelect}
		>
			{renderBody(device, onStateChange, handleAccentChange)}
		</CardShell>
	)
}

function renderBody(
	device: Device,
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>,
	onAccentChange?: (override: { brightness?: number; colorTemp?: number; color?: { r: number; g: number; b: number } } | null) => void,
) {
	switch (device.type) {
		case 'light':
			return <LightCard device={device} onStateChange={onStateChange} onAccentChange={onAccentChange} />
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
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onToggleSelect?: () => void
}

function CardShell({
	accent,
	children,
	device,
	isSelected,
	onExpand,
	onMatterToggle,
	onToggleSelect,
}: Readonly<CardShellProps>) {
	const [matterLoading, setMatterLoading] = useState(false)
	const isNativeMatter = NATIVE_MATTER_BRANDS.has(device.brand)

	async function handleMatterToggle(enabled: boolean) {
		if (!onMatterToggle) return
		setMatterLoading(true)
		try {
			await onMatterToggle(device.id, enabled)
		} finally {
			setMatterLoading(false)
		}
	}

	const nativeTooltip =
		device.brand === 'hue'
			? 'Hue supports Matter natively. Add via your smart home app.'
			: 'Aqara supports Matter natively. Add via your smart home app.'

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
							<p className="text-sm font-commit font-medium text-stone-900 truncate">{device.name}</p>
							<p className="text-xs font-commit text-stone-500 truncate">
								{BRAND_LABEL[device.brand] ?? device.brand}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						<OnlineBadge online={device.online} accented={!!accent} />
						{onExpand && (
							<Button
								onPress={() => onExpand(device)}
								className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-default"
								aria-label={`Expand ${device.name}`}
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
									<path d="M8.5 1.5h4v4M5.5 12.5h-4v-4M12.5 1.5L8 6M1.5 12.5L6 8" />
								</svg>
							</Button>
						)}
					</div>
				</div>
			</CardHeader>

			<CardBody>{children}</CardBody>

			<CardFooter>
				<span className="text-xs font-commit text-stone-400 uppercase tracking-wide">Matter</span>
				{isNativeMatter ? (
					<TooltipTrigger delay={200}>
						<Button className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 cursor-default focus:outline-none">
							Native ✓
						</Button>
						<Tooltip className="bg-stone-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
							{nativeTooltip}
						</Tooltip>
					</TooltipTrigger>
				) : (
					<Switch
						isSelected={device.matterEnabled}
						onChange={handleMatterToggle}
						isDisabled={matterLoading || !device.online}
						className="group flex items-center gap-2 cursor-default"
					>
						<div className="w-9 h-5 rounded-full transition-colors bg-stone-200 group-selected:bg-emerald-500 group-disabled:opacity-40">
							<div className="w-4 h-4 bg-white rounded-full shadow-sm m-0.5 transition-transform group-selected:translate-x-4" />
						</div>
						<Label className="sr-only">Enable Matter</Label>
					</Switch>
				)}
			</CardFooter>
		</Card>
	)
}

function badgeBg(online: boolean, accented: boolean): string {
	if (accented) return 'bg-white/70'
	return online ? 'bg-emerald-50' : 'bg-stone-100'
}

function OnlineBadge({ online, accented }: Readonly<{ online: boolean; accented: boolean }>) {
	return (
		<span
			className={cn('flex items-center gap-1 text-xs font-commit font-medium shrink-0 px-1.5 py-0.5 rounded-full', badgeBg(online, accented), online ? 'text-emerald-700' : 'text-stone-400')}
		>
			<span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-stone-300')} />
			{online ? 'Online' : 'Offline'}
		</span>
	)
}
