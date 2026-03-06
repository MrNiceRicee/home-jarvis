import { DialogTrigger, Heading } from 'react-aria-components'

import type { IntegrationMeta } from '../types'
import type { IntegrationsResponse } from '../types'

import { cn } from '../lib/cn'
import { BRAND_ICON, FALLBACK_ICON } from '../lib/device-constants'
import { IntegrationFormInner } from './IntegrationForm'
import { RaisedButton } from './ui/button'
import { ConsolePanelLabel } from './ui/console-panel'
import { RaisedModal } from './ui/modal'
import { ReadoutDisplay } from './ui/readout-display'
import { ScrambleText } from './ui/scramble-text'
import { TerminalButton } from './ui/terminal-button'

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
	| {
		state: 'error'
		meta: IntegrationMeta
		errorMessage: string
		onRetry: () => void
	}
	| {
		state: 'connecting'
		meta: IntegrationMeta
	}
>

function RecessedLed({ lit, error }: Readonly<{ lit: boolean; error?: boolean }>) {
	const ledColor = error
		? { bg: 'radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 50%, #dc2626 100%)', glow: '0 0 4px rgba(239,68,68,0.5), 0 0 10px rgba(239,68,68,0.25)' }
		: lit
			? { bg: 'radial-gradient(circle at 35% 30%, #6ee7b7, #34d399 50%, #059669 100%)', glow: '0 0 4px rgba(52,211,153,0.6), 0 0 10px rgba(52,211,153,0.3)' }
			: { bg: '#44403c', glow: 'none' }

	return (
		<div
			className="w-4 h-4 rounded-full flex items-center justify-center"
			style={{
				background: '#23221c',
				boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.3)',
			}}
		>
			<div
				className="w-1.5 h-1.5 rounded-full"
				style={{
					background: ledColor.bg,
					boxShadow: ledColor.glow,
				}}
			/>
		</div>
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

function CrtScreen({ brand, isPowered, isError, children, ariaLabel }: Readonly<{
	brand: string
	isPowered: boolean
	isError?: boolean
	children: React.ReactNode
	ariaLabel: string
}>) {
	const Icon = BRAND_ICON[brand] ?? FALLBACK_ICON
	return (
		<ReadoutDisplay
			size="lg"
			className="w-full !flex flex-col items-center gap-1.5 py-3 px-3"
			glowIntensity={isPowered ? 0.3 : 0}
			scanlineIntensity={0.06}
			aria-label={ariaLabel}
		>
			<Icon
				size={28}
				weight="thin"
				className={cn(
					'text-display-text transition-opacity duration-300',
					!isPowered && 'opacity-40',
					isError && 'opacity-40',
				)}
			/>
			{children}
		</ReadoutDisplay>
	)
}

export function ModulePanel(props: ModulePanelProps) {
	const isPowered = props.state === 'connected' || props.state === 'connecting'
	const isError = props.state === 'error'
	const brand = props.meta.brand

	function buildAriaLabel(): string {
		switch (props.state) {
			case 'connected':
				return `${props.meta.displayName}: ${props.deviceCount} device${props.deviceCount !== 1 ? 's' : ''} connected`
			case 'error':
				return `${props.meta.displayName}: connection error`
			case 'connecting':
				return `${props.meta.displayName}: connecting`
			case 'available':
				return `${props.meta.displayName}: available`
		}
	}

	return (
		<div
			className={cn(
				'relative flex flex-col rounded-xl p-4',
				'transition-[border-color,background,opacity] duration-300',
			)}
			style={isPowered ? POWERED_SURFACE : UNPOWERED_SURFACE}
		>
			{/* recessed LED */}
			<div className="mb-3">
				<RecessedLed lit={isPowered} error={isError} />
			</div>

			{/* CRT screen */}
			<div className="mb-3">
				<CrtScreen brand={brand} isPowered={isPowered} isError={isError} ariaLabel={buildAriaLabel()}>
					{props.state === 'connected' && (
						<>
							<span className="font-ioskeley text-sm tabular-nums text-display-text">
								<ScrambleText value={String(props.deviceCount)} />
							</span>
							<span className="font-ioskeley text-2xs text-display-text/60 uppercase tracking-wider">
								<ScrambleText value={props.deviceCount === 0 ? 'NO DEVICES' : 'CONNECTED'} />
							</span>
						</>
					)}
					{props.state === 'available' && (
						<span className="font-ioskeley text-sm tabular-nums text-display-text/40">--</span>
					)}
					{props.state === 'error' && (
						<span className="font-ioskeley text-2xs text-red-400 uppercase tracking-wider">
							<ScrambleText value="ERROR" />
						</span>
					)}
					{props.state === 'connecting' && (
						<span className="font-ioskeley text-2xs text-display-text/60 uppercase tracking-wider animate-pulse">
							<ScrambleText value="CONNECTING..." />
						</span>
					)}
				</CrtScreen>
			</div>

			{/* engraved faceplate label */}
			<ConsolePanelLabel>{props.meta.displayName}</ConsolePanelLabel>

			{/* terminal button actions */}
			<div className="flex gap-2">
				{props.state === 'connected' && (
					<ConnectedActions
						meta={props.meta}
						deviceCount={props.deviceCount}
						onConfigure={props.onConfigure}
						onRemove={props.onRemove}
					/>
				)}
				{props.state === 'available' && (
					<AvailableActions meta={props.meta} onSubmit={props.onSubmit} />
				)}
				{props.state === 'error' && (
					<TerminalButton label="RETRY" onPress={props.onRetry} />
				)}
			</div>
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
		<>
			{!meta.discoveryOnly && (
				<TerminalButton label="CONFIGURE" onPress={onConfigure} />
			)}
			<DialogTrigger>
				<TerminalButton label="REMOVE" variant="destructive" onPress={() => {}} />
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
		</>
	)
}

function AvailableActions({ meta, onSubmit }: Readonly<{
	meta: IntegrationMeta
	onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
}>) {
	if (meta.discoveryOnly) {
		return <TerminalButton label="CONNECT" onPress={() => void onSubmit(meta.brand, {})} />
	}

	return (
		<DialogTrigger>
			<TerminalButton label="CONNECT" onPress={() => {}} />
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
