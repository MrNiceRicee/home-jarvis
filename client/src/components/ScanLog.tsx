import { useCallback, useEffect, useRef } from 'react'

import type { BrandResult } from '../stores/scan-store'

import { cn } from '../lib/cn'
import { ReadoutDisplay } from './ui/readout-display'

const MAX_LINES = 200

interface ScanLogProps {
	brands: string[]
	brandResults: BrandResult[]
	scanning: boolean
	done: boolean
	error?: string
	brandDisplayName: (brand: string) => string
}

interface LogEntry {
	brand: string
	text: string
	status: 'scanning' | 'found' | 'error'
	count?: number
}

function buildLogEntries(
	brands: string[],
	brandResults: BrandResult[],
	scanning: boolean,
	done: boolean,
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
			entries.push({ brand, text: `scanning ${name}`, status: 'scanning' })
		}
	}

	if (done) {
		const total = brandResults.reduce((sum, r) => sum + r.count, 0)
		entries.push({ brand: '__done', text: 'scan complete', status: 'found', count: total })
	}

	return entries.slice(-MAX_LINES)
}

export function ScanLog({ brands, brandResults, scanning, done, error, brandDisplayName }: Readonly<ScanLogProps>) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAtBottomRef = useRef(true)
	const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	const checkAtBottom = useCallback(() => {
		const el = scrollRef.current
		if (!el) return
		isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
	}, [])

	// auto-scroll when new entries arrive (only if user is at bottom)
	const entries = buildLogEntries(brands, brandResults, scanning, done, brandDisplayName)
	useEffect(() => {
		if (!isAtBottomRef.current) return
		clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = setTimeout(() => {
			scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
		}, 100)
		return () => clearTimeout(scrollTimerRef.current)
	}, [entries.length])

	const isEmpty = entries.length === 0 && !scanning && !error

	return (
		<div>
			<ReadoutDisplay
				size="lg"
				className="!inline-flex w-full !items-start"
				aria-label="Scan log"
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
					{entries.map((entry) => (
						<div
							key={`${entry.brand}-${entry.status}`}
							className={cn(
								'grid grid-cols-[1fr_auto] gap-4',
								entry.status === 'error' && 'text-red-400',
								entry.status === 'scanning' && 'text-display-text/60 animate-pulse',
							)}
						>
							<span className="truncate">
								{entry.text}
								{entry.status === 'scanning' && '...'}
							</span>
							<span className="tabular-nums text-right">
								{entry.status === 'found' && `${entry.count} found`}
								{entry.status === 'error' && 'ERROR'}
								{entry.status === 'scanning' && '...'}
							</span>
						</div>
					))}
					{error && (
						<div className="text-red-400">{error}</div>
					)}
				</div>
			</ReadoutDisplay>
			{done && brandResults.reduce((s, r) => s + r.count, 0) === 0 && (
				<p className="font-ioskeley text-2xs text-stone-400 mt-2 tracking-wide">
					No new devices detected. Make sure your hubs are powered on and connected to the network.
				</p>
			)}
		</div>
	)
}
