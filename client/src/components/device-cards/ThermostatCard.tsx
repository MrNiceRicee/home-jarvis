import { Button } from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'
import { ReadoutDisplay } from '../ui/readout-display'

const MODES = ['heat', 'cool', 'auto', 'off'] as const
type ThermostatMode = (typeof MODES)[number]

const MODE_LABELS: Record<ThermostatMode, string> = {
	heat: 'Heat',
	cool: 'Cool',
	auto: 'Auto',
	off: 'Off',
}

interface ThermostatCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function ThermostatCard({ device, onStateChange }: Readonly<ThermostatCardProps>) {
	const state = device.state
	const currentMode = (state.mode ?? 'auto') as ThermostatMode
	const target = state.targetTemperature

	async function adjustTarget(delta: number) {
		if (!onStateChange || target === undefined) return
		await onStateChange(device.id, { targetTemperature: Math.round((target + delta) * 2) / 2 })
	}

	async function setMode(mode: ThermostatMode) {
		if (!onStateChange) return
		await onStateChange(device.id, { mode })
	}

	return (
		<div className="space-y-3">
			{/* Current temp */}
			{state.temperature !== undefined && (
				<div className="flex items-center gap-2">
					<ReadoutDisplay size="lg">
						{state.temperature.toFixed(1)}
						<span className="text-sm text-[#faf0dc]/50 ml-1">°C</span>
					</ReadoutDisplay>
					{state.humidity !== undefined && (
						<span className="text-xs font-commit text-stone-400">{state.humidity}% RH</span>
					)}
				</div>
			)}

			{/* Target temp */}
			{target !== undefined && (
				<div className="flex items-center gap-2">
					<span className="text-xs text-stone-400 flex-1">Target</span>
					<Button
						onPress={() => { void adjustTarget(-0.5) }}
						isDisabled={!device.online}
						className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 text-sm font-medium hover:bg-stone-200 pressed:bg-stone-300 disabled:opacity-40 cursor-default flex items-center justify-center"
					>
						−
					</Button>
					<span className="text-sm font-semibold text-stone-800 w-12 text-center">
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

			{/* Mode pills */}
			<div className="flex gap-1.5 flex-wrap">
				{MODES.map((m) => (
					<Button
						key={m}
						onPress={() => { void setMode(m) }}
						isDisabled={!device.online}
						className={cn(
							'px-2.5 py-1 rounded-full text-xs font-medium cursor-default transition-colors disabled:opacity-40',
							currentMode === m
								? 'bg-blue-600 text-white'
								: 'bg-stone-100 text-stone-600 hover:bg-stone-200 pressed:bg-stone-300',
						)}
					>
						{MODE_LABELS[m]}
					</Button>
				))}
			</div>
		</div>
	)
}
