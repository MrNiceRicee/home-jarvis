import { memo, useCallback, useState } from 'react'
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

import { cn } from '../lib/cn'
import { type LightAccent, lightAccentStyle, tempToColor } from '../lib/color-utils'
import { BRAND_LABEL } from '../lib/device-constants'
import { DeviceBody } from '../lib/device-labels'
import { Card, CardBody, CardFooter, CardHeader } from './ui/card'
import { PowerButton } from './ui/power-button'

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

// brands with native Matter support — show "Native" instead of toggle
const NATIVE_MATTER_BRANDS = new Set(['hue', 'aqara'])

interface DeviceCardProps {
	device: Device
	isSelected?: boolean
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onToggleSelect?: () => void
}

export const DeviceCard = memo(function DeviceCard({
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
			onStateChange={onStateChange}
			onExpand={onExpand}
			accent={accent}
			isSelected={isSelected}
			onToggleSelect={onToggleSelect}
		>
			<DeviceBody device={device} onStateChange={onStateChange} onAccentChange={handleAccentChange} />
		</CardShell>
	)
})

interface CardShellProps {
	accent?: LightAccent
	children: React.ReactNode
	device: Device
	isSelected?: boolean
	onExpand?: (device: Device) => void
	onMatterToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
	onToggleSelect?: () => void
}

function CardShell({
	accent,
	children,
	device,
	isSelected,
	onExpand,
	onMatterToggle,
	onStateChange,
	onToggleSelect,
}: Readonly<CardShellProps>) {
	const [matterLoading, setMatterLoading] = useState(false)
	const [powerToggling, setPowerToggling] = useState(false)

	const POWER_TYPES = ['light', 'switch', 'thermostat', 'air_purifier', 'vacuum', 'washer_dryer', 'dishwasher', 'oven', 'tv', 'media_player']
	const hasPower = device.state.on !== undefined || POWER_TYPES.includes(device.type)
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
			{/* top status bar — universal online/state indicator */}
			<StatusBar device={device} />

			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						{onToggleSelect !== undefined && (
							<button
								type="button"
								onClick={onToggleSelect}
								className="w-4 h-4 shrink-0 rounded-full border transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
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
							<p className="font-michroma text-2xs uppercase tracking-wider text-stone-400 truncate mt-0.5">
								{BRAND_LABEL[device.brand] ?? device.brand} · {typeLabel}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{onExpand && (
							<Button
								onPress={() => onExpand(device)}
								className="w-7 h-7 flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 rounded-lg"
								aria-label={`Expand ${device.name}`}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									className="text-stone-400/40"
									style={{ filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.6))' }}
								>
									<path d="M8.5 1.5h4v4M5.5 12.5h-4v-4M12.5 1.5L8 6M1.5 12.5L6 8" />
								</svg>
							</Button>
						)}
					</div>
				</div>
			</CardHeader>

			<CardBody>{children}</CardBody>

			<CardFooter>
				<div className="px-3 py-2 flex items-center justify-between">
					{hasPower ? (
						<PowerButton
							isOn={device.state.on ?? false}
							isDisabled={!device.online}
							isToggling={powerToggling}
							onToggle={() => {
								if (!onStateChange) return
								setPowerToggling(true)
								void onStateChange(device.id, { on: !(device.state.on ?? false) })
									.finally(() => setPowerToggling(false))
							}}
						/>
					) : <div />}

					{isNativeMatter ? (
						<TooltipTrigger delay={200}>
							<Button className="inline-flex items-center gap-1.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 rounded-sm px-1 py-0.5">
								<span className="font-michroma text-2xs uppercase tracking-wider text-stone-400">MATTER</span>
							</Button>
							<Tooltip className="bg-stone-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
								{nativeTooltip}
							</Tooltip>
						</TooltipTrigger>
					) : (
						<TooltipTrigger delay={200}>
							<Button
								onPress={() => { void handleMatterToggle(!device.matterEnabled) }}
								isDisabled={matterLoading || !device.online}
								className={cn(
									'inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 rounded-sm px-1 py-0.5',
									device.matterEnabled && 'text-emerald-600',
								)}
								aria-label={device.matterEnabled ? 'Disable Matter bridge' : 'Enable Matter bridge'}
							>
								<span className={cn(
									'font-michroma text-2xs uppercase tracking-wider',
									device.matterEnabled ? 'text-emerald-600' : 'text-stone-400',
								)}>
									MATTER
								</span>
							</Button>
							<Tooltip className="bg-stone-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
								{device.matterEnabled ? 'Remove from Matter bridge' : 'Expose to Matter bridge'}
							</Tooltip>
						</TooltipTrigger>
					)}
				</div>
			</CardFooter>
		</Card>
	)
}

// thermostat mode → status bar color
const THERMOSTAT_MODE_BAR: Record<string, string> = {
	heat: 'rgb(249,115,22)',
	cool: 'rgb(59,130,246)',
	auto: 'rgb(52,211,153)',
}

function statusBarColors(device: Device): { barColor: string; glowColor: string | undefined } {
	const { state } = device
	const isOn = state.on ?? false

	if (!device.online) return { barColor: '#c8c4be', glowColor: undefined }

	if (isOn && device.type === 'light') {
		const barColor = lightBarColor(state)
		return { barColor, glowColor: barColor }
	}

	if (isOn && device.type === 'thermostat') {
		const mode = state.mode ?? 'off'
		const barColor = THERMOSTAT_MODE_BAR[mode] ?? '#d6d3cd'
		return { barColor, glowColor: mode !== 'off' ? barColor : undefined }
	}

	if (isOn) return { barColor: '#34d399', glowColor: '#34d399' }
	return { barColor: '#d6d3cd', glowColor: undefined }
}

function lightBarColor(state: DeviceState): string {
	if (state.colorTemp !== undefined) return tempToColor(state.colorTemp)
	if (state.color) {
		const { r, g, b } = state.color
		return `rgb(${r} ${g} ${b})`
	}
	return '#fbbf24'
}

// top-edge status strip — shows connectivity + light state at a glance
function StatusBar({ device }: Readonly<{ device: Device }>) {
	const brightness = (device.state.brightness ?? 100) / 100
	const { barColor, glowColor } = statusBarColors(device)

	return (
		<div className="px-3 pt-2">
			<div
				className="w-full h-1.5 rounded-full transition-all duration-300"
				style={{
					background: barColor,
					opacity: glowColor ? 0.7 + brightness * 0.3 : 1,
					boxShadow: glowColor
						? `inset 0 1px 2px rgba(0,0,0,0.2), 0 0 10px color-mix(in srgb, ${glowColor} 60%, transparent), 0 0 4px color-mix(in srgb, ${glowColor} 40%, transparent)`
						: 'inset 0 1px 2px rgba(0,0,0,0.18), inset 0 0 1px rgba(0,0,0,0.12)',
				}}
			/>
		</div>
	)
}
