import { useCallback, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { displayTemp, roundToStep, stepperDelta, type TemperatureUnit } from '../../lib/temperature'
import { usePreferencesStore } from '../../stores/preferences-store'
import type { Device, DeviceState } from '../../types'
import { PanelButton } from '../ui/panel-button'
import { TransportKeyBank } from '../ui/transport-key-bank'
import { TwoPositionToggle } from '../ui/two-position-toggle'

// ── Constants ─────────────────────────────────────────────────────────────

type ThermostatMode = 'heat' | 'cool' | 'auto' | 'off'

const MODES: ThermostatMode[] = ['heat', 'cool', 'auto', 'off']

const MODE_LABELS: Record<ThermostatMode, string> = {
	heat: 'HEATING',
	cool: 'COOLING',
	auto: 'AUTO',
	off: 'OFF',
}

const MODE_COLORS: Record<ThermostatMode, string> = {
	heat: 'rgb(249,115,22)',
	cool: 'rgb(59,130,246)',
	auto: 'rgb(52,211,153)',
	off: '#78716c',
}

const MODE_GLOW: Record<ThermostatMode, string> = {
	heat: 'rgba(249,115,22,0.5)',
	cool: 'rgba(59,130,246,0.5)',
	auto: 'rgba(52,211,153,0.5)',
	off: 'none',
}

const MODE_OPTIONS = MODES.map((m) => ({
	key: m,
	label: m.toUpperCase(),
	ledColor: m === 'off' ? undefined : MODE_COLORS[m],
}))

const TARGET_MIN_C = 7
const TARGET_MAX_C = 35
const BATCH_DEBOUNCE_MS = 600

// text glow for values inside the dark thermal panel
const PANEL_TEXT_GLOW = '0 0 8px rgba(250,240,220,0.25), 0 0 16px rgba(250,240,220,0.08)'

function clampTarget(celsius: number): number {
	return Math.max(TARGET_MIN_C, Math.min(TARGET_MAX_C, celsius))
}

// mercury fill: map celsius to 0-1 within the thermostat range
function mercuryFill(tempCelsius: number | undefined): number {
	if (tempCelsius === undefined) return 0
	return Math.max(0, Math.min(1, (tempCelsius - TARGET_MIN_C) / (TARGET_MAX_C - TARGET_MIN_C)))
}

// ── Props ─────────────────────────────────────────────────────────────────

interface ThermostatCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function ThermostatCard({
	device,
	variant = 'compact',
	onStateChange,
}: Readonly<ThermostatCardProps>) {
	const unit = usePreferencesStore((s) => s.temperatureUnit)

	if (variant === 'full') {
		return <ThermostatFull device={device} unit={unit} onStateChange={onStateChange} />
	}
	return <ThermostatCompact device={device} unit={unit} onStateChange={onStateChange} />
}

// ── Batched state hook ────────────────────────────────────────────────────
// collects mode + target changes and sends one combined API call after idle

function useBatchedThermostat(
	device: Device,
	onStateChange: ((deviceId: string, state: Partial<DeviceState>) => Promise<void>) | undefined,
) {
	const [localTarget, setLocalTarget] = useState<number | null>(null)
	const [localMode, setLocalMode] = useState<string | null>(null)
	const pendingRef = useRef<Partial<DeviceState>>({})
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const activeTarget = localTarget ?? device.state.targetTemperature ?? 21
	const activeMode = (localMode ?? device.state.mode ?? 'off') as ThermostatMode

	const flush = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = null
		const batch = { ...pendingRef.current }
		pendingRef.current = {}
		if (Object.keys(batch).length > 0) {
			void onStateChange?.(device.id, batch)
		}
	}, [device.id, onStateChange])

	const scheduleFlush = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(flush, BATCH_DEBOUNCE_MS)
	}, [flush])

	const adjustTarget = useCallback(
		(delta: number, unit: TemperatureUnit) => {
			const current = localTarget ?? device.state.targetTemperature ?? 21
			const clamped = clampTarget(roundToStep(current + delta, unit))
			setLocalTarget(clamped)
			pendingRef.current.targetTemperature = clamped
			scheduleFlush()
		},
		[localTarget, device.state.targetTemperature, scheduleFlush],
	)

	const setMode = useCallback(
		(mode: string) => {
			setLocalMode(mode)
			pendingRef.current.mode = mode
			scheduleFlush()
		},
		[scheduleFlush],
	)

	return { activeTarget, activeMode, adjustTarget, setMode }
}

