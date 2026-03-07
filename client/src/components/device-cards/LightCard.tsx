import { useEffect, useState } from 'react'
import {
	ColorArea,
	ColorField,
	ColorPicker,
	ColorThumb,
	ColorWheel,
	ColorWheelTrack,
	Input,
	Label,
	Slider,
	SliderOutput,
	SliderThumb,
	SliderTrack,
	parseColor,
	type Color,
} from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { cn } from '../../lib/cn'
import { CCT_SWATCHES, COLOR_PRESETS, SCENES, tempToColor } from '../../lib/color-utils'
import { ReadoutDisplay } from '../ui/readout-display'
import { ToggleBank } from '../ui/toggle-bank'
import { TwoPositionToggle } from '../ui/two-position-toggle'

const SCENE_OPTIONS = SCENES.map((s) => ({
	key: s.name,
	label: s.name === 'Energize' ? 'ENRG' : s.name.toUpperCase().slice(0, 5),
	ledColor: tempToColor(s.colorTemp),
}))

const COLOR_PRESET_OPTIONS = COLOR_PRESETS.map((p) => ({
	key: p.label,
	label: p.label.slice(0, 3).toUpperCase(),
	ledColor: `rgb(${p.value.r},${p.value.g},${p.value.b})`,
}))

// shared fader thumb gradient — brushed aluminum knob
const FADER_THUMB_STYLE = {
	top: '38%',
	transform: 'translate(-50%, -50%)',
	backgroundColor: '#d4d0ca',
	backgroundImage: 'linear-gradient(180deg, #e8e4de 0%, #d4d0ca 40%, #c0bcb6 60%, #d4d0ca 100%)',
} as const

// brightness detent stops — ruler-graduated heights (endpoints > midpoint > majors > minors)
const BRT_DETENTS: { value: number; height: string }[] = [
	{ value: 0, height: 'h-3.5' },
	{ value: 10, height: 'h-1.5' },
	{ value: 20, height: 'h-2' },
	{ value: 30, height: 'h-1.5' },
	{ value: 40, height: 'h-2' },
	{ value: 50, height: 'h-2.5' },
	{ value: 60, height: 'h-2' },
	{ value: 70, height: 'h-1.5' },
	{ value: 80, height: 'h-2' },
	{ value: 90, height: 'h-1.5' },
	{ value: 100, height: 'h-3.5' },
]

