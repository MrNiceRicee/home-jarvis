import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'
import { ReadoutDisplay } from '../ui/readout-display'
import { SteppedRadialDial } from '../ui/stepped-radial-dial'

const AQI_LEVELS = [
	{ max: 1, label: 'Good', color: 'text-emerald-700 bg-emerald-50', barColor: 'bg-emerald-400' },
	{ max: 2, label: 'Fair', color: 'text-yellow-700 bg-yellow-50', barColor: 'bg-yellow-400' },
	{ max: 4, label: 'Poor', color: 'text-orange-700 bg-orange-50', barColor: 'bg-orange-400' },
	{ max: 5, label: 'Hazardous', color: 'text-red-700 bg-red-50', barColor: 'bg-red-400' },
] as const

const AQI_SEGMENT_COLORS = ['bg-emerald-400', 'bg-yellow-400', 'bg-orange-400', 'bg-red-400'] as const

// discrete fan speed levels — maps to VeSync Core 300S capabilities
const FAN_STEPS = [
	{ label: 'AUTO', value: 0 },
	{ label: 'SLP', value: 20 },
	{ label: '1', value: 40 },
	{ label: '2', value: 60 },
	{ label: '3', value: 80 },
] as const

const FAN_DIAL_OPTIONS = FAN_STEPS.map((s) => ({ key: String(s.value), label: s.label }))

function aqiLabel(value: number): { label: string; color: string } {
	return AQI_LEVELS.find((l) => value <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1]
}

function filterLifeColor(life: number): string {
	if (life > 30) return 'bg-emerald-400'
	if (life > 10) return 'bg-amber-400'
	return 'bg-red-400'
}

// map continuous fan speed to nearest discrete step value
function fanSpeedToStepValue(speed: number): number {
	let closest: number = FAN_STEPS[0].value
	let minDist = Math.abs(speed - FAN_STEPS[0].value)
	for (let i = 1; i < FAN_STEPS.length; i++) {
		const dist = Math.abs(speed - FAN_STEPS[i].value)
		if (dist < minDist) { closest = FAN_STEPS[i].value; minDist = dist }
	}
	return closest
}

function aqiToSegments(airQuality: number): number {
	if (airQuality <= 1) return 1
	if (airQuality <= 2) return 2
	if (airQuality <= 4) return 3
	return 4
}

function buildReadoutLabel(pm25: number | undefined, aqiLabelText: string | undefined, isOn: boolean): string {
	if (pm25 !== undefined) {
		const base = `PM2.5: ${pm25} micrograms per cubic meter`
		return aqiLabelText ? `${base}, air quality: ${aqiLabelText}` : base
	}
	return isOn ? 'Air purifier on' : 'Air purifier off'
}

interface AirPurifierCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function AirPurifierCard({ device, variant = 'compact', onStateChange }: Readonly<AirPurifierCardProps>) {
	const state = device.state
	const isOn = state.on ?? false
	const isFull = variant === 'full'

	const aqi = state.airQuality !== undefined ? aqiLabel(state.airQuality) : null
	const litSegments = state.airQuality !== undefined ? aqiToSegments(state.airQuality) : 0
	const activeFanValue = state.fanSpeed !== undefined ? fanSpeedToStepValue(state.fanSpeed) : 0

	const readoutLabel = buildReadoutLabel(state.pm25, aqi?.label, isOn)

	return (
		<div className="space-y-3">
			{/* ── PM2.5 readout + AQI badge ──────────────────────────── */}
			<div className="flex items-center justify-between gap-2">
				{state.pm25 !== undefined ? (
					<ReadoutDisplay size="lg" glowIntensity={isOn ? 1 : 0} aria-label={readoutLabel}>
						{state.pm25}
						<span className="text-xs text-[#faf0dc]/50 ml-1.5">ug/m3</span>
					</ReadoutDisplay>
				) : (
					<span className={cn('text-2xs font-michroma uppercase tracking-wider', isOn ? 'text-blue-600' : 'text-stone-400')}>
						{isOn ? 'On' : 'Off'}
					</span>
				)}
				{aqi && (
					<span className={cn('text-2xs font-michroma uppercase tracking-wider px-2 py-0.5 rounded-full', aqi.color)}>
						{aqi.label}
					</span>
				)}
			</div>

			{/* ── Segmented AQI bar ──────────────────────────────────── */}
			{state.airQuality !== undefined && (
				<div>
					<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block" aria-label="Air Quality Index">AQI</span>
					<div className="flex gap-1" role="meter" aria-label={`Air quality level: ${aqi?.label ?? 'unknown'}`} aria-valuemin={1} aria-valuemax={4} aria-valuenow={litSegments}>
						{AQI_SEGMENT_COLORS.map((segColor, i) => (
							<div
								key={segColor}
								className={cn(
									'h-2 flex-1 rounded-sm transition-colors',
									i < litSegments ? segColor : 'bg-stone-200/60',
								)}
							/>
						))}
					</div>
				</div>
			)}

			{/* ── Filter life bar ────────────────────────────────────── */}
			{state.filterLife !== undefined && (
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400" aria-label="Filter Life">FILTER</span>
						<span className="font-ioskeley text-xs text-stone-500">{state.filterLife}%</span>
					</div>
					<div className="h-1 bg-stone-200/80 rounded-full overflow-hidden">
						<div
							className={cn('h-full rounded-full transition-all', filterLifeColor(state.filterLife))}
							style={{ width: `${state.filterLife}%` }}
						/>
					</div>
				</div>
			)}

			{/* ── Fan speed radial dial (full view only) ──────────────── */}
			{isFull && state.fanSpeed !== undefined && device.online && (
				<div className="flex justify-center">
					<SteppedRadialDial
						label="FAN"
						options={FAN_DIAL_OPTIONS}
						value={String(activeFanValue)}
						onChange={(key) => { void onStateChange?.(device.id, { fanSpeed: Number(key) }) }}
						disabled={!device.online}
					/>
				</div>
			)}
		</div>
	)
}
