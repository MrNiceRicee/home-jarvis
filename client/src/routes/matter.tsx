import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { MatterOrbital } from '../components/MatterOrbital'
import { ConsolePanel, ConsolePanelLabel } from '../components/ui/console-panel'
import { GaugeReadout } from '../components/ui/gauge-readout'
import { StatusLed } from '../components/ui/status-led'
import { useMatterOrbitalData } from '../hooks/useMatterOrbitalData'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useReadoutStore } from '../stores/readout-store'

export const Route = createFileRoute('/matter')({ component: MatterPage })

// ── helpers ─────────────────────────────────────────────────────────────────

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

type ViewState = 'unpaired' | 'commissioned' | 'paired'

// ── page ────────────────────────────────────────────────────────────────────

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

	const orbitalData = useMatterOrbitalData(bridge ?? undefined)
	const isPaired = bridge?.paired ?? false
	const isRunning = bridge?.status === 'running'

	// transition state machine: unpaired → commissioned (2s hold) → paired
	const viewRef = useRef<ViewState>(isPaired ? 'paired' : 'unpaired')
	const [view, setView] = useState<ViewState>(isPaired ? 'paired' : 'unpaired')
	const commissionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(() => {
		const cancelToken = { canceled: false }

		if (isPaired && viewRef.current === 'unpaired') {
			viewRef.current = 'commissioned'
			setView('commissioned')
			useReadoutStore.getState().pushNotification('bridge: paired')
			// timer starts from onAnimationComplete — not here
		} else if (!isPaired && viewRef.current !== 'unpaired') {
			clearTimeout(commissionTimerRef.current)
			viewRef.current = 'unpaired'
			setView('unpaired')
			useReadoutStore.getState().pushNotification('bridge: disconnected')
		}

		return () => {
			cancelToken.canceled = true
			clearTimeout(commissionTimerRef.current)
		}
	}, [isPaired])

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
	const deviceCount = bridge?.deviceCount ?? 0
	const port = bridge?.port ?? 0
	const showDark = view === 'paired'

	return (
		<div
			className={cn(
				'transition-colors duration-500 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 -mt-8 pt-8 pb-8 min-h-[calc(100vh-3.5rem)]',
				showDark ? 'bg-console-bg' : 'bg-transparent',
			)}
		>
			{/* header */}
			<div className="mb-8">
				<h1
					className={cn(
						'font-michroma text-sm font-semibold tracking-[0.15em] uppercase transition-colors duration-500',
						showDark ? 'text-console-text' : 'text-stone-800',
					)}
				>
					Matter Bridge
				</h1>
				<p
					className={cn(
						'text-sm mt-0.5 transition-colors duration-500',
						showDark ? 'text-console-text-muted' : 'text-stone-400',
					)}
				>
					Expose devices to Apple Home, Google Home, and Alexa
				</p>
			</div>

			{/* main content — animated view transitions */}
			<AnimatePresence mode="wait">
				{view === 'unpaired' && isRunning && (
					<motion.div
						key="unpaired"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						<div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
							<StatusPanel status={status} paired={false} deviceCount={deviceCount} port={port} />
							<QrPanel qrDataUrl={extractQrUrl(qrResponse)} />
						</div>
					</motion.div>
				)}

				{view === 'unpaired' && !isRunning && (
					<motion.div
						key="offline"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						<StatusPanel status={status} paired={false} deviceCount={deviceCount} port={port} />
					</motion.div>
				)}

				{view === 'commissioned' && (
					<motion.div
						key="commissioned"
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.3 }}
						onAnimationComplete={() => {
							commissionTimerRef.current = setTimeout(() => {
								if (viewRef.current !== 'commissioned') return
								viewRef.current = 'paired'
								setView('paired')
							}, 2_000)
						}}
						className="flex flex-col items-center justify-center py-12"
					>
						<div
							className={cn(
								'w-14 h-14 rounded-full flex items-center justify-center',
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
					</motion.div>
				)}

				{view === 'paired' && (
					<motion.div
						key="paired"
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.4, ease: 'easeOut' }}
					>
						{/* orbital visualization */}
						<MatterOrbital data={orbitalData} />

						{/* empty state CTA */}
						{deviceCount === 0 && (
							<p className="font-ioskeley text-xs text-console-text-muted text-center mt-4 tracking-wide">
								Enable devices from the Dashboard to see them here
							</p>
						)}

						{/* console panels below orbital */}
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
							<DarkConsolePanel label="BRIDGE STATUS">
								<div className="flex items-center gap-4 mb-4">
									<StatusLed status={status} />
									<div>
										<p className="font-michroma text-sm font-semibold text-console-text uppercase tracking-wide">
											{statusHeadline(status, true)}
										</p>
										<p className="font-ioskeley text-2xs text-console-text-muted mt-0.5 tracking-wider">
											{statusSubline(status, true, deviceCount)}
										</p>
									</div>
								</div>
								<div className="grid grid-cols-3 gap-3">
									<DarkGauge label="DEVICES" value={deviceCount} />
									<DarkGauge label="PORT" value={port || '—'} />
									<DarkGauge
									label="LINK"
									value={isPaired ? 'OK' : '\u2014'}
									valueClass={isPaired ? 'text-emerald-400' : undefined}
								/>
								</div>
							</DarkConsolePanel>

							{/* error panel */}
							{status === 'error' && (
								<DarkConsolePanel label="ERROR">
									<p className="font-ioskeley text-xs text-red-400 tracking-wide">
										Bridge encountered an error. Check server logs for details.
									</p>
								</DarkConsolePanel>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* info bar (only when running + not in paired dark mode) */}
			{isRunning && !showDark && (
				<div className="mt-6 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-stone-100/60 border border-stone-200/50">
					<span className="text-xs">ℹ️</span>
					<p className="font-ioskeley text-2xs text-stone-500 tracking-wide leading-relaxed">
						MATTER BRIDGE EXPOSES YOUR DEVICES VIA THE MATTER PROTOCOL. COMPATIBLE WITH APPLE HOME, GOOGLE HOME, AND AMAZON ALEXA.
						{!isPaired && ' SCAN THE QR CODE WITH YOUR SMART HOME APP TO PAIR.'}
					</p>
				</div>
			)}
		</div>
	)
}

