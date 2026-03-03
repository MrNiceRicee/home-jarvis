import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { api } from '../lib/api'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/matter')({ component: MatterPage })

// ── Status text helpers ──────────────────────────────────────────────────────

function statusHeadline(status: string, paired: boolean): string {
	if (status === 'running') return paired ? 'Paired & Active' : 'Awaiting Pairing'
	if (status === 'starting') return 'Initializing…'
	if (status === 'error') return 'Fault Detected'
	return 'Offline'
}

function statusSubline(status: string, paired: boolean, deviceCount: number): string {
	if (status !== 'running') return 'bridge not operational'
	if (paired) return `${deviceCount} device${deviceCount === 1 ? '' : 's'} bridged`
	return 'scan QR to commission'
}

function extractQrUrl(response: unknown): string | undefined {
	if (typeof response === 'object' && response !== null && 'qr' in response) {
		return (response as { qr: string }).qr
	}
	return undefined
}

// ── Page ─────────────────────────────────────────────────────────────────────

function MatterPage() {
	const { data: bridge, isLoading } = useQuery({
		queryKey: ['matter'],
		queryFn: async () => {
			const { data, error } = await api.api.matter.get()
			if (error) throw error
			return data
		},
		refetchInterval: 10_000,
	})

	const { data: qrResponse } = useQuery({
		queryKey: ['matter', 'qr'],
		queryFn: async () => {
			const { data, error } = await api.api.matter.qr.get()
			if (error) throw error
			return data
		},
		enabled: !!bridge && bridge.status === 'running' && !bridge.paired,
	})

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24">
				<span className="font-mono text-xs text-stone-400 animate-pulse tracking-widest">
					CONNECTING...
				</span>
			</div>
		)
	}

	const status = bridge?.status ?? 'stopped'
	const paired = bridge?.paired ?? false
	const deviceCount = bridge?.deviceCount ?? 0

	return (
		<div>
			{/* header */}
			<div className="mb-8">
				<h1 className="text-xl font-semibold text-stone-900">Matter Bridge</h1>
				<p className="text-sm text-stone-400 mt-0.5">
					Expose devices to Apple Home, Google Home, and Alexa
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
				{/* main panel */}
				<StatusPanel
					status={status}
					paired={paired}
					deviceCount={deviceCount}
					port={bridge?.port ?? 0}
				/>

				{/* QR panel — only when running + not paired */}
				{status === 'running' && !paired && (
					<QrPanel qrDataUrl={extractQrUrl(qrResponse)} />
				)}

				{/* paired confirmation */}
				{status === 'running' && paired && (
					<ConsolePanel className="text-center">
						<ConsolePanelLabel>COMMISSION</ConsolePanelLabel>
						<div className="py-4">
							<div
								className={cn(
									'w-14 h-14 mx-auto rounded-full flex items-center justify-center',
									'bg-linear-to-b from-emerald-50 to-emerald-100/60',
									'border border-emerald-200/60',
									'shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_3px_rgba(120,90,50,0.06)]',
								)}
							>
								<span className="text-2xl">✓</span>
							</div>
							<p className="font-mono text-xs text-stone-500 mt-3 tracking-wide">
								COMMISSIONED
							</p>
						</div>
					</ConsolePanel>
				)}
			</div>

			{/* info bar */}
			{status === 'running' && (
				<div className="mt-6 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-stone-100/60 border border-stone-200/50">
					<span className="text-xs">ℹ️</span>
					<p className="font-mono text-[10px] text-stone-500 tracking-wide leading-relaxed">
						MATTER BRIDGE EXPOSES YOUR DEVICES VIA THE MATTER PROTOCOL. COMPATIBLE WITH APPLE HOME, GOOGLE HOME, AND AMAZON ALEXA.
						{!paired && ' SCAN THE QR CODE WITH YOUR SMART HOME APP TO PAIR.'}
					</p>
				</div>
			)}
		</div>
	)
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusPanel({ status, paired, deviceCount, port }: Readonly<{
	status: string
	paired: boolean
	deviceCount: number
	port: number
}>) {
	return (
		<ConsolePanel>
			<ConsolePanelLabel>BRIDGE STATUS</ConsolePanelLabel>

			{/* status LED row */}
			<div className="flex items-center gap-4 mb-6">
				<StatusLed status={status} />
				<div>
					<p className="font-mono text-sm font-semibold text-stone-800 uppercase tracking-wide">
						{statusHeadline(status, paired)}
					</p>
					<p className="font-mono text-[10px] text-stone-400 mt-0.5 tracking-wider">
						{statusSubline(status, paired, deviceCount)}
					</p>
				</div>
			</div>

			{/* gauge row */}
			<div className="grid grid-cols-3 gap-3">
				<GaugeReadout label="DEVICES" value={deviceCount} />
				<GaugeReadout label="PORT" value={port || '—'} />
				<GaugeReadout
					label="LINK"
					value={paired ? 'OK' : '—'}
					valueClass={paired ? 'text-emerald-700' : undefined}
				/>
			</div>
		</ConsolePanel>
	)
}

