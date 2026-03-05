import { DialogTrigger, Heading } from 'react-aria-components'

import type { IntegrationMeta } from '../types'
import type { IntegrationsResponse } from '../types'

import { cn } from '../lib/cn'
import { BRAND_ICON, FALLBACK_ICON } from '../lib/device-constants'
import { IntegrationFormInner } from './IntegrationForm'
import { RaisedButton } from './ui/button'
import { RaisedModal } from './ui/modal'
import { ReadoutDisplay } from './ui/readout-display'

// credentials stripped server-side
type ConfiguredIntegration = IntegrationsResponse['configured'][number]

type ModulePanelProps = Readonly<
	| {
		state: 'connected'
		integration: ConfiguredIntegration
		deviceCount: number
		meta: IntegrationMeta
		onConfigure: () => void
		onRemove: () => void
	}
	| {
		state: 'available'
		meta: IntegrationMeta
		onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
	}
>

function ModuleLed({ lit, error }: Readonly<{ lit: boolean; error?: boolean }>) {
	if (!lit) {
		return <div className="w-1.5 h-1.5 rounded-full bg-stone-300" />
	}

	const color = error
		? { highlight: '#fca5a5', mid: '#ef4444', edge: '#dc2626', glowClose: 'rgba(239,68,68,0.5)', glowFar: 'rgba(239,68,68,0.25)' }
		: { highlight: '#6ee7b7', mid: '#34d399', edge: '#059669', glowClose: 'rgba(52,211,153,0.6)', glowFar: 'rgba(52,211,153,0.3)' }

	return (
		<div
			className="w-1.5 h-1.5 rounded-full"
			style={{
				background: `radial-gradient(circle at 35% 30%, ${color.highlight}, ${color.mid} 50%, ${color.edge} 100%)`,
				boxShadow: `0 0 4px ${color.glowClose}, 0 0 10px ${color.glowFar}`,
			}}
		/>
	)
}

const POWERED_SURFACE: React.CSSProperties = {
	background: 'linear-gradient(to bottom, #fffdf8, #f8f5ee)',
	border: '1px solid rgba(168, 151, 125, 0.18)',
	boxShadow: '0 1px 2px rgba(120, 90, 50, 0.05), 0 4px 12px rgba(120, 90, 50, 0.04), inset 0 1px 0 rgba(255, 253, 245, 0.8)',
}

const UNPOWERED_SURFACE: React.CSSProperties = {
	background: 'linear-gradient(to bottom, #f8f5ee, #f2efea)',
	border: '1px solid rgba(168, 151, 125, 0.1)',
	boxShadow: '0 1px 2px rgba(120, 90, 50, 0.03), inset 0 1px 0 rgba(255, 253, 245, 0.5)',
}

export function ModulePanel(props: ModulePanelProps) {
	const isConnected = props.state === 'connected'
	const brand = props.meta.brand
	const Icon = BRAND_ICON[brand] ?? FALLBACK_ICON

	return (
		<div
			className={cn(
				'relative flex flex-col items-center justify-between rounded-xl aspect-[3/4] p-4',
				'transition-all duration-300',
				'focus-within:ring-2 focus-within:ring-stone-400 focus-within:ring-offset-1',
			)}
			style={isConnected ? POWERED_SURFACE : UNPOWERED_SURFACE}
		>
			{/* status LED */}
			<div className="absolute top-3 right-3">
				<ModuleLed lit={isConnected} />
			</div>

			{/* brand icon */}
			<div className="flex-1 flex items-center justify-center">
				<Icon
					size={32}
					weight="thin"
					className={cn(
						'text-stone-500 transition-opacity duration-300',
						!isConnected && 'opacity-50',
					)}
				/>
			</div>

			{/* readout — device count or placeholder */}
			<ReadoutDisplay size="sm" className="mb-3 w-full text-center !justify-center">
				<span className="tabular-nums">
					{isConnected ? props.deviceCount : '--'}
				</span>
			</ReadoutDisplay>

			{/* brand label */}
			<p className="font-michroma text-[9px] text-stone-400 tracking-[0.15em] uppercase mb-3 text-center">
				{props.meta.displayName}
			</p>

			{/* action area */}
			{isConnected ? (
				<ConnectedActions
					meta={props.meta}
					deviceCount={props.deviceCount}
					onConfigure={props.onConfigure}
					onRemove={props.onRemove}
				/>
			) : (
				<AvailableActions
					meta={props.meta}
					onSubmit={props.onSubmit}
				/>
			)}
		</div>
	)
}

function ConnectedActions({ meta, deviceCount, onConfigure, onRemove }: Readonly<{
	meta: IntegrationMeta
	deviceCount: number
	onConfigure: () => void
	onRemove: () => void
}>) {
	return (
		<div className="flex gap-1.5 w-full">
			<RaisedButton variant="ghost" size="sm" className="flex-1 text-2xs" onPress={onConfigure}>
				Configure
			</RaisedButton>
			<DialogTrigger>
				<RaisedButton variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 text-2xs">
					Remove
				</RaisedButton>
				<RaisedModal className="max-w-sm">
					{({ close }) => (
						<>
							<Heading slot="title" className="text-base font-semibold text-stone-900 mb-2">
								Remove {meta.displayName}?
							</Heading>
							<p className="text-sm text-stone-500 mb-5">
								{deviceCount} device{deviceCount !== 1 ? 's' : ''} will be removed. Matter accessories will be unexposed.
							</p>
							<div className="flex gap-2 justify-end">
								<RaisedButton variant="raised" size="md" onPress={close}>
									Cancel
								</RaisedButton>
								<RaisedButton
									variant="danger"
									size="md"
									onPress={() => {
										onRemove()
										close()
									}}
								>
									Remove
								</RaisedButton>
							</div>
						</>
					)}
				</RaisedModal>
			</DialogTrigger>
		</div>
	)
}

function AvailableActions({ meta, onSubmit }: Readonly<{
	meta: IntegrationMeta
	onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
}>) {
	if (meta.discoveryOnly) {
		return (
			<RaisedButton
				variant="primary"
				size="sm"
				className="w-full text-2xs"
				onPress={() => void onSubmit(meta.brand, {})}
			>
				Connect
			</RaisedButton>
		)
	}

	return (
		<DialogTrigger>
			<RaisedButton variant="primary" size="sm" className="w-full text-2xs">
				Connect
			</RaisedButton>
			<RaisedModal>
				{({ close }) => (
					<IntegrationFormInner
						meta={meta}
						onSubmit={async (config) => {
							await onSubmit(meta.brand, config)
							close()
						}}
						onCancel={close}
					/>
				)}
			</RaisedModal>
		</DialogTrigger>
	)
}
