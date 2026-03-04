import { Button } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'
import { ReadoutDisplay } from '../ui/readout-display'

const MODES = ['heat', 'cool', 'auto', 'off'] as const
type ThermostatMode = (typeof MODES)[number]

const MODE_LABELS: Record<ThermostatMode, string> = {
	heat: 'HEAT',
	cool: 'COOL',
	auto: 'AUTO',
	off: 'OFF',
}

const MODE_ARIA_LABELS: Record<ThermostatMode, string> = {
	heat: 'Heat',
	cool: 'Cool',
	auto: 'Auto',
	off: 'Off',
}

// mode-specific active styling
function modeActiveStyle(mode: ThermostatMode): string {
	switch (mode) {
		case 'heat':
			return 'bg-orange-50 text-orange-800 border-orange-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]'
		case 'cool':
			return 'bg-blue-50 text-blue-800 border-blue-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]'
		default:
			return 'bg-amber-50 text-amber-800 border-amber-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]'
	}
}

interface ThermostatCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function ThermostatCard({ device, variant = 'compact', onStateChange }: Readonly<ThermostatCardProps>) {
	const state = device.state
	const currentMode = (state.mode ?? 'auto') as ThermostatMode
	const target = state.targetTemperature
	const isFull = variant === 'full'

	async function adjustTarget(delta: number) {
		if (!onStateChange || target === undefined) return
		await onStateChange(device.id, { targetTemperature: Math.round((target + delta) * 2) / 2 })
	}

	async function setMode(mode: ThermostatMode) {
		if (!onStateChange) return
		await onStateChange(device.id, { mode })
	}

	// build readout aria label
	const readoutParts: string[] = []
	if (state.temperature !== undefined) readoutParts.push(`Current temperature: ${state.temperature.toFixed(1)} degrees Celsius`)
	if (state.humidity !== undefined) readoutParts.push(`Humidity: ${state.humidity}%`)
	const readoutLabel = readoutParts.join(', ') || 'Temperature unavailable'

	return (
		<div className="space-y-3">
			{/* ── Current temp readout ────────────────────────────────── */}
			{state.temperature !== undefined && (
				<ReadoutDisplay size="lg" aria-label={readoutLabel} className="w-full justify-between">
					<span>
						{state.temperature.toFixed(1)}
						<span className="text-sm text-[#faf0dc]/50 ml-1">°C</span>
					</span>
					{state.humidity !== undefined && (
						<span className="text-sm text-[#faf0dc]/50">
							{state.humidity}<span className="text-xs ml-0.5">% RH</span>
						</span>
					)}
				</ReadoutDisplay>
			)}

			{/* ── Target temp ─────────────────────────────────────────── */}
			{target !== undefined && (
				<div className="flex items-center gap-2">
					<span className="font-michroma text-[10px] uppercase tracking-widest text-stone-400 flex-1" aria-label="Target Temperature">TARGET</span>
					<Button
						onPress={() => { void adjustTarget(-0.5) }}
						isDisabled={!device.online}
						className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 text-sm font-medium hover:bg-stone-200 pressed:bg-stone-300 disabled:opacity-40 cursor-default flex items-center justify-center"
					>
						−
					</Button>
					<span className="font-ioskeley text-sm font-semibold text-stone-800 w-14 text-center">
						{target.toFixed(1)}°C
					</span>
					<Button
						onPress={() => { void adjustTarget(0.5) }}
						isDisabled={!device.online}
						className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 text-sm font-medium hover:bg-stone-200 pressed:bg-stone-300 disabled:opacity-40 cursor-default flex items-center justify-center"
					>
						+
					</Button>
				</div>
			)}

			{/* ── Mode buttons (transport-style) ──────────────────────── */}
			<div>
				<span className="font-michroma text-[10px] uppercase tracking-widest text-stone-400 mb-1.5 block" aria-label="Mode">MODE</span>
				<div className="flex gap-1">
					{MODES.map((m) => (
						<Button
							key={m}
							onPress={() => { void setMode(m) }}
							isDisabled={!device.online}
							className={cn(
								'flex-1 font-michroma uppercase tracking-wider cursor-default transition-colors disabled:opacity-40',
								'rounded-md border',
								isFull ? 'py-2 text-[11px]' : 'py-1.5 text-[10px]',
								currentMode === m
									? modeActiveStyle(m)
									: 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100 pressed:bg-stone-200',
							)}
							aria-label={MODE_ARIA_LABELS[m]}
						>
							{MODE_LABELS[m]}
						</Button>
					))}
				</div>
			</div>
		</div>
	)
}
