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

interface LightCardProps {
	device: Device
	onAccentChange?: (accent: { brightness?: number; colorTemp?: number; color?: { r: number; g: number; b: number } } | null) => void
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function LightCard({ device, onAccentChange, onStateChange }: Readonly<LightCardProps>) {
	const state = device.state
	const isOn = state.on ?? false

	// Light capability detection
	const isCCT = state.colorTemp !== undefined
	const isRGB = state.color !== undefined
	const isFullColor = isCCT && isRGB

	// Local UI state
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

	// Sync sliders when SSE pushes new state
	useEffect(() => { setBrightness(state.brightness ?? 100) }, [state.brightness])
	useEffect(() => { setColorTemp(state.colorTemp ?? 4000) }, [state.colorTemp])
	useEffect(() => {
		if (!state.color) return
		const { r, g, b } = state.color
		try { setPickerColor(parseColor(`rgb(${r}, ${g}, ${b})`)) } catch { /* ignore */ }
	}, [state.color])

	// Which panels to show
	const showCCT = isCCT && (!isFullColor || mode === 'white')
	const showColor = isRGB && (!isFullColor || mode === 'color')

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

	const powerLabel = isOn ? 'Turn Off' : 'Turn On'
	const buttonLabel = toggling ? '…' : powerLabel

	return (
		<div className={cn('rounded-lg p-2 transition-colors', isOn ? 'bg-amber-50/30' : 'bg-stone-50')}>
			{/* ── Power row ─────────────────────────────────────────────── */}
			<div className="flex items-center justify-between mb-2">
				<span className={cn('text-xs font-medium', isOn ? 'text-amber-600' : 'text-stone-400')}>
					{isOn ? 'On' : 'Off'}
					{state.brightness !== undefined && isOn && (
						<span className="text-stone-400"> · {brightness}%</span>
					)}
				</span>
				{device.online && (
					<Button
						onPress={() => { void handlePowerToggle() }}
						isDisabled={toggling}
						className={cn(
							'text-xs px-4 py-1.5 rounded-full border transition-colors cursor-default disabled:opacity-40',
							isOn
								? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300 pressed:bg-amber-200'
								: 'bg-stone-100 text-stone-700 hover:bg-stone-200 border-stone-300 pressed:bg-stone-300',
						)}
					>
						{buttonLabel}
					</Button>
				)}
			</div>

			{/* ── Scene presets (CCT lights) ─────────────────────────────── */}
			{isCCT && device.online && (
				<div className="flex gap-1 mb-2 flex-wrap">
					{SCENES.map((scene) => (
						<button
							key={scene.name}
							type="button"
							onClick={() => handleScene(scene)}
							className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-stone-600 hover:bg-white border border-stone-200 hover:border-stone-300 transition-colors"
							style={{
								boxShadow: '0 1px 3px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.6)',
							}}
						>
							{scene.name}
						</button>
					))}
				</div>
			)}

			{/* ── Mode toggle (full-color lights only) ──────────────────── */}
			{isFullColor && (
				<div className="flex gap-0.5 mb-2 rounded-full bg-stone-100 p-0.5">
					<button
						type="button"
						onClick={() => setMode('white')}
						className={cn(
							'flex-1 text-xs py-1 rounded-full transition-all',
							mode === 'white' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500',
						)}
					>
						White
					</button>
					<button
						type="button"
						onClick={() => setMode('color')}
						className={cn(
							'flex-1 text-xs py-1 rounded-full transition-all',
							mode === 'color' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500',
						)}
					>
						Color
					</button>
				</div>
			)}

			{/* ── CCT controls (white mode / CCT-only) ──────────────────── */}
			{showCCT && device.online && (
				<>
					{/* Swatch rail */}
					<div className="flex gap-2 mb-2 justify-center">
						{CCT_SWATCHES.map((k) => (
							<button
								key={k}
								type="button"
								onClick={() => {
									setColorTemp(k)
									void onStateChange?.(device.id, { colorTemp: k, on: true })
								}}
								style={{
									background: tempToColor(k),
									boxShadow:
										'0 2px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.4)',
								}}
								className={cn(
									'w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110',
									Math.abs(colorTemp - k) < 200
										? 'ring-2 ring-stone-600 ring-offset-1'
										: 'ring-1 ring-white/40',
								)}
								aria-label={`${k}K`}
							/>
						))}
					</div>

					{/* Color temp slider — oklab interpolation avoids green hue artifact */}
					<Slider
						value={colorTemp}
						minValue={2700}
						maxValue={6500}
						onChange={(v) => { setColorTemp(v); pushAccent({ colorTemp: v }) }}
						onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { colorTemp: v }) }}
					>
						<div className="flex items-center justify-between mb-1">
							<Label className="text-xs text-stone-500">Color Temp</Label>
							<SliderOutput className="text-xs text-stone-400">
								{({ state: s }) => `${s.values[0]}K`}
							</SliderOutput>
						</div>
						<SliderTrack className="relative flex items-center h-6 w-full">
							{() => (
								<>
									<div
										className="absolute inset-x-0 h-3 top-1/2 -translate-y-1/2 rounded-full"
										style={{
											background:
												'linear-gradient(in srgb to right, rgb(255 171 82), rgb(255 236 205), rgb(214 234 255))',
										}}
									/>
									<SliderThumb
										className="w-5 h-5 rounded-full ring-1 ring-white/50 cursor-default focus:outline-none"
										style={{
											top: '50%',
											transform: 'translate(-50%, -50%)',
											background:
												'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.65) 0%, transparent 55%), oklch(91% 0.02 90)',
											boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
										}}
									/>
								</>
							)}
						</SliderTrack>
					</Slider>
				</>
			)}

			{/* ── Color mode (RGB / full-color lights) ──────────────────── */}
			{showColor && device.online && (
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
									style={{
										boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
									}}
								/>
							</ColorArea>
						</div>
					</ColorPicker>

					{/* preset dots + hex input */}
					<div className="flex items-center gap-1.5">
						{COLOR_PRESETS.map((preset) => (
							<button
								key={preset.label}
								type="button"
								onClick={() => handleColorPreset(preset.value)}
								style={{
									background: `rgb(${preset.value.r} ${preset.value.g} ${preset.value.b})`,
									boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
								}}
								className="w-5 h-5 rounded-full ring-1 ring-white/40 cursor-pointer hover:scale-110 transition-transform"
								aria-label={preset.label}
							/>
						))}
						<ColorPicker
							value={pickerColor}
							onChange={(c) => { setPickerColor(c); commitPickerColor(c) }}
						>
							<ColorField className="ml-1">
								<Input
									className="w-16 text-xs border border-stone-200 rounded-lg px-1.5 py-0.5 font-mono text-stone-600 focus:outline-none focus:border-blue-400"
									aria-label="Hex color"
								/>
							</ColorField>
						</ColorPicker>
					</div>
				</div>
			)}

			{/* ── Brightness slider ─────────────────────────────────────── */}
			{state.brightness !== undefined && device.online && (
				<Slider
					value={brightness}
					minValue={0}
					maxValue={100}
					onChange={(v) => { setBrightness(v); pushAccent({ brightness: v }) }}
					onChangeEnd={(v) => { onAccentChange?.(null); void onStateChange?.(device.id, { brightness: v }) }}
					className="mt-2"
				>
					<div className="flex items-center justify-between mb-1">
						<Label className="text-xs text-stone-500">Brightness</Label>
						<SliderOutput className="text-xs text-stone-400" />
					</div>
					<SliderTrack className="relative flex items-center h-6 w-full">
						{({ state: s }) => (
							<>
								<div className="absolute inset-x-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-stone-200" />
								<div
									className="absolute h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-amber-300"
									style={{ width: `${s.getThumbPercent(0) * 100}%` }}
								/>
								<SliderThumb
									className="w-5 h-5 rounded-full ring-1 ring-white/50 cursor-default focus:outline-none"
									style={{
										top: '50%',
										transform: 'translate(-50%, -50%)',
										background:
											'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.65) 0%, transparent 55%), #fbbf24',
										boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
									}}
								/>
							</>
						)}
					</SliderTrack>
				</Slider>
			)}
		</div>
	)
}