// ── Compact card ──────────────────────────────────────────────────────────

function ThermostatCompact({
	device,
	unit,
	onStateChange,
}: Readonly<{
	device: Device
	unit: TemperatureUnit
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}>) {
	const state = device.state
	const isOffline = !device.online
	const { activeTarget, activeMode, adjustTarget, setMode } = useBatchedThermostat(
		device,
		onStateChange,
	)
	const hasTarget = state.targetTemperature !== undefined

	return (
		<div
			className="flex items-stretch gap-2.5"
			role="status"
			aria-label={buildPanelLabel(
				state.temperature,
				state.humidity,
				unit,
				hasTarget ? activeTarget : undefined,
				isOffline ? 'OFFLINE' : MODE_LABELS[activeMode],
			)}
		>
			<MercuryColumn temp={state.temperature} unit={unit} mode={activeMode} isOffline={isOffline} />

			<div className="flex-1 min-w-0 space-y-2">
				<ReadoutPanel
					temp={state.temperature}
					humidity={state.humidity}
					unit={unit}
					targetTemp={hasTarget ? activeTarget : undefined}
					mode={activeMode}
					isOffline={isOffline}
				/>

				{!isOffline && (
					<div className="flex items-center gap-2">
						<TransportKeyBank
							label=""
							options={MODE_OPTIONS}
							value={activeMode}
							onChange={setMode}
							disabled={isOffline}
						/>
						{hasTarget && (
							<div className="flex items-center gap-1 ml-auto">
								<PanelButton
									size="sm"
									className="h-8"
									onPress={() => adjustTarget(-stepperDelta(unit), unit)}
									aria-label="Decrease target"
								>
									−
								</PanelButton>
								<PanelButton
									size="sm"
									className="h-8"
									onPress={() => adjustTarget(stepperDelta(unit), unit)}
									aria-label="Increase target"
								>
									+
								</PanelButton>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

// ── Full view ─────────────────────────────────────────────────────────────

function ThermostatFull({
	device,
	unit,
	onStateChange,
}: Readonly<{
	device: Device
	unit: TemperatureUnit
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}>) {
	const state = device.state
	const isOffline = !device.online
	const setUnit = usePreferencesStore((s) => s.setTemperatureUnit)
	const { activeTarget, activeMode, adjustTarget, setMode } = useBatchedThermostat(
		device,
		onStateChange,
	)
	const isDisabled = isOffline

	return (
		<div className="flex gap-3">
			{/* mercury column — spans full dialog height */}
			<MercuryColumn temp={state.temperature} unit={unit} mode={activeMode} isOffline={isOffline} />

			{/* controls stack */}
			<div className="flex-1 min-w-0 space-y-3">
				<ReadoutPanel
					temp={state.temperature}
					humidity={state.humidity}
					unit={unit}
					targetTemp={state.targetTemperature !== undefined ? activeTarget : undefined}
					mode={activeMode}
					isOffline={isOffline}
				/>

				{state.targetTemperature !== undefined && (
					<div>
						<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block">
							TARGET
						</span>
						<div className="flex items-center gap-2">
							<PanelButton
								size="sm"
								onPress={() => adjustTarget(-stepperDelta(unit), unit)}
								isDisabled={isDisabled}
								aria-label="Decrease target"
							>
								−
							</PanelButton>
							<div
								className="flex-1 flex items-center justify-center font-ioskeley text-sm tracking-tight px-2 py-1 rounded-md text-display-text"
								style={{
									background: 'linear-gradient(180deg, #2e2d27 0%, #272620 50%, #23221c 100%)',
									border: '1px solid #1a1914',
									boxShadow:
										'0 1px 0 rgba(255,255,255,0.3), inset 0 4px 10px rgba(0,0,0,0.7), inset 0 1px 4px rgba(0,0,0,0.5)',
									textShadow: PANEL_TEXT_GLOW,
								}}
								aria-label={`Target: ${displayTemp(activeTarget, unit)}°${unit}`}
							>
								{displayTemp(activeTarget, unit)}°{unit}
							</div>
							<PanelButton
								size="sm"
								onPress={() => adjustTarget(stepperDelta(unit), unit)}
								isDisabled={isDisabled}
								aria-label="Increase target"
							>
								+
							</PanelButton>
						</div>
					</div>
				)}

				<TransportKeyBank
					label="MODE"
					options={MODE_OPTIONS}
					value={activeMode}
					onChange={setMode}
					disabled={isDisabled}
				/>

				<TwoPositionToggle
					label="UNIT"
					options={['°F', '°C'] as const}
					value={unit === 'F' ? '°F' : '°C'}
					onChange={(v) => setUnit(v === '°F' ? 'F' : 'C')}
				/>
			</div>
		</div>
	)
}

// ── Mercury Column ────────────────────────────────────────────────────────
// standalone vertical gauge — its own ReadoutDisplay-material instrument

function MercuryColumn({
	temp,
	unit,
	mode,
	isOffline,
}: Readonly<{
	temp: number | undefined
	unit: TemperatureUnit
	mode: ThermostatMode
	isOffline: boolean
}>) {
	const fill = mercuryFill(temp)
	const isOff = mode === 'off'
	const fillColor = isOffline || isOff ? '#57534e' : MODE_COLORS[mode]
	const fillGlow = isOffline || isOff ? 'none' : MODE_GLOW[mode]

	const maxLabel = unit === 'F' ? '95' : '35'
	const minLabel = unit === 'F' ? '45' : '7'

	return (
		<div className="flex flex-col items-center gap-0.5 shrink-0 self-stretch">
			{/* max label */}
			<span className="font-michroma text-[7px] text-stone-400 tracking-wider">{maxLabel}°</span>

			{/* gauge tube */}
			<div
				className="relative w-3.5 rounded-full overflow-hidden flex-1"
				style={{
					background: 'linear-gradient(180deg, #2e2d27 0%, #272620 50%, #23221c 100%)',
					border: '1px solid #1a1914',
					boxShadow:
						'0 1px 0 rgba(255,255,255,0.3), inset 0 4px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(0,0,0,0.5), inset -1px 0 3px rgba(0,0,0,0.15), inset 1px 0 3px rgba(0,0,0,0.15)',
				}}
				role="meter"
				aria-valuemin={TARGET_MIN_C}
				aria-valuemax={TARGET_MAX_C}
				aria-valuenow={temp}
				aria-label="Temperature level"
			>
				{/* glass highlight */}
				<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
				{/* mercury fill — anchored to bottom */}
				<div
					className="absolute inset-x-px bottom-px rounded-full transition-all duration-500"
					style={{
						height: `${Math.max(8, fill * 100)}%`,
						background: `linear-gradient(to top, ${fillColor}, color-mix(in srgb, ${fillColor} 70%, white))`,
						boxShadow:
							fillGlow !== 'none'
								? `0 0 6px ${fillGlow}, inset 0 1px 2px rgba(255,255,255,0.2)`
								: 'none',
					}}
				/>
			</div>

			{/* min label */}
			<span className="font-michroma text-[7px] text-stone-400 tracking-wider">{minLabel}°</span>
		</div>
	)
}

// ── Readout Panel ─────────────────────────────────────────────────────────
// dark glass instrument readout — content-sized, never stretches

function ReadoutPanel({
	temp,
	humidity,
	unit,
	targetTemp,
	mode,
	isOffline,
}: Readonly<{
	temp: number | undefined
	humidity: number | undefined
	unit: TemperatureUnit
	targetTemp: number | undefined
	mode: ThermostatMode
	isOffline: boolean
}>) {
	const tempDisplay = temp !== undefined ? displayTemp(temp, unit) : '--.-'
	const targetDisplay = targetTemp !== undefined ? displayTemp(targetTemp, unit) : undefined
	const modeColor = isOffline ? '#57534e' : MODE_COLORS[mode]
	const modeGlow = isOffline ? 'none' : MODE_GLOW[mode]
	const modeLabel = isOffline ? 'OFFLINE' : MODE_LABELS[mode]
	const isOff = mode === 'off'
	const showGlow = !isOffline && !isOff

	return (
		<div
			className="relative flex-1 min-w-0 rounded-lg overflow-hidden px-3 py-2.5"
			style={{
				background: 'linear-gradient(180deg, #1e1d18 0%, #181712 100%)',
				border: '1px solid #0f0e0a',
				boxShadow:
					'inset 0 2px 8px rgba(0,0,0,0.6), inset 0 0 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.15)',
			}}
		>
			{/* crt scanline texture */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					opacity: 0.03,
					backgroundImage:
						'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.5) 1px, rgba(255,255,255,0.5) 2px)',
				}}
			/>
			{/* top edge highlight */}
			<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

			{/* current temp — hero */}
			<div className={cn('flex items-baseline justify-between', isOffline && 'opacity-50')}>
				<span
					className="font-ioskeley text-2xl text-display-text tracking-tight"
					style={{ textShadow: PANEL_TEXT_GLOW }}
				>
					{tempDisplay}
					<span className="text-sm text-display-text/50 ml-1">°{unit}</span>
				</span>
				{humidity !== undefined && (
					<span
						className="font-ioskeley text-sm text-display-text/50"
						style={{ textShadow: PANEL_TEXT_GLOW }}
					>
						{humidity}
						<span className="text-xs ml-0.5">%RH</span>
					</span>
				)}
			</div>

			{/* mode-colored glow line — masked for center-bright edge-feather */}
			<div
				className="my-1.5 h-px"
				style={{
					background: showGlow ? modeColor : 'rgba(255,255,255,0.06)',
					boxShadow: showGlow ? `0 0 6px ${modeGlow}, 0 0 2px ${modeGlow}` : 'none',
					maskImage: 'linear-gradient(to right, transparent, white 20%, white 80%, transparent)',
					WebkitMaskImage:
						'linear-gradient(to right, transparent, white 20%, white 80%, transparent)',
				}}
			/>

			{/* mode LED + label + target */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<div
						className="w-1.5 h-1.5 rounded-full shrink-0"
						style={{
							background: modeColor,
							boxShadow: showGlow ? `0 0 4px ${modeGlow}, 0 0 8px ${modeGlow}` : 'none',
						}}
					/>
					<span
						className="font-michroma text-[9px] uppercase tracking-wider"
						style={{ color: modeColor }}
					>
						{modeLabel}
					</span>
				</div>
				{targetDisplay !== undefined && !isOffline && (
					<span
						className="font-ioskeley text-sm text-display-text/60"
						style={{ textShadow: PANEL_TEXT_GLOW }}
					>
						<span className="font-michroma text-[8px] text-display-text/35 tracking-wider mr-1.5">
							TGT
						</span>
						{targetDisplay}°
					</span>
				)}
			</div>
		</div>
	)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildPanelLabel(
	temp: number | undefined,
	humidity: number | undefined,
	unit: TemperatureUnit,
	targetTemp: number | undefined,
	modeLabel: string,
): string {
	const parts: string[] = []
	if (temp !== undefined && Number.isFinite(temp)) {
		parts.push(`Current temperature: ${displayTemp(temp, unit)}°${unit}`)
	}
	if (targetTemp !== undefined && Number.isFinite(targetTemp)) {
		parts.push(`Target: ${displayTemp(targetTemp, unit)}°${unit}`)
	}
	parts.push(`Mode: ${modeLabel}`)
	if (humidity !== undefined) {
		parts.push(`Humidity: ${humidity}%`)
	}
	return parts.join(', ') || 'Temperature unavailable'
}
