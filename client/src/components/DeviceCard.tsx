import { useCallback, useState } from 'react'
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

import { cn } from '../lib/cn'
import { type LightAccent, lightAccentStyle, tempToColor } from '../lib/color-utils'
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

const TYPE_LABEL: Record<string, string> = {
	light: 'LIGHT',
	switch: 'SWITCH',
	thermostat: 'THERMO',
	air_purifier: 'AIR',
	sensor: 'SENSOR',
	vacuum: 'VACUUM',
	washer_dryer: 'WASHER',
	dishwasher: 'DISHES',
	oven: 'OVEN',
	fridge: 'FRIDGE',
	tv: 'TV',
	media_player: 'MEDIA',
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

	const typeLabel = TYPE_LABEL[device.type] ?? device.type.toUpperCase()

	return (
		<Card
			accent={accent?.borderColor}
			glowShadow={accent?.glowShadow}
			muted={!device.online}
			selected={isSelected}
		>
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						{onToggleSelect !== undefined && (
							<button
								type="button"
								onClick={onToggleSelect}
								className="w-4 h-4 shrink-0 rounded-full border transition-all cursor-default"
								style={{
									borderColor: isSelected ? '#d97706' : '#c4c0b8',
									background: isSelected
										? 'radial-gradient(circle at 35% 30%, #fde68a 0%, #f59e0b 45%, #b45309 100%)'
										: 'radial-gradient(circle at 35% 30%, #e8e4de 0%, #c4c0b8 45%, #a8a29e 100%)',
									boxShadow: isSelected
										? '0 0 6px rgba(251,191,36,0.5), inset 0 1px 2px rgba(255,255,255,0.3)'
										: 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.1)',
								}}
								aria-label={isSelected ? 'Deselect' : 'Select'}
							/>
						)}
						<div className="min-w-0">
							<p className="text-sm font-michroma text-stone-800 truncate leading-tight">{device.name}</p>
							<p className="font-commit text-[10px] text-stone-400 truncate mt-0.5">
								{BRAND_LABEL[device.brand] ?? device.brand} · {typeLabel}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						<span
							className={cn('w-2 h-2 rounded-full shrink-0', device.online ? 'bg-emerald-500' : 'bg-stone-300')}
							title={device.online ? 'Online' : 'Offline'}
						/>
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
				{isNativeMatter ? (
					<TooltipTrigger delay={200}>
						<Button className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-michroma uppercase tracking-wider rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default focus:outline-none">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
							MATTER
						</Button>
						<Tooltip className="bg-stone-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
							{nativeTooltip}
						</Tooltip>
					</TooltipTrigger>
				) : (
					<Button
						onPress={() => { void handleMatterToggle(!device.matterEnabled) }}
						isDisabled={matterLoading || !device.online}
						className={cn(
							'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-michroma uppercase tracking-wider',
							'rounded-md border cursor-default disabled:opacity-40',
							'transition-[box-shadow,transform] duration-100',
							device.matterEnabled
								? 'bg-stone-200 text-stone-700 border-stone-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.15),inset_0_0_1px_rgba(0,0,0,0.1)]'
								: 'bg-gradient-to-b from-stone-50 to-stone-100 text-stone-500 border-stone-300 shadow-[0_2px_4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.7)]',
							'pressed:translate-y-px pressed:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),inset_0_0_1px_rgba(0,0,0,0.08)]',
						)}
						aria-label={device.matterEnabled ? 'Disable Matter bridge' : 'Enable Matter bridge'}
					>
						<span
							className={cn('w-1.5 h-1.5 rounded-full transition-colors', device.matterEnabled ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-stone-400')}
						/>
						MATTER
					</Button>
				)}

				{/* slim light bar — reflects device brightness & color */}
				<LightBar device={device} />
			</CardFooter>
		</Card>
	)
}

// sony-inspired slim light bar that reflects the device's current light state
function LightBar({ device }: Readonly<{ device: Device }>) {
	const { state } = device
	const isOn = state.on ?? false
	const brightness = (state.brightness ?? 100) / 100

	// determine bar color from device state
	let barColor = '#d6d3cd' // off — neutral warm gray
	if (isOn && device.type === 'light') {
		if (state.color) {
			const { r, g, b } = state.color
			barColor = `rgb(${r} ${g} ${b})`
		} else if (state.colorTemp !== undefined) {
			barColor = tempToColor(state.colorTemp)
		} else {
			barColor = '#fbbf24' // warm amber fallback
		}
	}

	return (
		<div
			className="flex-1 h-1.5 rounded-full transition-all duration-300"
			style={{
				background: isOn ? barColor : '#d6d3cd',
				opacity: isOn ? 0.5 + brightness * 0.5 : 1,
				boxShadow: isOn
					? `0 0 8px color-mix(in srgb, ${barColor} 50%, transparent), 0 0 3px color-mix(in srgb, ${barColor} 30%, transparent)`
					: 'inset 0 1px 2px rgba(0,0,0,0.15), inset 0 0 1px rgba(0,0,0,0.1)',
			}}
		/>
	)
}

