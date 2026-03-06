import type { Device, DeviceState } from '../../types'

import { PanelButton } from '../ui/panel-button'
import { ReadoutDisplay } from '../ui/readout-display'
import { ToggleBank } from '../ui/toggle-bank'

const MODES = ['heat', 'cool', 'auto', 'off'] as const
type ThermostatMode = (typeof MODES)[number]

const MODE_LED_COLORS: Record<ThermostatMode, string | undefined> = {
	heat: 'rgb(249,115,22)',
	cool: 'rgb(59,130,246)',
	auto: 'rgb(245,158,11)',
	off: undefined,
}

const MODE_OPTIONS = MODES.map((m) => ({
	key: m,
	label: m.toUpperCase(),
	ledColor: MODE_LED_COLORS[m],
}))

interface ThermostatCardProps {
	device: Device
	variant?: 'compact' | 'full'
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

	function setMode(mode: string) {
		if (!onStateChange) return
		void onStateChange(device.id, { mode })
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
						<span className="text-sm text-display-text/50 ml-1">°C</span>
					</span>
					{state.humidity !== undefined && (
						<span className="text-sm text-display-text/50">
							{state.humidity}<span className="text-xs ml-0.5">% RH</span>
						</span>
					)}
				</ReadoutDisplay>
			)}

			{/* ── Target temp stepper ─────────────────────────────────── */}
			{target !== undefined && (
				<div>
					<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">TARGET</span>
					<div className="flex items-center gap-2">
						<PanelButton
							size="sm"
							onPress={() => { void adjustTarget(-0.5) }}
							isDisabled={!device.online}
							aria-label="Decrease target temperature"
						>
							−
						</PanelButton>
						<ReadoutDisplay size="sm" aria-label={`Target: ${target.toFixed(1)}°C`}>
							{target.toFixed(1)}°
						</ReadoutDisplay>
						<PanelButton
							size="sm"
							onPress={() => { void adjustTarget(0.5) }}
							isDisabled={!device.online}
							aria-label="Increase target temperature"
						>
							+
						</PanelButton>
					</div>
				</div>
			)}

			{/* ── Mode toggle bank ────────────────────────────────────── */}
			<ToggleBank
				label="MODE"
				mode="selection"
				options={MODE_OPTIONS}
				value={currentMode}
				onChange={setMode}
				disabled={!device.online}
			/>
		</div>
	)
}
