import { useState } from 'react'
import { Modal as AriaModal, Dialog, Heading, ModalOverlay } from 'react-aria-components'

import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { BRAND_LABEL, FALLBACK_ICON, TYPE_ICON } from '../lib/device-constants'
import { DeviceBody } from '../lib/device-labels'
import { useDeviceStore } from '../stores/device-store'
import type { Device, DeviceState } from '../types'
import { RaisedButton } from './ui/button'
import { PowerButton } from './ui/power-button'

interface DeviceDetailDialogProps {
	device: Device | null
	onClose: () => void
	onStateChange?: (deviceId: string, state: Partial<DeviceState>) => Promise<void>
}

export function DeviceDetailDialog({
	device,
	onClose,
	onStateChange,
}: Readonly<DeviceDetailDialogProps>) {
	const [powerToggling, setPowerToggling] = useState(false)
	const removeDevice = useDeviceStore((s) => s.removeDevice)

	if (!device) return null

	const IconComponent = TYPE_ICON[device.type] ?? FALLBACK_ICON
	const hasPower = device.state.on !== undefined

	return (
		<ModalOverlay
			isOpen
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
			isDismissable
			className="fixed inset-0 bg-stone-900/15 backdrop-blur-sm z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out"
		>
			<AriaModal
				className={cn(
					'w-full max-w-lg mx-4 relative',
					'bg-surface-warm',
					'rounded-2xl',
					'border border-[rgba(168,151,125,0.12)]',
					'entering:animate-in entering:zoom-in-95',
					'exiting:animate-out exiting:zoom-out-95',
				)}
				style={{
					boxShadow:
						'0 1px 2px rgba(120,90,50,0.05), 0 4px 12px rgba(120,90,50,0.04), 0 8px 24px rgba(120,90,50,0.02), 0 16px 48px rgba(120,90,50,0.06), inset 0 0.5px 0 rgba(255,255,255,0.5)',
				}}
			>
				<Dialog className="outline-none">
					{/* header */}
					<div className="flex items-center gap-3 px-6 pt-6 pb-4">
						<IconComponent size={24} weight="thin" className="text-stone-500" />
						<div className="min-w-0 flex-1">
							<Heading slot="title" className="text-sm font-michroma text-stone-800 truncate">
								{device.name}
							</Heading>
							<p className="font-michroma text-2xs uppercase tracking-wider text-stone-400 truncate">
								{BRAND_LABEL[device.brand] ?? device.brand}
							</p>
						</div>
					</div>

					{/* body — full controls */}
					<div className="px-6 py-4">
						<DeviceBody device={device} variant="full" onStateChange={onStateChange} />
					</div>

					{/* footer */}
					<div className="flex items-end justify-between px-6 pb-5">
						{hasPower && device.online ? (
							<PowerButton
								isOn={device.state.on ?? false}
								isDisabled={!device.online}
								isToggling={powerToggling}
								onToggle={() => {
									if (!onStateChange) return
									setPowerToggling(true)
									void onStateChange(device.id, { on: !(device.state.on ?? false) }).finally(() =>
										setPowerToggling(false),
									)
								}}
							/>
						) : (
							<div />
						)}
						<div className="flex items-center gap-2">
							<RaisedButton
								variant="ghost"
								onPress={() => {
									removeDevice(device.id)
									onClose()
									void api.api.devices({ id: device.id }).hidden.patch({ hidden: true })
								}}
							>
								<span className="text-stone-400">Hide</span>
							</RaisedButton>
							<RaisedButton variant="ghost" onPress={onClose}>
								Close
							</RaisedButton>
						</div>
					</div>
				</Dialog>
			</AriaModal>
		</ModalOverlay>
	)
}
