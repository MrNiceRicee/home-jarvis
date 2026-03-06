import { useCallback, useEffect, useRef } from 'react'

import type { BrandResult } from '../stores/scan-store'

import { cn } from '../lib/cn'
import { BrailleWave } from './ui/braille-wave'
import { ReadoutDisplay } from './ui/readout-display'
import { ScrambleText } from './ui/scramble-text'
import { TerminalButton } from './ui/terminal-button'

const MAX_LINES = 200

interface ScanLogProps {
	brands: string[]
	brandResults: BrandResult[]
	scanning: boolean
	done: boolean
	error?: string
	brandDisplayName: (brand: string) => string
	onRescan?: () => void
}

interface LogEntry {
	brand: string
	text: string
	status: 'scanning' | 'found' | 'error' | 'done'
	count?: number
}

function buildLogEntries(
	brands: string[],
	brandResults: BrandResult[],
	scanning: boolean,
	done: boolean,
	error: string | undefined,
	brandDisplayName: (brand: string) => string,
): LogEntry[] {
	const completedSet = new Map(brandResults.map((r) => [r.brand, r]))
	const entries: LogEntry[] = []

	for (const brand of brands) {
		const result = completedSet.get(brand)
		const name = brandDisplayName(brand)
		if (result) {
			if (result.error) {
				entries.push({ brand, text: `scanning ${name}`, status: 'error' })
			} else {
				entries.push({ brand, text: `scanning ${name}`, status: 'found', count: result.count })
			}
		} else if (scanning) {
			entries.push({ brand, text: `scanning ${name}...`, status: 'scanning' })
		} else if (error) {
			// SSE dropped — incomplete brands show as error
			entries.push({ brand, text: `scanning ${name}`, status: 'error' })
		}
	}

	if (done) {
		const allErrored = brandResults.length > 0 && brandResults.every((r) => r.error)
		entries.push({
			brand: '__done',
			text: allErrored ? 'scan failed' : 'scan complete',
			status: 'done',
		})
	}

	return entries.slice(-MAX_LINES)
}

export function ScanLog({ brands, brandResults, scanning, done, error, brandDisplayName, onRescan }: Readonly<ScanLogProps>) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAtBottomRef = useRef(true)
	const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	const checkAtBottom = useCallback(() => {
		const el = scrollRef.current
		if (!el) return
		isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
	}, [])

	const entries = buildLogEntries(brands, brandResults, scanning, done, error, brandDisplayName)

	// auto-scroll when new entries arrive (only if user is at bottom)
	useEffect(() => {
		if (!isAtBottomRef.current) return
		clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = setTimeout(() => {
			scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
		}, 100)
		return () => clearTimeout(scrollTimerRef.current)
	}, [entries.length])

	// find the last brand that is currently scanning (for cursor placement)
	const lastScanningBrand = [...entries].reverse().find((e) => e.status === 'scanning')?.brand

	const isEmpty = entries.length === 0 && !scanning && !error

	return (
		<div>
			<div
				className="rounded-xl"
				style={{
					background: 'linear-gradient(to bottom, #d6d3cc, #c4c0b8)',
					border: '1px solid rgba(168, 151, 125, 0.25)',
					boxShadow: '0 2px 6px rgba(80, 60, 30, 0.08), 0 1px 2px rgba(80, 60, 30, 0.06), inset 0 1px 0 rgba(255,255,255,0.5)',
					padding: '10px',
				}}
			>
			<ReadoutDisplay
				size="lg"
				className="!inline-flex w-full !items-start"
				aria-label="Scan log"
				scanlineIntensity={0.06}
				scanlineTint="rgba(180, 240, 200, 0.06)"
			>
				<div
					ref={scrollRef}
					role="log"
					aria-live="polite"
					className="h-[120px] w-full overflow-y-auto font-ioskeley text-xs leading-relaxed"
					onScroll={checkAtBottom}
					style={{ WebkitOverflowScrolling: 'touch' }}
				>
					{isEmpty && (
						<p className="text-display-text/50 py-2">awaiting scan...</p>
					)}
					{entries.map((entry) => {
						if (entry.status === 'done') {
							const allErrored = brandResults.length > 0 && brandResults.every((r) => r.error)
							return (
								<div key={entry.brand} className={cn('grid grid-cols-[1fr_auto] gap-4 py-0.5', allErrored ? 'text-red-400' : 'text-emerald-400')}>
									<span><ScrambleText value={entry.text} /></span>
									{onRescan && (
										<TerminalButton label="RESCAN" onPress={onRescan} />
									)}
								</div>
							)
						}

						return (
							<div
								key={entry.brand}
								className={cn(
									'grid grid-cols-[1fr_auto] gap-4 py-0.5',
									entry.status === 'error' && 'text-red-400',
									entry.status === 'scanning' && 'text-display-text/60',
								)}
							>
								<span className="truncate">
									<ScrambleText value={entry.text} />
									{entry.brand === lastScanningBrand && (
										<span className="scan-cursor ml-0.5">{'\u2588'}</span>
									)}
								</span>
								<span className="tabular-nums text-right">
									{entry.status === 'found' && <ScrambleText value={`${entry.count} found`} />}
									{entry.status === 'error' && <ScrambleText value="ERROR" />}
									{entry.status === 'scanning' && <BrailleWave isActive />}
								</span>
							</div>
						)
					})}
					{error && !done && (
						<div className="text-red-400 py-0.5">
							<ScrambleText value={error} />
						</div>
					)}
					{onRescan && scanning && (
						<div className="mt-2 mb-1">
							<TerminalButton
								label="RESCAN"
								onPress={onRescan}
								isDisabled
							/>
						</div>
					)}
				</div>
			</ReadoutDisplay>
			</div>
			{done && brandResults.reduce((s, r) => s + r.count, 0) === 0 && (
				<p className="font-ioskeley text-2xs text-stone-400 mt-2 tracking-wide">
					No new devices detected. Make sure your hubs are powered on and connected to the network.
				</p>
			)}
		</div>
	)
}