function ConsolePanel({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
	return (
		<div
			className={cn(
				'rounded-xl overflow-hidden',
				'bg-linear-to-b from-[#fffdf8] to-stone-50/80',
				'border border-[rgba(168,151,125,0.15)]',
				'shadow-[var(--shadow-raised),var(--shadow-inner-glow)]',
				'p-5',
				className,
			)}
		>
			{children}
		</div>
	)
}

function ConsolePanelLabel({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="flex items-center gap-2 mb-4">
			<span className="font-mono text-[10px] font-semibold text-stone-400 tracking-[0.15em] uppercase">
				{children}
			</span>
			<div className="flex-1 h-px bg-stone-200/60" />
		</div>
	)
}

function StatusLed({ status }: Readonly<{ status: string }>) {
	const color =
		status === 'running' ? 'bg-emerald-400 shadow-emerald-400/50'
		: status === 'starting' ? 'bg-amber-400 shadow-amber-400/50 animate-pulse'
		: status === 'error' ? 'bg-red-400 shadow-red-400/50'
		: 'bg-stone-300 shadow-stone-300/30'

	return (
		<div className="relative flex items-center justify-center w-10 h-10">
			{/* bezel ring */}
			<div
				className={cn(
					'absolute inset-0 rounded-full',
					'bg-linear-to-b from-stone-200 to-stone-300',
					'shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),0_1px_0_rgba(255,255,255,0.6)]',
				)}
			/>
			{/* inset well */}
			<div
				className={cn(
					'absolute inset-[3px] rounded-full',
					'bg-linear-to-b from-stone-700 to-stone-800',
					'shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]',
				)}
			/>
			{/* LED dot */}
			<div className={cn('relative w-3.5 h-3.5 rounded-full', color, 'shadow-[0_0_6px_currentColor]')} />
		</div>
	)
}

function GaugeReadout({ label, value, valueClass }: Readonly<{ label: string; value: string | number; valueClass?: string }>) {
	return (
		<div
			className={cn(
				'rounded-lg px-3 py-2.5 text-center',
				'bg-linear-to-b from-stone-50 to-stone-100/60',
				'border border-stone-200/50',
				'shadow-[var(--shadow-inset)]',
			)}
		>
			<p className={cn('font-mono text-lg font-semibold tabular-nums', valueClass ?? 'text-stone-800')}>
				{value}
			</p>
			<p className="font-mono text-[9px] text-stone-400 tracking-[0.2em] mt-0.5 uppercase">
				{label}
			</p>
		</div>
	)
}

function QrPanel({ qrDataUrl }: Readonly<{ qrDataUrl?: string }>) {
	return (
		<ConsolePanel className="w-64">
			<ConsolePanelLabel>SCAN TO PAIR</ConsolePanelLabel>

			{/* QR screen — CRT-esque frame */}
			<div
				className={cn(
					'aspect-square rounded-lg overflow-hidden mx-auto',
					'bg-linear-to-b from-stone-800 to-stone-900',
					'border border-stone-600/30',
					'shadow-[inset_0_2px_6px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.05)]',
					'p-3',
				)}
			>
				{qrDataUrl ? (
					<img
						src={qrDataUrl}
						alt="Matter pairing QR code"
						className="w-full h-full rounded-sm"
						style={{ imageRendering: 'pixelated' }}
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<span className="font-mono text-[10px] text-stone-500 animate-pulse tracking-widest">
							LOADING...
						</span>
					</div>
				)}
			</div>

			<p className="font-mono text-[10px] text-stone-400 text-center mt-3 tracking-wide leading-relaxed">
				OPEN YOUR SMART HOME APP AND SCAN THIS CODE
			</p>
		</ConsolePanel>
	)
}