// ── sub-components ──────────────────────────────────────────────────────────

function StatusPanel({ status, paired, deviceCount, port }: Readonly<{
	status: string
	paired: boolean
	deviceCount: number
	port: number
}>) {
	return (
		<ConsolePanel>
			<ConsolePanelLabel>BRIDGE STATUS</ConsolePanelLabel>
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

// dark console variants for paired mode
function DarkConsolePanel({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
	return (
		<div
			className="rounded-xl overflow-hidden p-5"
			style={{
				background: 'linear-gradient(to bottom, #2e2d27, #23221c)',
				border: '1px solid rgba(168, 151, 125, 0.12)',
				boxShadow: 'inset 0 1px 0 rgba(255, 253, 245, 0.05)',
			}}
		>
			<div className="flex items-center gap-2 mb-4">
				<span className="font-michroma text-2xs font-semibold text-console-text-dim tracking-[0.15em] uppercase">
					{label}
				</span>
				<div className="flex-1 h-px bg-[rgba(168,151,125,0.12)]" />
			</div>
			{children}
		</div>
	)
}

function DarkGauge({ label, value, valueClass }: Readonly<{ label: string; value: string | number; valueClass?: string }>) {
	return (
		<div
			className="rounded-lg px-3 py-2.5 text-center"
			style={{
				background: 'linear-gradient(to bottom, #23221c, #1a1914)',
				border: '1px solid rgba(168, 151, 125, 0.1)',
				boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
			}}
		>
			<p className={cn('font-ioskeley text-lg font-semibold tabular-nums', valueClass ?? 'text-console-text')}>
				{value}
			</p>
			<p className="font-michroma text-[9px] text-console-text-dim tracking-[0.2em] mt-0.5 uppercase">
				{label}
			</p>
		</div>
	)
}
