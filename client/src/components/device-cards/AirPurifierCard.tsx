import type { Device, DeviceState } from '../../types'
import { ReadoutDisplay } from '../ui/readout-display'
import { SteppedRadialDial } from '../ui/stepped-radial-dial'

// ── AQI severity levels ─────────────────────────────────────────────────

const AQI_LEVELS = [
	{ max: 1, label: 'GOOD', css: '#34d399' },
	{ max: 2, label: 'FAIR', css: '#facc15' },
	{ max: 4, label: 'POOR', css: '#fb923c' },
	{ max: Infinity, label: 'HAZ', css: '#f87171' },
] as const

// AQI meter: 4 segments, each has its own color (bottom=green, top=red)
// every segment always shows its color — lit segments glow, unlit are dimmed
const AQI_SEGMENT_COLORS = [
	{ color: '#34d399', glow: 'rgba(52,211,153,0.6)', dim: 'rgba(52,211,153,0.12)' },
	{ color: '#facc15', glow: 'rgba(250,204,21,0.5)', dim: 'rgba(250,204,21,0.10)' },
	{ color: '#fb923c', glow: 'rgba(251,146,60,0.5)', dim: 'rgba(251,146,60,0.08)' },
	{ color: '#f87171', glow: 'rgba(248,113,113,0.5)', dim: 'rgba(248,113,113,0.08)' },
] as const

// ── Filter meter: 10 segments, gradient from red (bottom) → green (top) ─

const FILTER_SEGMENT_COUNT = 10

// gradient: bottom segments = red/orange (low filter life), top = green (healthy)
const FILTER_GRADIENT = [
	{ color: '#f87171', glow: 'rgba(248,113,113,0.5)', dim: 'rgba(248,113,113,0.08)' },
	{ color: '#f87171', glow: 'rgba(248,113,113,0.5)', dim: 'rgba(248,113,113,0.08)' },
	{ color: '#fb923c', glow: 'rgba(251,146,60,0.5)', dim: 'rgba(251,146,60,0.08)' },
	{ color: '#fbbf24', glow: 'rgba(251,191,36,0.5)', dim: 'rgba(251,191,36,0.08)' },
	{ color: '#fbbf24', glow: 'rgba(251,191,36,0.5)', dim: 'rgba(251,191,36,0.08)' },
	{ color: '#a3e635', glow: 'rgba(163,230,53,0.5)', dim: 'rgba(163,230,53,0.08)' },
	{ color: '#34d399', glow: 'rgba(52,211,153,0.5)', dim: 'rgba(52,211,153,0.08)' },
	{ color: '#34d399', glow: 'rgba(52,211,153,0.5)', dim: 'rgba(52,211,153,0.08)' },
	{ color: '#34d399', glow: 'rgba(52,211,153,0.5)', dim: 'rgba(52,211,153,0.08)' },
	{ color: '#34d399', glow: 'rgba(52,211,153,0.5)', dim: 'rgba(52,211,153,0.08)' },
] as const

// ── Fan speed steps ─────────────────────────────────────────────────────

const FAN_STEPS = [
	{ label: 'SLP', value: 20 },
	{ label: '1', value: 40 },
	{ label: '2', value: 60 },
	{ label: '3', value: 80 },
	{ label: 'AUTO', value: 0 },
] as const

const FAN_DIAL_OPTIONS = FAN_STEPS.map((s) => ({ key: String(s.value), label: s.label }))

// ── Helpers ─────────────────────────────────────────────────────────────

function aqiLevel(value: number) {
	return AQI_LEVELS.find((l) => value <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1]
}

function aqiToSegments(airQuality: number): number {
	if (airQuality <= 1) return 1
	if (airQuality <= 2) return 2
	if (airQuality <= 4) return 3
	return 4
}

function fanSpeedToStepValue(speed: number): number {
	let closest: number = FAN_STEPS[0].value
	let minDist = Math.abs(speed - FAN_STEPS[0].value)
	for (let i = 1; i < FAN_STEPS.length; i++) {
		const dist = Math.abs(speed - FAN_STEPS[i].value)
		if (dist < minDist) {
			closest = FAN_STEPS[i].value
			minDist = dist
		}
	}
	return closest
}

function buildReadoutLabel(
	pm25: number | undefined,
	aqiLabelText: string | undefined,
	isOn: boolean,
): string {
	if (pm25 !== undefined) {
		const base = `PM2.5: ${pm25} micrograms per cubic meter`
		return aqiLabelText ? `${base}, air quality: ${aqiLabelText}` : base
	}
	return isOn ? 'Air purifier on' : 'Air purifier off'
}

// ── Component ───────────────────────────────────────────────────────────