interface LightCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onAccentChange?: (accent: { brightness?: number; colorTemp?: number; color?: { r: number; g: number; b: number } } | null) => void
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function LightCard({ device, variant = 'compact', onAccentChange, onStateChange }: Readonly<LightCardProps>) {
	const state = device.state
	const isOn = state.on ?? false
	const isFull = variant === 'full'

	// light capability detection
	const isCCT = state.colorTemp !== undefined
	const isRGB = state.color !== undefined
	const isFullColor = isCCT && isRGB

	// local UI state
	const [brightness, setBrightness] = useState(state.brightness ?? 100)
	const [colorTemp, setColorTemp] = useState(state.colorTemp ?? 4000)
	const [mode, setMode] = useState<'white' | 'color'>('white')
	const [lastScene, setLastScene] = useState<string | null>(null)
	const [pickerColor, setPickerColor] = useState<Color>(() => {
		if (state.color) {
			const { r, g, b } = state.color
			try { return parseColor(`rgb(${r}, ${g}, ${b})`) } catch { /* fall through */ }
		}
		return parseColor('hsl(0, 100%, 50%)')
	})

	// which panels to show
	const showCCT = isCCT && (!isFullColor || mode === 'white')
	const showColor = isRGB && (!isFullColor || mode === 'color')

	// push live accent to card shell during interaction
	function pushAccent(overrides: { brightness?: number; colorTemp?: number; color?: { r: number; g: number; b: number } }) {
		onAccentChange?.({
			brightness: overrides.brightness ?? brightness,
			colorTemp: showCCT ? (overrides.colorTemp ?? colorTemp) : undefined,
			color: showColor ? colorFromPicker(overrides) : undefined,
		})
	}

	function colorFromPicker(overrides: { color?: { r: number; g: number; b: number } }): { r: number; g: number; b: number } {
		if (overrides.color) return overrides.color
		const rgb = pickerColor.toFormat('rgb')
		return {
			r: Math.round(rgb.getChannelValue('red')),
			g: Math.round(rgb.getChannelValue('green')),
			b: Math.round(rgb.getChannelValue('blue')),
		}
	}

	// sync sliders when SSE pushes new state
	// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
	useEffect(() => { setBrightness(state.brightness ?? 100) }, [state.brightness])
	// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
	useEffect(() => { setColorTemp(state.colorTemp ?? 4000) }, [state.colorTemp])
	useEffect(() => {
		if (!state.color) return
		const { r, g, b } = state.color
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
		try { setPickerColor(parseColor(`rgb(${r}, ${g}, ${b})`)) } catch { /* ignore */ }
	}, [state.color])

	function handleScene(scene: (typeof SCENES)[number]) {
		setColorTemp(scene.colorTemp)
		setBrightness(scene.brightness)
		setLastScene(scene.name)
		void onStateChange?.(device.id, {
			on: true,
			colorTemp: scene.colorTemp,
			brightness: scene.brightness,
		})
	}

	function commitPickerColor(c: Color) {
		const rgb = c.toFormat('rgb')
		void onStateChange?.(device.id, {
			color: {
				r: Math.round(rgb.getChannelValue('red')),
				g: Math.round(rgb.getChannelValue('green')),
				b: Math.round(rgb.getChannelValue('blue')),
			},
			on: true,
		})
	}

	function handleColorPreset(color: { r: number; g: number; b: number }) {
		try {
			const c = parseColor(`rgb(${color.r}, ${color.g}, ${color.b})`)
			setPickerColor(c)
		} catch { /* ignore */ }
		void onStateChange?.(device.id, { color, on: true })
	}

	const readoutLabel = buildReadoutLabel(isOn, brightness, showCCT, colorTemp, showColor, pickerColor)

	return (
		<div className="space-y-3">
			{/* ── ReadoutDisplay hero ─────────────────────────────────── */}
			<ReadoutDisplay size="lg" glowIntensity={1} aria-label={readoutLabel} className="w-full justify-between">
				{isOn ? (
					<>
						<span>{brightness}<span className="text-xs text-display-text/50 ml-0.5">%</span></span>
						<ReadoutSecondary state={state} showCCT={showCCT} showColor={showColor} colorTemp={colorTemp} pickerColor={pickerColor} />
					</>
				) : (
					<span className="text-display-text/30">OFF</span>
				)}
			</ReadoutDisplay>

			{/* ── Scene presets (full view, CCT lights) ───────────────── */}
			{isFull && isCCT && device.online && (
				<ToggleBank
					label="SCENES"
					mode="action"
					options={SCENE_OPTIONS}
					value={lastScene}
					onChange={(key) => {
						const scene = SCENES.find((s) => s.name === key)
						if (scene) handleScene(scene)
					}}
				/>
			)}

			{/* ── Mode toggle (full view, full-color lights) ──────────── */}
			{isFull && isFullColor && (
				<TwoPositionToggle
					label="MODE"
					options={['WHITE', 'COLOR'] as const}
					value={mode === 'white' ? 'WHITE' : 'COLOR'}
					onChange={(v) => setMode(v === 'WHITE' ? 'white' : 'color')}
				/>
			)}

			{/* ── Brightness fader ──────────────────────────────────── */}
			{state.brightness !== undefined && device.online && (
				<BrtFader
					brightness={brightness}
					onChange={(v) => { setBrightness(v); pushAccent({ brightness: v }) }}
					onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { brightness: v }) }}
					onDetent={(v) => { setBrightness(v); onAccentChange?.(null); void onStateChange?.(device.id, { brightness: v, on: true }) }}
				/>
			)}

			{/* ── CCT / Color panels ─────────────────────────────────── */}
			{isFull && isFullColor && device.online ? (
				<div className="grid grid-cols-1 grid-rows-1">
					<div
						className={cn('col-start-1 row-start-1', !showCCT && 'invisible pointer-events-none')}
						inert={!showCCT || undefined}
					>
						<CctFader
							colorTemp={colorTemp}
							onChange={(v) => { setColorTemp(v); pushAccent({ colorTemp: v }) }}
							onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: v }) }}
							onDetent={(k) => { setColorTemp(k); onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: k, on: true }) }}
						/>
					</div>
					<div
						className={cn('col-start-1 row-start-1', !showColor && 'invisible pointer-events-none')}
						inert={!showColor || undefined}
					>
						<ColorPanel
							pickerColor={pickerColor}
							onPickerChange={(c) => {
								setPickerColor(c)
								const rgb = c.toFormat('rgb')
								pushAccent({ color: {
									r: Math.round(rgb.getChannelValue('red')),
									g: Math.round(rgb.getChannelValue('green')),
									b: Math.round(rgb.getChannelValue('blue')),
								} })
							}}
							onPickerCommit={(c) => { onAccentChange?.(null); commitPickerColor(c) }}
							onPreset={handleColorPreset}
							onCommit={(c) => { setPickerColor(c); commitPickerColor(c) }}
						/>
					</div>
				</div>
			) : (
				<>
					{showCCT && device.online && (
						<CctFader
							colorTemp={colorTemp}
							onChange={(v) => { setColorTemp(v); pushAccent({ colorTemp: v }) }}
							onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: v }) }}
							onDetent={(k) => { setColorTemp(k); onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: k, on: true }) }}
						/>
					)}
					{isFull && showColor && device.online && (
						<ColorPanel
							pickerColor={pickerColor}
							onPickerChange={(c) => {
								setPickerColor(c)
								const rgb = c.toFormat('rgb')
								pushAccent({ color: {
									r: Math.round(rgb.getChannelValue('red')),
									g: Math.round(rgb.getChannelValue('green')),
									b: Math.round(rgb.getChannelValue('blue')),
								} })
							}}
							onPickerCommit={(c) => { onAccentChange?.(null); commitPickerColor(c) }}
							onPreset={handleColorPreset}
							onCommit={(c) => { setPickerColor(c); commitPickerColor(c) }}
						/>
					)}
				</>
			)}
		</div>
	)
}

