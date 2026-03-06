import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { ConsolePanel, ConsolePanelLabel } from '../components/ui/console-panel'
import { GaugeReadout } from '../components/ui/gauge-readout'
import { StatusLed } from '../components/ui/status-led'
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
				<span className="font-ioskeley text-xs text-stone-400 animate-pulse tracking-widest">
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
							<p className="font-ioskeley text-xs text-stone-500 mt-3 tracking-wide">
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
					<p className="font-ioskeley text-2xs text-stone-500 tracking-wide leading-relaxed">
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
					<p className="font-michroma text-sm font-semibold text-stone-800 uppercase tracking-wide">
						{statusHeadline(status, paired)}
					</p>
					<p className="font-ioskeley text-2xs text-stone-400 mt-0.5 tracking-wider">
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
						<span className="font-ioskeley text-2xs text-stone-500 animate-pulse tracking-widest">
							LOADING...
						</span>
					</div>
				)}
			</div>

			<p className="font-michroma text-2xs text-stone-400 text-center mt-3 tracking-wide leading-relaxed">
				OPEN YOUR SMART HOME APP AND SCAN THIS CODE
			</p>
		</ConsolePanel>
	)
}
