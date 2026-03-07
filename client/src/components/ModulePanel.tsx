import { DialogTrigger, Heading } from 'react-aria-components'

import type { IntegrationMeta } from '../types'
import type { IntegrationsResponse } from '../types'

import { cn } from '../lib/cn'
import { BRAND_ICON, FALLBACK_ICON } from '../lib/device-constants'
import { IntegrationFormInner } from './IntegrationForm'
import { RaisedButton } from './ui/button'
import { RaisedModal } from './ui/modal'
import { NumberTicker } from './ui/number-ticker'
import { ReadoutDisplay } from './ui/readout-display'
import { ScrambleText } from './ui/scramble-text'
import { TerminalButton } from './ui/terminal-button'

// credentials stripped server-side
type ConfiguredIntegration = IntegrationsResponse['configured'][number]

type ModulePanelBase = { index?: number }

type ModulePanelProps = Readonly<
	ModulePanelBase & (
	| {
		state: 'connected'
		integration: ConfiguredIntegration
		deviceCount: number
		meta: IntegrationMeta
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
)>

function BezelLed({ lit, error }: Readonly<{ lit: boolean; error?: boolean }>) {
	let ledColor: { bg: string; glow: string }
	if (error) {
		ledColor = { bg: 'radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 50%, #dc2626 100%)', glow: '0 0 4px rgba(239,68,68,0.5), 0 0 8px rgba(239,68,68,0.2)' }
	} else if (lit) {
		ledColor = { bg: 'radial-gradient(circle at 35% 30%, #6ee7b7, #34d399 50%, #059669 100%)', glow: '0 0 4px rgba(52,211,153,0.5), 0 0 8px rgba(52,211,153,0.2)' }
	} else {
		ledColor = { bg: 'radial-gradient(circle at 35% 30%, #a8a29e, #78716c 50%, #57534e 100%)', glow: 'none' }
	}

	return (
		<div
			className="w-2 h-2 rounded-full shrink-0"
			style={{
				background: ledColor.bg,
				boxShadow: ledColor.glow,
			}}
		/>
	)
}

function buildAriaLabel(props: ModulePanelProps): string {
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

// fixed screen height so all modules have identical CRT size
const SCREEN_HEIGHT = 'h-[130px]'

export function ModulePanel(props: ModulePanelProps) {
	const isPowered = props.state === 'connected' || props.state === 'connecting'
	const isError = props.state === 'error'
	const brand = props.meta.brand
	const Icon = BRAND_ICON[brand] ?? FALLBACK_ICON

	const staggerDelay = (props.index ?? 0) * 80

	return (
		<div
			className="rounded-xl flex flex-col transition-[border-color,background,opacity] duration-300"
			style={{
				background: 'linear-gradient(to bottom, #d6d3cc, #c4c0b8)',
				border: '1px solid rgba(168, 151, 125, 0.25)',
				boxShadow: '0 2px 6px rgba(80, 60, 30, 0.08), 0 1px 2px rgba(80, 60, 30, 0.06), inset 0 1px 0 rgba(255,255,255,0.5)',
			}}
		>
			{/* bezel top — LED + brand label on the housing */}
			<div className="flex items-center gap-2 px-3 pt-3 pb-2">
				<BezelLed lit={isPowered} error={isError} />
				<span
					className="font-michroma text-2xs text-stone-500 tracking-[0.15em] uppercase truncate"
					style={{ textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}
				>
					{props.meta.displayName}
				</span>
			</div>

			{/* CRT screen — inset into bezel, fixed height for uniform sizing */}
			<div className="px-3">
				<ReadoutDisplay
					size="lg"
					className={cn('!flex flex-col w-full !items-stretch p-3', SCREEN_HEIGHT)}
					glowIntensity={isPowered ? 0.3 : 0}
					scanlineIntensity={0.06}
					aria-label={buildAriaLabel(props)}
				>
					{/* all screen content — fades in with stagger delay */}
					<div
						className="flex flex-col flex-1 screen-enter"
						style={{ '--stagger': `${staggerDelay}ms` } as React.CSSProperties}
					>
						{/* center: icon + status readout */}
						<div className="flex-1 flex flex-col items-center justify-center gap-1">
							<Icon
								size={28}
								weight="thin"
								className={cn(
									'text-display-text transition-opacity duration-300',
									(!isPowered && !isError) && 'opacity-30',
									isError && 'opacity-30',
								)}
							/>

							{props.state === 'connected' && (
								<>
									<span className="font-ioskeley text-lg text-display-text leading-none">
										<NumberTicker value={props.deviceCount} />
									</span>
									<span className="font-ioskeley text-2xs text-display-text/50 uppercase tracking-wider">
										<ScrambleText value={props.deviceCount === 0 ? 'NO DEVICES' : 'CONNECTED'} range={[0x2800, 0x28FF]} />
									</span>
								</>
							)}

							{props.state === 'available' && (
								<span className="font-ioskeley text-lg tabular-nums text-display-text/20 leading-none">--</span>
							)}

							{props.state === 'error' && (
								<span className="font-ioskeley text-2xs text-red-400 uppercase tracking-wider">
									<ScrambleText value="ERROR" range={[0x2800, 0x28FF]} />
								</span>
							)}

							{props.state === 'connecting' && (
								<span className="font-ioskeley text-2xs text-display-text/50 uppercase tracking-wider animate-pulse">
									<ScrambleText value="CONNECTING..." range={[0x2800, 0x28FF]} />
								</span>
							)}
						</div>

						{/* action buttons */}
						<div className="flex items-center gap-2 pt-1">
							{props.state === 'connected' && (
								<ConnectedActions
									meta={props.meta}
									deviceCount={props.deviceCount}
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
				</ReadoutDisplay>
			</div>

			{/* bezel bottom spacing */}
			<div className="h-3" />
		</div>
	)
}

function ConnectedActions({ meta, deviceCount, onRemove }: Readonly<{
	meta: IntegrationMeta
	deviceCount: number
	onRemove: () => void
}>) {
	return (
		<DialogTrigger>
				<TerminalButton label="REMOVE" variant="destructive" onPress={() => {}} />
				<RaisedModal className="max-w-sm">
					{({ close }) => (
						<>
							<Heading slot="title" className="font-michroma text-2xs text-stone-800 tracking-[0.15em] uppercase mb-2" style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}>
								Remove {meta.displayName}?
							</Heading>
							<p className="font-ioskeley text-xs text-stone-600 mb-5">
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