// ── BRT fader with ruler-graduated tappable detents ─────────────────────

interface BrtFaderProps {
	brightness: number
	onChange: (v: number) => void
	onChangeEnd: (v: number) => void
	onDetent: (v: number) => void
}

function BrtFader({ brightness, onChange, onChangeEnd, onDetent }: Readonly<BrtFaderProps>) {
	return (
		<Slider
			value={brightness}
			minValue={0}
			maxValue={100}
			onChange={onChange}
			onChangeEnd={onChangeEnd}
		>
			<div className="flex items-center justify-between mb-1">
				<Label className="font-michroma text-2xs uppercase tracking-widest text-stone-400">BRT</Label>
				<SliderOutput className="font-ioskeley text-xs text-stone-500" />
			</div>
			<SliderTrack className="relative flex items-center h-9 w-full">
				{({ state: s }) => (
					<>
						<div className="absolute inset-x-0 h-1 top-[38%] -translate-y-1/2 rounded-full bg-stone-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" />
						<div
							className="absolute h-1 top-[38%] -translate-y-1/2 rounded-full bg-amber-400"
							style={{ width: `${s.getThumbPercent(0) * 100}%` }}
						/>
						<SliderThumb
							className="z-10 w-3 h-5.5 rounded-[3px] border border-stone-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 shadow-[0_1px_3px_rgba(0,0,0,0.25)] relative after:absolute after:content-[''] after:inset-x-0.5 after:top-1/2 after:-translate-y-1/2 after:h-px after:bg-stone-400/40"
							style={FADER_THUMB_STYLE}
						/>
						<div className="absolute inset-x-0 top-[60%] flex justify-between">
							{BRT_DETENTS.map((d) => (
								<button
									key={d.value}
									type="button"
									onClick={() => onDetent(d.value)}
									className={cn('relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 px-1', d.height)}
									aria-label={`${d.value}%`}
								>
									<div className="w-px h-full bg-stone-500 mx-auto" />
								</button>
							))}
						</div>
					</>
				)}
			</SliderTrack>
		</Slider>
	)
}

