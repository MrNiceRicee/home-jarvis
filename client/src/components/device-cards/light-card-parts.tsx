import {
	type Color,
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
} from 'react-aria-components'

import { cn } from '../../lib/cn'
import { CCT_SWATCHES, COLOR_PRESETS, tempToColor } from '../../lib/color-utils'
import { FADER_THUMB_STYLE } from '../../lib/slider-styles'
import type { DeviceState } from '../../types'
import { ToggleBank } from '../ui/toggle-bank'

// horizontal fader adds positional overrides to the shared aluminum knob
const H_FADER_THUMB_STYLE = {
	...FADER_THUMB_STYLE,
	top: '38%',
	transform: 'translate(-50%, -50%)',
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

const COLOR_PRESET_OPTIONS = COLOR_PRESETS.map((p) => ({
	key: p.label,
	label: p.label.slice(0, 3).toUpperCase(),
	ledColor: `rgb(${p.value.r},${p.value.g},${p.value.b})`,
}))

// ── BRT fader with ruler-graduated tappable detents ─────────────────────

interface BrtFaderProps {
	brightness: number
	onChange: (v: number) => void
	onChangeEnd: (v: number) => void
	onDetent: (v: number) => void
}

export function BrtFader({ brightness, onChange, onChangeEnd, onDetent }: Readonly<BrtFaderProps>) {
	return (
		<Slider
			value={brightness}
			minValue={0}
			maxValue={100}
			onChange={onChange}
			onChangeEnd={onChangeEnd}
		>
			<div className="flex items-center justify-between mb-1">
				<Label className="font-michroma text-2xs uppercase tracking-widest text-stone-400">
					BRT
				</Label>
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
							style={H_FADER_THUMB_STYLE}
						/>
						<div className="absolute inset-x-0 top-[60%] flex justify-between">
							{BRT_DETENTS.map((d) => (
								<button
									key={d.value}
									type="button"
									onClick={() => onDetent(d.value)}
									className={cn(
										'relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 px-1',
										d.height,
									)}
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

function cctTextColor(kelvin: number): string {
	return `color-mix(in srgb, ${tempToColor(kelvin)} 60%, #1c1917)`
}

function cctDetentLabel(k: number): string {
	if (k < 1000) return `${k}`
	if (k < 10000) return k % 1000 === 0 ? `${k / 1000}K` : `${(k / 1000).toFixed(1)}`
	return `${k / 1000}K`
}

interface CctFaderProps {
	colorTemp: number
	onChange: (v: number) => void
	onChangeEnd: (v: number) => void
	onDetent: (k: number) => void
}

export function CctFader({ colorTemp, onChange, onChangeEnd, onDetent }: Readonly<CctFaderProps>) {
	return (
		<div>
			<div className="flex items-center justify-between mb-1">
				<span className="font-michroma text-2xs uppercase tracking-widest text-stone-400">CCT</span>
				<span className="font-ioskeley text-xs" style={{ color: cctTextColor(colorTemp) }}>
					{colorTemp}K
				</span>
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
									background:
										'linear-gradient(in srgb to right, rgb(255 171 82), rgb(255 236 205), rgb(214 234 255))',
								}}
							/>
							<SliderThumb
								className="z-10 w-3 h-5.5 rounded-[3px] border border-stone-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 shadow-[0_1px_3px_rgba(0,0,0,0.25)] relative after:absolute after:content-[''] after:inset-x-0.5 after:top-1/2 after:-translate-y-1/2 after:h-px after:bg-stone-400/40"
								style={H_FADER_THUMB_STYLE}
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
											className={cn(
												'absolute cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-stone-400 px-1',
												isEndpoint ? 'h-3' : 'h-2',
											)}
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

export function ColorPanel({
	pickerColor,
	onPickerChange,
	onPickerCommit,
	onPreset,
	onCommit,
}: Readonly<ColorPanelProps>) {
	return (
		<div className="flex flex-col items-center gap-2">
			<ColorPicker value={pickerColor} onChange={onPickerChange}>
				<div className="relative" style={{ width: 160, height: 160 }}>
					<ColorWheel outerRadius={80} innerRadius={60} onChangeEnd={onPickerCommit}>
						<ColorWheelTrack />
						<ColorThumb className="w-4 h-4 rounded-full ring-2 ring-white cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
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
						<ColorThumb className="w-4 h-4 rounded-full ring-2 ring-white cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
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

			<ColorPicker value={pickerColor} onChange={onCommit}>
				<ColorField>
					<Input
						className="w-20 bg-display-bg rounded border border-display-border px-2 py-1 font-ioskeley text-xs text-display-text caret-display-text selection:bg-stone-600 outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
						style={{
							boxShadow:
								'inset 0 2px 6px rgba(0,0,0,0.5), inset 0 0 2px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.2)',
						}}
						aria-label="Hex color"
					/>
				</ColorField>
			</ColorPicker>
		</div>
	)
}

// ── Helper components & utilities ───────────────────────────────────────

export function ReadoutSecondary({
	state,
	showCCT,
	showColor,
	colorTemp,
	pickerColor,
}: Readonly<{
	state: DeviceState
	showCCT: boolean
	showColor: boolean
	colorTemp: number
	pickerColor: Color
}>) {
	if (showCCT && state.colorTemp !== undefined) {
		return (
			<span className="text-base" style={{ color: tempToColor(colorTemp) }}>
				{colorTemp}
				<span className="text-xs ml-0.5">K</span>
			</span>
		)
	}
	if (showColor && state.color) {
		const rgb = pickerColor.toFormat('rgb')
		const bg = `rgb(${Math.round(rgb.getChannelValue('red'))} ${Math.round(rgb.getChannelValue('green'))} ${Math.round(rgb.getChannelValue('blue'))})`
		return <span className="w-3 h-3 rounded-full inline-block" style={{ background: bg }} />
	}
	return null
}
