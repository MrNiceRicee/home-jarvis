import { useState } from 'react'
import { Switch, Label, Button, Tooltip, TooltipTrigger } from 'react-aria-components'

import type { Device, DeviceState } from '../types'

const TYPE_ICON: Record<string, string> = {
	light: '💡',
	switch: '🔌',
	thermostat: '🌡️',
	air_purifier: '💨',
	sensor: '📡',
}

const BRAND_LABEL: Record<string, string> = {
	hue: 'Hue',
	govee: 'Govee',
	vesync: 'VeSync',
	lg: 'LG',
	ge: 'GE',
	aqara: 'Aqara',
	smartthings: 'SmartThings',
	resideo: 'Resideo',
}

interface DeviceCardProps {
	device: Device
	onHomekitToggle?: (deviceId: string, enabled: boolean) => Promise<void>
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function DeviceCard({ device, onHomekitToggle, onStateChange }: Readonly<DeviceCardProps>) {
	const [hkLoading, setHkLoading] = useState(false)
	const [toggling, setToggling] = useState(false)
	const isAqara = device.brand === 'aqara'
	const state = device.state

	async function handleHomekitToggle(enabled: boolean) {
		if (!onHomekitToggle) return
		setHkLoading(true)
		try {
			await onHomekitToggle(device.id, enabled)
		} finally {
			setHkLoading(false)
		}
	}

	const powerLabel = state.on ? 'Turn Off' : 'Turn On'

	async function handlePowerToggle() {
		if (!onStateChange) return
		setToggling(true)
		try {
			await onStateChange(device.id, { on: !state.on })
		} finally {
			setToggling(false)
		}
	}

	return (
		<div
			className={`bg-white rounded-xl border transition-all ${device.online ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-60'}`}
		>
			<div className="p-4">
				{/* Header */}
				<div className="flex items-start justify-between gap-2 mb-3">
					<div className="flex items-center gap-2 min-w-0">
						<span className="text-xl shrink-0">{TYPE_ICON[device.type] ?? '📦'}</span>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-gray-900 truncate">{device.name}</p>
							<p className="text-xs text-gray-400 truncate">
								{BRAND_LABEL[device.brand] ?? device.brand}
							</p>
						</div>
					</div>
					<OnlineBadge online={device.online} />
				</div>

				{/* State display */}
				<StateDisplay type={device.type} state={state} />

				{/* Power toggle (for lights/switches) */}
				{(device.type === 'light' || device.type === 'switch') && device.online && (
					<Button
						onPress={handlePowerToggle}
						isDisabled={toggling}
						className={`mt-3 w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-default
              ${
								state.on
									? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 pressed:bg-amber-200'
									: 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 pressed:bg-gray-300'
							} disabled:opacity-40`}
					>
						{toggling ? 'Updating…' : powerLabel}
					</Button>
				)}
			</div>

			{/* Footer: HomeKit toggle */}
			<div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
				<span className="text-xs text-gray-400">HomeKit</span>
				{isAqara ? (
					<TooltipTrigger delay={200}>
						<Button className="text-xs text-gray-300 cursor-default focus:outline-none">
							Native ✓
						</Button>
						<Tooltip className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 shadow-lg max-w-[200px] text-center">
							Aqara supports HomeKit natively. Add via the Apple Home app.
						</Tooltip>
					</TooltipTrigger>
				) : (
					<Switch
						isSelected={device.homekitEnabled}
						onChange={handleHomekitToggle}
						isDisabled={hkLoading || !device.online}
						className="group flex items-center gap-2 cursor-default"
					>
						<div
							className={`w-9 h-5 rounded-full transition-colors
              bg-gray-200
              group-selected:bg-emerald-500
              group-disabled:opacity-40`}
						>
							<div
								className={`w-4 h-4 bg-white rounded-full shadow-sm m-0.5 transition-transform
                group-selected:translate-x-4`}
							/>
						</div>
						<Label className="sr-only">Enable HomeKit</Label>
					</Switch>
				)}
			</div>
		</div>
	)
}

function OnlineBadge({ online }: Readonly<{ online: boolean }>) {
	return (
		<span
			className={`flex items-center gap-1 text-xs font-medium shrink-0 px-1.5 py-0.5 rounded-full
      ${online ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400 bg-gray-100'}`}
		>
			<span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
			{online ? 'Online' : 'Offline'}
		</span>
	)
}

function StateDisplay({ type, state }: Readonly<{ type: string; state: DeviceState }>) {
	if (type === 'light' || type === 'switch') {
		return (
			<div className="flex items-center gap-2 text-xs text-gray-500">
				<span className={`font-medium ${state.on ? 'text-amber-600' : 'text-gray-400'}`}>
					{state.on ? 'On' : 'Off'}
				</span>
				{state.brightness !== undefined && state.on && <span className="text-gray-300">·</span>}
				{state.brightness !== undefined && state.on && <span>{state.brightness}%</span>}
			</div>
		)
	}
	if (type === 'thermostat' && state.temperature !== undefined) {
		return <p className="text-xs text-gray-500">{state.temperature.toFixed(1)}°C</p>
	}
	if (type === 'air_purifier' && state.fanSpeed !== undefined) {
		return <p className="text-xs text-gray-500">Fan: {state.fanSpeed}%</p>
	}
	return null
}