// ── CCT fader with tappable detent stops ────────────────────────────────

interface CctFaderProps {
	colorTemp: number
	onChange: (v: number) => void
	onChangeEnd: (v: number) => void
	onDetent: (k: number) => void
}

function CctFader({ colorTemp, onChange, onChangeEnd, onDetent }: Readonly<CctFaderProps>) {
	return (
		<div>
			<div className="flex items-center justify-between mb-1">
				<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400">CCT</span>
				<span className="font-ioskeley text-xs" style={{ color: cctTextColor(colorTemp) }}>{colorTemp}K</span>
			</div>
			<Slider
				value={colorTemp}
				minValue={2700}
				maxValue={6500}
				onChange={onChange}
				onChangeEnd={onChangeEnd}
			>
				<Label className="sr-only">Color Temperature</Label>
				<SliderTrack className="relative flex items-center h-9 w-full">
					{() => (
						<>
							<div
								className="absolute inset-x-0 h-2 top-[38%] -translate-y-1/2 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]"
								style={{
									background: 'linear-gradient(in srgb to right, rgb(255 171 82), rgb(255 236 205), rgb(214 234 255))',
								}}
							/>
							<SliderThumb
								className="z-10 w-3 h-5.5 rounded-[3px] border border-stone-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 shadow-[0_1px_3px_rgba(0,0,0,0.25)] relative after:absolute after:content-[''] after:inset-x-0.5 after:top-1/2 after:-translate-y-1/2 after:h-px after:bg-stone-400/40"
								style={FADER_THUMB_STYLE}
							/>
							<div className="absolute inset-x-0 top-[60%]">
								{CCT_SWATCHES.map((k) => {
									const pct = ((k - 2700) / (6500 - 2700)) * 100
									const isEndpoint = k === 2700 || k === 6500
									return (
										<button
											key={k}
											type="button"
											onClick={() => onDetent(k)}
											className={cn('absolute cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 px-1', isEndpoint ? 'h-3' : 'h-2')}
											style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
											aria-label={`${k}K`}
										>
											<div className="w-px h-full bg-stone-500 mx-auto" />
										</button>
									)
								})}
							</div>
							<div className="absolute inset-x-0 top-[85%]">
								{CCT_SWATCHES.map((k) => {
									const pct = ((k - 2700) / (6500 - 2700)) * 100
									return (
										<span
											key={k}
											className="absolute font-michroma text-2xs text-stone-400 -translate-x-1/2"
											style={{ left: `${pct}%` }}
										>
											{cctDetentLabel(k)}
										</span>
									)
								})}
							</div>
						</>
					)}
				</SliderTrack>
			</Slider>
		</div>
	)
}

// ── Color wheel + presets + hex input ───────────────────────────────────

interface ColorPanelProps {
	pickerColor: Color
	onPickerChange: (c: Color) => void
	onPickerCommit: (c: Color) => void
	onPreset: (color: { r: number; g: number; b: number }) => void
	onCommit: (c: Color) => void
}

