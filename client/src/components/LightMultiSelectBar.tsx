import { useState } from 'react'
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

import { CCT_SWATCHES, COLOR_PRESETS, SCENES, tempToColor } from '../lib/color-utils'

interface LightMultiSelectBarProps {
	selectedIds: Set<string>
	devices: Device[]
	onClear: () => void
	onStateChange: (id: string, state: Partial<DeviceState>) => Promise<void>
}

export function LightMultiSelectBar({
	selectedIds,
	devices,
	onClear,
	onStateChange,
}: Readonly<LightMultiSelectBarProps>) {
	const [brightness, setBrightness] = useState(50)

	if (selectedIds.size === 0) return null

	const selectedDevices = devices.filter((d) => selectedIds.has(d.id))
	const allHaveCCT = selectedDevices.every((d) => d.state.colorTemp !== undefined)
	const allHaveColor = selectedDevices.every((d) => d.state.color !== undefined)

	function applyToAll(state: Partial<DeviceState>) {
		void Promise.all([...selectedIds].map((id) => onStateChange(id, state)))
	}

	return (
		<div
			className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap max-w-[92vw]"
			style={{
				background: 'linear-gradient(to bottom, rgba(255,255,255,0.92), rgba(255,255,255,0.85))',
				backdropFilter: 'blur(16px) saturate(1.5)',
				boxShadow: '0 4px 24px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
				border: '1px solid rgba(255,255,255,0.6)',
			}}
		>
			{/* Count + clear */}
			<div className="flex items-center gap-1.5 shrink-0">
				<span className="text-xs font-semibold text-gray-700">
					{selectedIds.size} light{selectedIds.size > 1 ? 's' : ''}
				</span>
				<Button
					onPress={onClear}
					className="text-gray-400 hover:text-gray-600 text-xs leading-none cursor-default"
					aria-label="Clear selection"
				>
					✕
				</Button>
			</div>

			<Divider />

			{/* Power */}
			<div className="flex gap-1 shrink-0">
				<Button
					onPress={() => applyToAll({ on: true })}
					className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-default"
				>
					On
				</Button>
				<Button
					onPress={() => applyToAll({ on: false })}
					className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 cursor-default"
				>
					Off
				</Button>
			</div>

			<Divider />

			{/* Scenes */}
			<div className="flex gap-1 shrink-0">
				{SCENES.map((scene) => (
					<Button
						key={scene.name}
						onPress={() =>
							applyToAll({ on: true, colorTemp: scene.colorTemp, brightness: scene.brightness })
						}
						className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 cursor-default"
					>
						{scene.name}
					</Button>
				))}
			</div>

			<Divider />

			{/* Brightness (write-only) */}
			<Slider
				value={brightness}
				minValue={0}
				maxValue={100}
				onChange={setBrightness}
				onChangeEnd={(v) => applyToAll({ brightness: v })}
				className="w-28 shrink-0"
			>
				<div className="flex items-center justify-between mb-0.5">
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
								style={{
									top: '50%',
									transform: 'translate(-50%, -50%)',
									background:
										'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.65) 0%, transparent 55%), #fbbf24',
									boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
								}}
								className="w-5 h-5 rounded-full ring-1 ring-white/50 cursor-default focus:outline-none"
							/>
						</>
					)}
				</SliderTrack>
			</Slider>

			{/* CCT swatches — only when every selected device supports color temp */}
			{allHaveCCT && (
				<>
					<Divider />
					<div className="flex gap-1.5 items-center shrink-0">
						{CCT_SWATCHES.map((k) => (
							<button
								key={k}
								type="button"
								onClick={() => applyToAll({ colorTemp: k })}
								style={{
									background: tempToColor(k),
									boxShadow:
										'0 2px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.4)',
								}}
								className="w-6 h-6 rounded-full ring-1 ring-white/40 cursor-pointer hover:scale-110 transition-transform"
								aria-label={`${k}K`}
							/>
						))}
					</div>
				</>
			)}

			{/* Color swatches — only when every selected device supports RGB */}
			{allHaveColor && (
				<>
					<Divider />
					<div className="flex gap-1.5 items-center shrink-0">
						{COLOR_PRESETS.map((preset) => (
							<button
								key={preset.label}
								type="button"
								onClick={() => applyToAll({ color: preset.value, on: true })}
								style={{
									background: `rgb(${preset.value.r} ${preset.value.g} ${preset.value.b})`,
									boxShadow:
										'0 2px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.4)',
								}}
								className="w-6 h-6 rounded-full ring-1 ring-white/40 cursor-pointer hover:scale-110 transition-transform"
								aria-label={preset.label}
							/>
						))}
					</div>
				</>
			)}
		</div>
	)
}

function Divider() {
	return <div className="h-5 w-px bg-gray-200 shrink-0" />
}
