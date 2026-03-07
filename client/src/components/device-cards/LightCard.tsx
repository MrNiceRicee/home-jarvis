import { useEffect, useState } from 'react'
import { type Color, parseColor } from 'react-aria-components'

import { cn } from '../../lib/cn'
import { SCENES, tempToColor } from '../../lib/color-utils'
import type { Device, DeviceState } from '../../types'
import { ReadoutDisplay } from '../ui/readout-display'
import { ToggleBank } from '../ui/toggle-bank'
import { TwoPositionToggle } from '../ui/two-position-toggle'
import { BrtFader, CctFader, ColorPanel, ReadoutSecondary } from './light-card-parts'

const SCENE_OPTIONS = SCENES.map((s) => ({
	key: s.name,
	label: s.name === 'Energize' ? 'ENRG' : s.name.toUpperCase().slice(0, 5),
	ledColor: tempToColor(s.colorTemp),
}))

function buildReadoutLabel(
	isOn: boolean,
	brightness: number,
	showCCT: boolean,
	colorTemp: number,
	showColor: boolean,
	pickerColor: Color,
): string {
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

interface LightCardProps {
	device: Device
	variant?: 'compact' | 'full'
	onAccentChange?: (
		accent: {
			brightness?: number
			colorTemp?: number
			color?: { r: number; g: number; b: number }
		} | null,
	) => void
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function LightCard({
	device,
	variant = 'compact',
	onAccentChange,
	onStateChange,
}: Readonly<LightCardProps>) {
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
			try {
				return parseColor(`rgb(${r}, ${g}, ${b})`)
			} catch {
				/* fall through */
			}
		}
		return parseColor('hsl(0, 100%, 50%)')
	})

	// which panels to show
	const showCCT = isCCT && (!isFullColor || mode === 'white')
	const showColor = isRGB && (!isFullColor || mode === 'color')

	// push live accent to card shell during interaction
	function pushAccent(overrides: {
		brightness?: number
		colorTemp?: number
		color?: { r: number; g: number; b: number }
	}) {
		onAccentChange?.({
			brightness: overrides.brightness ?? brightness,
			colorTemp: showCCT ? (overrides.colorTemp ?? colorTemp) : undefined,
			color: showColor ? colorFromPicker(overrides) : undefined,
		})
	}

	function colorFromPicker(overrides: { color?: { r: number; g: number; b: number } }): {
		r: number
		g: number
		b: number
	} {
		if (overrides.color) return overrides.color
		const rgb = pickerColor.toFormat('rgb')
		return {
			r: Math.round(rgb.getChannelValue('red')),
			g: Math.round(rgb.getChannelValue('green')),
			b: Math.round(rgb.getChannelValue('blue')),
		}
	}

	// sync sliders when SSE pushes new state
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
		setBrightness(state.brightness ?? 100)
	}, [state.brightness])
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
		setColorTemp(state.colorTemp ?? 4000)
	}, [state.colorTemp])
	useEffect(() => {
		if (!state.color) return
		const { r, g, b } = state.color
		try {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- sse state sync
			setPickerColor(parseColor(`rgb(${r}, ${g}, ${b})`))
		} catch {
			/* ignore */
		}
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
		} catch {
			/* ignore */
		}
		void onStateChange?.(device.id, { color, on: true })
	}

	const readoutLabel = buildReadoutLabel(
		isOn,
		brightness,
		showCCT,
		colorTemp,
		showColor,
		pickerColor,
	)

	return (
		<div className="space-y-3">
			{/* ── ReadoutDisplay hero ─────────────────────────────────── */}
			<ReadoutDisplay
				size="lg"
				glowIntensity={1}
				aria-label={readoutLabel}
				className="w-full justify-between"
			>
				{isOn ? (
					<>
						<span>
							{brightness}
							<span className="text-xs text-display-text/50 ml-0.5">%</span>
						</span>
						<ReadoutSecondary
							state={state}
							showCCT={showCCT}
							showColor={showColor}
							colorTemp={colorTemp}
							pickerColor={pickerColor}
						/>
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
					onChange={(v) => {
						setBrightness(v)
						pushAccent({ brightness: v })
					}}
					onChangeEnd={(v) => {
						onAccentChange?.(null)
						void onStateChange?.(device.id, { brightness: v })
					}}
					onDetent={(v) => {
						setBrightness(v)
						onAccentChange?.(null)
						void onStateChange?.(device.id, { brightness: v, on: true })
					}}
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
							onChange={(v) => {
								setColorTemp(v)
								pushAccent({ colorTemp: v })
							}}
							onChangeEnd={(v) => {
								onAccentChange?.(null)
								void onStateChange?.(device.id, { colorTemp: v })
							}}
							onDetent={(k) => {
								setColorTemp(k)
								onAccentChange?.(null)
								void onStateChange?.(device.id, { colorTemp: k, on: true })
							}}
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
								pushAccent({
									color: {
										r: Math.round(rgb.getChannelValue('red')),
										g: Math.round(rgb.getChannelValue('green')),
										b: Math.round(rgb.getChannelValue('blue')),
									},
								})
							}}
							onPickerCommit={(c) => {
								onAccentChange?.(null)
								commitPickerColor(c)
							}}
							onPreset={handleColorPreset}
							onCommit={(c) => {
								setPickerColor(c)
								commitPickerColor(c)
							}}
						/>
					</div>
				</div>
			) : (
				<>
					{showCCT && device.online && (
						<CctFader
							colorTemp={colorTemp}
							onChange={(v) => {
								setColorTemp(v)
								pushAccent({ colorTemp: v })
							}}
							onChangeEnd={(v) => {
								onAccentChange?.(null)
								void onStateChange?.(device.id, { colorTemp: v })
							}}
							onDetent={(k) => {
								setColorTemp(k)
								onAccentChange?.(null)
								void onStateChange?.(device.id, { colorTemp: k, on: true })
							}}
						/>
					)}
					{isFull && showColor && device.online && (
						<ColorPanel
							pickerColor={pickerColor}
							onPickerChange={(c) => {
								setPickerColor(c)
								const rgb = c.toFormat('rgb')
								pushAccent({
									color: {
										r: Math.round(rgb.getChannelValue('red')),
										g: Math.round(rgb.getChannelValue('green')),
										b: Math.round(rgb.getChannelValue('blue')),
									},
								})
							}}
							onPickerCommit={(c) => {
								onAccentChange?.(null)
								commitPickerColor(c)
							}}
							onPreset={handleColorPreset}
							onCommit={(c) => {
								setPickerColor(c)
								commitPickerColor(c)
							}}
						/>
					)}
				</>
			)}
		</div>
	)
}
