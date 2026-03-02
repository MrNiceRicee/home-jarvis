import { useEffect, useState } from 'react'
import {
	Button,
	ColorArea,
	ColorField,
	ColorPicker,
	ColorSlider,
	ColorThumb,
	Dialog,
	DialogTrigger,
	Input,
	Label,
	Popover,
	Slider,
	SliderOutput,
	SliderThumb,
	SliderTrack,
	type Color,
} from 'react-aria-components'

import type { Device, DeviceState } from '../../types'

import { CCT_SWATCHES, COLOR_PRESETS, SCENES, tempToColor } from '../../lib/color-utils'

interface LightCardProps {
	device: Device
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function LightCard({ device, onStateChange }: Readonly<LightCardProps>) {
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
	const [pickerColor, setPickerColor] = useState<Color | null>(null)

	// Sync sliders when SSE pushes new state
	useEffect(() => { setBrightness(state.brightness ?? 100) }, [state.brightness])
	useEffect(() => { setColorTemp(state.colorTemp ?? 4000) }, [state.colorTemp])

	// Lazy-import parseColor to avoid loading color machinery until needed
	useEffect(() => {
		if (!isRGB) return
		const { r, g, b } = state.color ?? { r: 255, g: 255, b: 255 }
		import('react-aria-components').then(({ parseColor }) => {
			try {
				setPickerColor(parseColor(`rgb(${r}, ${g}, ${b})`))
			} catch {
				setPickerColor(parseColor('#ffffff'))
			}
		}).catch(() => undefined)
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync once on mount; SSE updates handled separately
	}, [])

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

	function handleColorPreset(color: { r: number; g: number; b: number }) {
		import('react-aria-components').then(({ parseColor }) => {
			try {
				setPickerColor(parseColor(`rgb(${color.r}, ${color.g}, ${color.b})`))
			} catch { /* ignore */ }
		}).catch(() => undefined)
		void onStateChange?.(device.id, { color, on: true })
	}

	const powerLabel = isOn ? 'Turn Off' : 'Turn On'
	const buttonLabel = toggling ? '…' : powerLabel

	function commitPickerColor(c: Color) {
		const rgb = c.toFormat('rgb')
		void onStateChange?.(device.id, {
			color: {
				r: Math.round(rgb.getChannelValue('red')),
				g: Math.round(rgb.getChannelValue('green')),
				b: Math.round(rgb.getChannelValue('blue')),
			},
		})
	}

	return (
		<div className={`rounded-lg p-2 transition-colors ${isOn ? 'bg-amber-50/30' : 'bg-gray-50'}`}>
			{/* ── Power row ─────────────────────────────────────────────── */}
			<div className="flex items-center justify-between mb-2">
				<span className={`text-xs font-medium ${isOn ? 'text-amber-600' : 'text-gray-400'}`}>
					{isOn ? 'On' : 'Off'}
					{state.brightness !== undefined && isOn && (
						<span className="text-gray-400"> · {brightness}%</span>
					)}
				</span>
				{device.online && (
					<Button
						onPress={() => { void handlePowerToggle() }}
						isDisabled={toggling}
						className={`text-xs px-4 py-1.5 rounded-full border transition-colors cursor-default disabled:opacity-40 ${
							isOn
								? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300 pressed:bg-amber-200'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300 pressed:bg-gray-300'
						}`}
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
							className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-gray-600 hover:bg-white border border-gray-200 hover:border-gray-300 transition-colors"
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
				<div className="flex gap-0.5 mb-2 rounded-full bg-gray-100 p-0.5">
					<button
						type="button"
						onClick={() => setMode('white')}
						className={`flex-1 text-xs py-1 rounded-full transition-all ${
							mode === 'white' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500'
						}`}
					>
						White
					</button>
					<button
						type="button"
						onClick={() => setMode('color')}
						className={`flex-1 text-xs py-1 rounded-full transition-all ${
							mode === 'color' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500'
						}`}
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
								className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 ${
									Math.abs(colorTemp - k) < 200
										? 'ring-2 ring-gray-600 ring-offset-1'
										: 'ring-1 ring-white/40'
								}`}
								aria-label={`${k}K`}
							/>
						))}
					</div>

					{/* Color temp slider — oklab interpolation avoids green hue artifact */}
					<Slider
						value={colorTemp}
						minValue={2700}
						maxValue={6500}
						onChange={setColorTemp}
						onChangeEnd={(v) => { void onStateChange?.(device.id, { colorTemp: v }) }}
					>
						<div className="flex items-center justify-between mb-1">
							<Label className="text-xs text-gray-500">Color Temp</Label>
							<SliderOutput className="text-xs text-gray-400">
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
				<div className="flex gap-2 flex-wrap items-center mb-2">
					{COLOR_PRESETS.map((preset) => (
						<button
							key={preset.label}
							type="button"
							onClick={() => handleColorPreset(preset.value)}
							style={{
								background: `rgb(${preset.value.r} ${preset.value.g} ${preset.value.b})`,
								boxShadow:
									'0 2px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.4)',
							}}
							className="w-6 h-6 rounded-full ring-1 ring-white/40 cursor-pointer hover:scale-110 transition-transform"
							aria-label={preset.label}
						/>
					))}

					<DialogTrigger
						onOpenChange={(open) => {
							if (!open && pickerColor) commitPickerColor(pickerColor)
						}}
					>
						<Button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded-full border border-gray-200 hover:border-gray-300 cursor-default">
							+ Custom
						</Button>
						<Popover placement="bottom" className="z-50">
							<Dialog
								aria-label="Color picker"
								className="outline-none p-3 bg-white rounded-xl shadow-xl border border-gray-200 w-60"
							>
								<ColorPicker
									value={pickerColor ?? '#ffffff'}
									onChange={(c) => setPickerColor(c)}
								>
									<ColorArea
										colorSpace="hsb"
										xChannel="saturation"
										yChannel="brightness"
										className="w-full rounded-lg mb-2"
										style={{ height: '10rem' }}
									>
										<ColorThumb
											className="w-5 h-5 rounded-full ring-2 ring-white"
											style={{
												background:
													'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.65) 0%, transparent 55%)',
												boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
											}}
										/>
									</ColorArea>
									<ColorSlider channel="hue" colorSpace="hsb" className="mb-1.5">
										<SliderTrack className="h-3 rounded-full">
											<ColorThumb
												className="w-4 h-4 rounded-full ring-2 ring-white"
												style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
											/>
										</SliderTrack>
									</ColorSlider>
									<ColorSlider channel="saturation" colorSpace="hsb" className="mb-1.5">
										<SliderTrack className="h-3 rounded-full">
											<ColorThumb
												className="w-4 h-4 rounded-full ring-2 ring-white"
												style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
											/>
										</SliderTrack>
									</ColorSlider>
									<ColorField className="mt-2 w-full">
										<Label className="text-xs text-gray-500 block mb-0.5">Hex</Label>
										<Input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-blue-400" />
									</ColorField>
								</ColorPicker>
							</Dialog>
						</Popover>
					</DialogTrigger>
				</div>
			)}

			{/* ── Brightness slider ─────────────────────────────────────── */}
			{state.brightness !== undefined && device.online && (
				<Slider
					value={brightness}
					minValue={0}
					maxValue={100}
					onChange={setBrightness}
					onChangeEnd={(v) => { void onStateChange?.(device.id, { brightness: v }) }}
					className="mt-2"
				>
					<div className="flex items-center justify-between mb-1">
						<Label className="text-xs text-gray-500">Brightness</Label>
						<SliderOutput className="text-xs text-gray-400" />
					</div>
					<SliderTrack className="relative flex items-center h-6 w-full">
						{({ state: s }) => (
							<>
								<div className="absolute inset-x-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-gray-200" />
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
