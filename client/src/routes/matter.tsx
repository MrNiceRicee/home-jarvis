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
			setView('commissioned') // eslint-disable-line react-hooks/set-state-in-effect -- sse pairing state sync
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
				'transition-colors duration-500',
				showDark
					? 'fixed inset-0 top-[3.5rem] bg-console-bg overflow-hidden z-20'
					: '-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 bg-transparent px-4 sm:px-6 lg:px-8 pt-8 pb-8 min-h-[calc(100vh-3.5rem)]',
			)}
		>
			{/* header — hidden in HUD mode */}
			{!showDark && (
				<div className="mb-8">
					<h1 className="font-michroma text-sm font-semibold tracking-[0.15em] uppercase text-stone-800">
						Matter Bridge
					</h1>
					<p className="text-sm mt-0.5 text-stone-400">
						Expose devices to Apple Home, Google Home, and Alexa
					</p>
				</div>
			)}

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
						className="relative flex items-center justify-center h-full"
					>
						{/* HUD border frame */}
						<div className="hud-frame">
							<span className="hud-corner-bl" />
							<span className="hud-corner-br" />
						</div>

						{/* corner readouts */}
						<HudReadout position="top-left">
							<div className="flex items-center gap-2">
								<StatusLed status={status} />
								<span className="font-michroma text-2xs text-console-text-muted tracking-[0.15em] uppercase">
									{status === 'running' ? 'RUNNING' : status.toUpperCase()}
								</span>
							</div>
						</HudReadout>

						<HudReadout position="top-right" rotated>
							<span className="font-michroma text-2xs text-console-text tracking-[0.15em] uppercase">
								{isPaired ? 'PAIRED' : status.toUpperCase()}
							</span>
							<span className="font-michroma text-2xs text-console-text-muted tracking-[0.15em] uppercase">
								{isPaired ? 'ACTIVE' : '—'}
							</span>
						</HudReadout>

						<HudReadout position="bottom-left" rotated mirrored>
							<span className="font-ioskeley text-lg text-console-text tabular-nums">
								{deviceCount}
							</span>
							<span className="font-michroma text-[9px] text-console-text-muted tracking-[0.2em] uppercase">
								DEVICES
							</span>
						</HudReadout>

						<HudReadout position="bottom-right">
							<span
								className={cn(
									'font-ioskeley text-lg tabular-nums',
									isPaired ? 'text-emerald-400' : 'text-console-text',
								)}
							>
								{isPaired ? 'OK' : '\u2014'}
							</span>
							<span className="font-michroma text-[9px] text-console-text-muted tracking-[0.2em] uppercase">
								LINK
							</span>
						</HudReadout>

						{/* orbital fills center */}
						<MatterOrbital data={orbitalData} />

						{/* empty state */}
						{deviceCount === 0 && (
							<p className="absolute bottom-16 left-1/2 -translate-x-1/2 font-ioskeley text-xs text-console-text-muted tracking-wide whitespace-nowrap">
								Enable devices from the Dashboard
							</p>
						)}

						{/* error indicator */}
						{status === 'error' && (
							<p className="absolute bottom-16 left-1/2 -translate-x-1/2 font-ioskeley text-xs text-red-400 tracking-wide">
								Fault detected — check server logs
							</p>
						)}
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

// ── HUD readouts ────────────────────────────────────────────────────────────

type HudPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const positionClasses: Record<HudPosition, string> = {
	'top-left': 'top-6 left-6 items-start',
	'top-right': 'top-6 right-6 items-end text-right',
	'bottom-left': 'bottom-6 left-6 items-start',
	'bottom-right': 'bottom-6 right-6 items-end text-right',
}

function HudReadout({ position, children, rotated, mirrored }: Readonly<{
	position: HudPosition
	children: React.ReactNode
	rotated?: boolean
	mirrored?: boolean
}>) {
	return (
		<div className={cn(
			'absolute flex gap-1 z-10',
			rotated ? '[writing-mode:vertical-rl] flex-row' : 'flex-col',
			mirrored && 'rotate-180',
			positionClasses[position],
		)}>
			{children}
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

