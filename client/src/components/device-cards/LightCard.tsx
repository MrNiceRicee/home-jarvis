import { useEffect, useState } from 'react'
import {
	Button,
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
	const [toggling, setToggling] = useState(false)
	const [brightness, setBrightness] = useState(state.brightness ?? 100)
	const [colorTemp, setColorTemp] = useState(state.colorTemp ?? 4000)
	const [mode, setMode] = useState<'white' | 'color'>('white')
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
	useEffect(() => { setBrightness(state.brightness ?? 100) }, [state.brightness])
	useEffect(() => { setColorTemp(state.colorTemp ?? 4000) }, [state.colorTemp])
	useEffect(() => {
		if (!state.color) return
		const { r, g, b } = state.color
		try { setPickerColor(parseColor(`rgb(${r}, ${g}, ${b})`)) } catch { /* ignore */ }
	}, [state.color])

	async function handlePowerToggle() {
		if (!onStateChange) return
		setToggling(true)
		try {
			await onStateChange(device.id, { on: !isOn })
		} finally {
			setToggling(false)
		}
	}

	function handleScene(scene: (typeof SCENES)[number]) {
		setColorTemp(scene.colorTemp)
		setBrightness(scene.brightness)
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

	// readout aria-label
	const readoutLabel = buildReadoutLabel(isOn, brightness, showCCT, colorTemp, showColor, pickerColor)

	return (
		<div className="space-y-3">
			{/* ── ReadoutDisplay hero ─────────────────────────────────── */}
			<ReadoutDisplay size="lg" glowIntensity={isOn ? brightness / 100 : 0} aria-label={readoutLabel} className="w-full justify-between">
				{isOn ? (
					<>
						<span>{brightness}<span className="text-xs text-[#faf0dc]/50 ml-0.5">%</span></span>
						<ReadoutSecondary state={state} showCCT={showCCT} showColor={showColor} colorTemp={colorTemp} pickerColor={pickerColor} />
					</>
				) : (
					<span className="text-[#faf0dc]/30">OFF</span>
				)}
			</ReadoutDisplay>

			{/* ── Scene presets (full view, CCT lights) ───────────────── */}
			{isFull && isCCT && device.online && (
				<div>
					<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400 mb-1.5 block" aria-label="Scenes">SCENES</span>
					<div className="flex gap-1 flex-wrap">
						{SCENES.map((scene) => (
							<Button
								key={scene.name}
								onPress={() => handleScene(scene)}
								className="text-2xs font-michroma uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/80 text-stone-600 hover:bg-white border border-stone-200 hover:border-stone-300 transition-colors cursor-default pressed:bg-stone-100"
							>
								{scene.name}
							</Button>
						))}
					</div>
				</div>
			)}

			{/* ── Mode toggle (full view, full-color lights) ──────────── */}
			{isFull && isFullColor && (
				<div className="flex gap-0.5 rounded-full bg-stone-100 p-0.5">
					<Button
						onPress={() => setMode('white')}
						className={cn(
							'flex-1 text-2xs font-michroma uppercase tracking-wider py-1 rounded-full transition-all cursor-default',
							mode === 'white' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500',
						)}
					>
						White
					</Button>
					<Button
						onPress={() => setMode('color')}
						className={cn(
							'flex-1 text-2xs font-michroma uppercase tracking-wider py-1 rounded-full transition-all cursor-default',
							mode === 'color' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500',
						)}
					>
						Color
					</Button>
				</div>
			)}

			{/* ── Brightness fader ──────────────────────────────────── */}
			{state.brightness !== undefined && device.online && (
				<Slider
					value={brightness}
					minValue={0}
					maxValue={100}
					onChange={(v) => { setBrightness(v); pushAccent({ brightness: v }) }}
					onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { brightness: v }) }}
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
									className="z-10 w-3 h-[22px] rounded-[3px] border border-stone-300 cursor-default focus:outline-none relative after:absolute after:content-[''] after:inset-x-[2px] after:top-1/2 after:-translate-y-1/2 after:h-px after:bg-stone-400/40"
									style={{
										top: '38%',
										transform: 'translate(-50%, -50%)',
										backgroundColor: '#d4d0ca',
										backgroundImage: 'linear-gradient(180deg, #e8e4de 0%, #d4d0ca 40%, #c0bcb6 60%, #d4d0ca 100%)',
										boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
									}}
								/>
								<div className="absolute inset-x-0 top-[60%] flex justify-between pointer-events-none">
									{Array.from({ length: 11 }).map((_, i) => (
										<div key={`n${i}`} className={cn('w-px bg-stone-400', i % 5 === 0 ? 'h-2.5' : 'h-1.5')} />
									))}
								</div>
							</>
						)}
					</SliderTrack>
				</Slider>
			)}

			{/* ── CCT fader (compact + full, white mode) ──────────────── */}
			{showCCT && device.online && (
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400">CCT</span>
						<span className="font-ioskeley text-xs" style={{ color: cctTextColor(colorTemp) }}>{colorTemp}K</span>
					</div>

					{/* swatch rail — full view only */}
					{isFull && (
						<div className="flex gap-2 mb-2 justify-center">
							{CCT_SWATCHES.map((k) => (
								<Button
									key={k}
									onPress={() => {
										setColorTemp(k)
										void onStateChange?.(device.id, { colorTemp: k, on: true })
									}}
									style={{
										background: tempToColor(k),
										boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.4)',
									}}
									className={cn(
										'w-6 h-6 rounded-full cursor-default transition-transform hover:scale-110',
										Math.abs(colorTemp - k) < 200
											? 'ring-2 ring-stone-600 ring-offset-1'
											: 'ring-1 ring-white/40',
									)}
									aria-label={`${k}K`}
								/>
							))}
						</div>
					)}

					{/* color temp fader */}
					<Slider
						value={colorTemp}
						minValue={2700}
						maxValue={6500}
						onChange={(v) => { setColorTemp(v); pushAccent({ colorTemp: v }) }}
						onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: v }) }}
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
										className="z-10 w-3 h-[22px] rounded-[3px] border border-stone-300 cursor-default focus:outline-none relative after:absolute after:content-[''] after:inset-x-[2px] after:top-1/2 after:-translate-y-1/2 after:h-px after:bg-stone-400/40"
										style={{
											top: '38%',
											transform: 'translate(-50%, -50%)',
											backgroundColor: '#d4d0ca',
										backgroundImage: 'linear-gradient(180deg, #e8e4de 0%, #d4d0ca 40%, #c0bcb6 60%, #d4d0ca 100%)',
											boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
										}}
									/>
									<div className="absolute inset-x-0 top-[60%] pointer-events-none">
										{CCT_SWATCHES.map((k) => {
											const pct = ((k - 2700) / (6500 - 2700)) * 100
											const isEndpoint = k === 2700 || k === 6500
											return <div key={k} className={cn('absolute w-px bg-stone-400', isEndpoint ? 'h-2.5' : 'h-1.5')} style={{ left: `${pct}%` }} />
										})}
									</div>
								</>
							)}
						</SliderTrack>
					</Slider>
				</div>
			)}

			{/* ── Color mode (full view, RGB / full-color lights) ─────── */}
			{isFull && showColor && device.online && (
				<div className="flex flex-col items-center gap-2">
					{/* color wheel with saturation/brightness area centered inside */}
					<ColorPicker value={pickerColor} onChange={(c) => {
						setPickerColor(c)
						const rgb = c.toFormat('rgb')
						pushAccent({ color: {
							r: Math.round(rgb.getChannelValue('red')),
							g: Math.round(rgb.getChannelValue('green')),
							b: Math.round(rgb.getChannelValue('blue')),
						} })
					}}>
						<div className="relative" style={{ width: 160, height: 160 }}>
							<ColorWheel outerRadius={80} innerRadius={60} onChangeEnd={(c) => { onAccentChange?.(null); commitPickerColor(c) }}>
								<ColorWheelTrack />
								<ColorThumb
									className="w-4 h-4 rounded-full ring-2 ring-white"
									style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }}
								/>
							</ColorWheel>
							<ColorArea
								colorSpace="hsb"
								xChannel="saturation"
								yChannel="brightness"
								className="rounded-lg"
								onChangeEnd={(c) => { onAccentChange?.(null); commitPickerColor(c) }}
								style={{
									width: 84,
									height: 84,
									position: 'absolute',
									top: 'calc(50% - 42px)',
									left: 'calc(50% - 42px)',
								}}
							>
								<ColorThumb
									className="w-4 h-4 rounded-full ring-2 ring-white"
									style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }}
								/>
							</ColorArea>
						</div>
					</ColorPicker>

					{/* preset dots + hex input */}
					<div className="flex items-center gap-1.5">
						{COLOR_PRESETS.map((preset) => (
							<Button
								key={preset.label}
								onPress={() => handleColorPreset(preset.value)}
								style={{
									background: `rgb(${preset.value.r} ${preset.value.g} ${preset.value.b})`,
									boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
								}}
								className="w-5 h-5 rounded-full ring-1 ring-white/40 cursor-default hover:scale-110 transition-transform"
								aria-label={preset.label}
							/>
						))}
						<ColorPicker
							value={pickerColor}
							onChange={(c) => { setPickerColor(c); commitPickerColor(c) }}
						>
							<ColorField className="ml-1">
								<Input
									className="w-16 text-xs border border-stone-200 rounded-lg px-1.5 py-0.5 font-ioskeley text-stone-600 focus:outline-none focus:border-blue-400"
									aria-label="Hex color"
								/>
							</ColorField>
						</ColorPicker>
					</div>
				</div>
			)}

			{/* ── Power push-button ──────────────────────────────────── */}
			{device.online && (
				<Button
					onPress={() => { void handlePowerToggle() }}
					isDisabled={toggling}
					className={cn(
						'w-full flex items-center justify-center gap-2 py-1.5 text-2xs font-michroma uppercase tracking-wider',
						'rounded-md border cursor-default disabled:opacity-40',
						'transition-shadow duration-100',
						isOn
							? 'bg-stone-200 text-stone-700 border-stone-300 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]'
							: 'bg-stone-50 text-stone-500 border-stone-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
						'pressed:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]',
					)}
				>
					<span
						className={cn('w-2 h-2 rounded-full transition-all', isOn ? 'bg-emerald-400' : 'bg-stone-400')}
						style={isOn ? { boxShadow: '0 0 4px rgba(52,211,153,0.7), 0 0 10px rgba(52,211,153,0.3)' } : undefined}
					/>
					{toggling ? '...' : 'POWER'}
				</Button>
			)}
		</div>
	)
}

// secondary readout value — CCT or color dot
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

// darken tempToColor for readable text on light backgrounds
function cctTextColor(kelvin: number): string {
	return `color-mix(in srgb, ${tempToColor(kelvin)} 60%, #1c1917)`
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