function ColorPanel({ pickerColor, onPickerChange, onPickerCommit, onPreset, onCommit }: Readonly<ColorPanelProps>) {
	return (
		<div className="flex flex-col items-center gap-2">
			<ColorPicker value={pickerColor} onChange={onPickerChange}>
				<div className="relative" style={{ width: 160, height: 160 }}>
					<ColorWheel outerRadius={80} innerRadius={60} onChangeEnd={onPickerCommit}>
						<ColorWheelTrack />
						<ColorThumb
							className="w-4 h-4 rounded-full ring-2 ring-white cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
						/>
					</ColorWheel>
					<ColorArea
						colorSpace="hsb"
						xChannel="saturation"
						yChannel="brightness"
						className="rounded-lg"
						onChangeEnd={onPickerCommit}
						style={{
							width: 84,
							height: 84,
							position: 'absolute',
							top: 'calc(50% - 42px)',
							left: 'calc(50% - 42px)',
						}}
					>
						<ColorThumb
							className="w-4 h-4 rounded-full ring-2 ring-white cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
						/>
					</ColorArea>
				</div>
			</ColorPicker>

			<ToggleBank
				label="COLOR"
				mode="action"
				options={COLOR_PRESET_OPTIONS}
				value={null}
				onChange={(key) => {
					const preset = COLOR_PRESETS.find((p) => p.label === key)
					if (preset) onPreset(preset.value)
				}}
			/>

			<ColorPicker
				value={pickerColor}
				onChange={onCommit}
			>
				<ColorField>
					<Input
						className="w-20 bg-display-bg rounded border border-display-border px-2 py-1 font-ioskeley text-xs text-display-text caret-display-text selection:bg-stone-600 outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
						style={{
							boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5), inset 0 0 2px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.2)',
						}}
						aria-label="Hex color"
					/>
				</ColorField>
			</ColorPicker>
		</div>
	)
}

// ── Helper components & utilities ───────────────────────────────────────

function ReadoutSecondary({
	state, showCCT, showColor, colorTemp, pickerColor,
}: Readonly<{
	state: DeviceState
	showCCT: boolean
	showColor: boolean
	colorTemp: number
	pickerColor: Color
}>) {
	if (showCCT && state.colorTemp !== undefined) {
		return <span className="text-base" style={{ color: tempToColor(colorTemp) }}>{colorTemp}<span className="text-xs ml-0.5">K</span></span>
	}
	if (showColor && state.color) {
		const rgb = pickerColor.toFormat('rgb')
		const bg = `rgb(${Math.round(rgb.getChannelValue('red'))} ${Math.round(rgb.getChannelValue('green'))} ${Math.round(rgb.getChannelValue('blue'))})`
		return <span className="w-3 h-3 rounded-full inline-block" style={{ background: bg }} />
	}
	return null
}

function cctTextColor(kelvin: number): string {
	return `color-mix(in srgb, ${tempToColor(kelvin)} 60%, #1c1917)`
}

function cctDetentLabel(k: number): string {
	if (k < 1000) return `${k}`
	if (k < 10000) return k % 1000 === 0 ? `${k / 1000}K` : `${(k / 1000).toFixed(1)}`
	return `${k / 1000}K`
}

function buildReadoutLabel(isOn: boolean, brightness: number, showCCT: boolean, colorTemp: number, showColor: boolean, pickerColor: Color): string {
	if (!isOn) return 'Light off'
	const parts = [`Brightness: ${brightness}%`]
	if (showCCT) parts.push(`Color temperature: ${colorTemp}K`)
	if (showColor) {
		const rgb = pickerColor.toFormat('rgb')
		const hex = `#${Math.round(rgb.getChannelValue('red')).toString(16).padStart(2, '0')}${Math.round(rgb.getChannelValue('green')).toString(16).padStart(2, '0')}${Math.round(rgb.getChannelValue('blue')).toString(16).padStart(2, '0')}`
		parts.push(`Color: ${hex}`)
	}
	return parts.join(', ')
}