interface AirPurifierCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function AirPurifierCard({
	device,
	variant = 'compact',
	onStateChange,
}: Readonly<AirPurifierCardProps>) {
	const state = device.state
	const isOn = state.on ?? false
	const isFull = variant === 'full'

	const aqi = state.airQuality !== undefined ? aqiLevel(state.airQuality) : null
	const litSegments = state.airQuality !== undefined ? aqiToSegments(state.airQuality) : 0
	const activeFanValue = state.fanSpeed !== undefined ? fanSpeedToStepValue(state.fanSpeed) : 0
	const filterLit = state.filterLife !== undefined ? Math.round(state.filterLife / 10) : 0

	const readoutLabel = buildReadoutLabel(state.pm25, aqi?.label, isOn)

	return (
		<div className="space-y-3">
			{/* ── PM2.5 readout with AQI label ────────────────────────── */}
			<ReadoutDisplay
				size="lg"
				glowIntensity={isOn ? 1 : 0}
				aria-label={readoutLabel}
				className="w-full justify-between"
			>
				{isOn ? (
					<>
						{state.pm25 !== undefined ? (
							<span>
								{state.pm25}
								<span className="text-xs text-display-text/50 ml-0.5">ug/m3</span>
							</span>
						) : (
							<span>ON</span>
						)}
						{aqi && (
							<span
								className="text-sm font-michroma"
								style={{ color: aqi.css, textShadow: `0 0 8px ${aqi.css}` }}
							>
								{aqi.label}
							</span>
						)}
					</>
				) : (
					<span className="text-display-text/30">OFF</span>
				)}
			</ReadoutDisplay>

			{/* ── Meter panel — always visible, dimmed when off ── */}
			<MeterPanel
				litAqi={litSegments}
				filterLit={filterLit}
				filterLife={state.filterLife}
				aqi={aqi}
				hasAqi
				hasFilter
				hasFan
				activeFanValue={activeFanValue}
				isFull={isFull}
				onFanChange={(key) => {
					void onStateChange?.(device.id, { fanSpeed: Number(key) })
				}}
				disabled={!device.online || !isOn}
			/>
		</div>
	)
}

// ── Meter panel — matte instrument faceplate ────────────────────────────

interface MeterPanelProps {
	litAqi: number
	filterLit: number
	filterLife: number | undefined
	aqi: { label: string; css: string } | null
	hasAqi: boolean
	hasFilter: boolean
	hasFan: boolean
	activeFanValue: number
	isFull: boolean
	onFanChange: (key: string) => void
	disabled: boolean
}

function MeterPanel({
	litAqi,
	filterLit,
	filterLife,
	aqi,
	hasAqi,
	hasFilter,
	hasFan,
	activeFanValue,
	isFull,
	onFanChange,
	disabled,
}: Readonly<MeterPanelProps>) {
	const isOff = disabled

	return (
		<div
			className="rounded-lg overflow-hidden px-3 py-3"
			style={{
				background: 'linear-gradient(180deg, #1e1d18 0%, #181712 100%)',
				border: '1px solid #0f0e0a',
				boxShadow:
					'inset 0 2px 8px rgba(0,0,0,0.6), inset 0 0 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.15)',
			}}
		>
			<div className="flex items-end justify-between gap-2">
				{/* ── Left: AQI vertical meter ──────────────────────── */}
				{hasAqi && (
					<div className="flex flex-col items-center gap-1 shrink-0">
						<span className="font-michroma text-[8px] uppercase tracking-widest text-display-text/60">
							AQI
						</span>
						<VerticalMeter
							label="Air quality"
							segments={AQI_SEGMENT_COLORS.length}
							lit={litAqi}
							getColor={(i) => AQI_SEGMENT_COLORS[i]}
							off={isOff}
						/>
						{aqi && !isOff ? (
							<span
								className="font-michroma text-[8px] uppercase tracking-wider"
								style={{ color: aqi.css, textShadow: `0 0 6px ${aqi.css}` }}
							>
								{aqi.label}
							</span>
						) : (
							<span className="font-michroma text-[8px] uppercase tracking-wider text-display-text/20">
								&nbsp;
							</span>
						)}
					</div>
				)}

				{/* ── Center: Fan dial ──────────────────────────────── */}
				{hasFan && (
					<div className="flex-1 flex justify-center min-w-0">
						<SteppedRadialDial
							label={isFull ? 'FAN' : ''}
							options={FAN_DIAL_OPTIONS}
							value={String(activeFanValue)}
							onChange={onFanChange}
							disabled={disabled}
						/>
					</div>
				)}

				{/* ── Right: Filter vertical meter ──────────────────── */}
				{hasFilter && (
					<div className="flex flex-col items-center gap-1 shrink-0">
						<span className="font-michroma text-[8px] uppercase tracking-widest text-display-text/60">
							FLTR
						</span>
						<VerticalMeter
							label="Filter life"
							segments={FILTER_SEGMENT_COUNT}
							lit={filterLit}
							getColor={(i) => FILTER_GRADIENT[i]}
							off={isOff}
						/>
						<span className="font-ioskeley text-[10px] text-display-text/60">
							{isOff ? '%' : `${filterLife}%`}
						</span>
					</div>
				)}
			</div>
		</div>
	)
}

// ── Vertical LED meter — stacked horizontal segments ────────────────────

interface SegmentColor {
	color: string
	glow: string
	dim: string
}

const UNLIT_DIM = 'rgba(255,255,255,0.06)'

interface VerticalMeterProps {
	label: string
	segments: number
	lit: number
	getColor: (segIndex: number, totalLit: number) => SegmentColor
	off?: boolean
}

function VerticalMeter({ label, segments, lit, getColor, off }: Readonly<VerticalMeterProps>) {
	// render top-to-bottom, lit fills from bottom
	const segArray = Array.from({ length: segments }, (_, i) => {
		const bottomIndex = segments - 1 - i
		return { isLit: !off && bottomIndex < lit, colorIndex: bottomIndex }
	})

	return (
		<div
			className="flex flex-col gap-[2px]"
			role="meter"
			aria-valuemin={0}
			aria-valuemax={segments}
			aria-valuenow={off ? 0 : lit}
			aria-label={label}
		>
			{segArray.map((seg, i) => {
				const { color, glow, dim } = getColor(seg.colorIndex, lit)
				return (
					<div
						key={i}
						className="w-5 h-1.5 rounded-[1px] transition-all duration-300"
						style={
							seg.isLit
								? {
										background: color,
										boxShadow: `0 0 4px ${glow}, 0 0 1px ${glow}`,
									}
								: {
										background: off ? UNLIT_DIM : dim,
										boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.3)',
									}
						}
					/>
				)
			})}
		</div>
	)
}
