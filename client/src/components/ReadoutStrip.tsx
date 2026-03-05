import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { cn } from '../lib/cn'
import { useConnectionStore } from '../stores/connection-store'
import { useReadoutStore } from '../stores/readout-store'
import { ScrambleText } from './ui/scramble-text'
import { useReadoutContext } from './useReadoutContext'

const STATUS_DOT_COLORS: Record<string, string> = {
	connected: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
	reconnecting: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)] animate-pulse',
	connecting: 'bg-stone-400 shadow-[0_0_4px_rgba(168,162,158,0.3)] animate-pulse',
	error: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]',
}

export function ReadoutStrip() {
	const connectionStatus = useConnectionStore((s) => s.status)
	const activeNotification = useReadoutStore((s) => s.activeNotification)
	const dismissNotification = useReadoutStore((s) => s.dismissNotification)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// drive readout slot values from current route
	useReadoutContext()

	const slot1 = useReadoutStore((s) => s.slot1)
	const slot2 = useReadoutStore((s) => s.slot2)

	// auto-dismiss notification after 3 seconds
	useEffect(() => {
		if (!activeNotification) return
		timerRef.current = setTimeout(dismissNotification, 3000)
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [activeNotification, dismissNotification])

	const dotColor = STATUS_DOT_COLORS[connectionStatus] ?? STATUS_DOT_COLORS.connecting

	return (
		<div className="flex items-center gap-3 font-ioskeley text-xs text-stone-500">
			{/* status dot */}
			<div className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />

			{/* slots or notification */}
			<div className="relative flex items-center gap-3 min-w-[180px] overflow-hidden h-5">
				<AnimatePresence mode="wait">
					{activeNotification ? (
						<motion.span
							key={`notif-${activeNotification}`}
							initial={{ y: 12, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -12, opacity: 0 }}
							transition={{ duration: 0.25, ease: 'easeInOut' }}
							className="absolute inset-0 flex items-center text-stone-400 truncate"
							aria-live="polite"
						>
							{activeNotification}
						</motion.span>
					) : (
						<motion.span
							key="slots"
							initial={{ y: -12, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: 12, opacity: 0 }}
							transition={{ duration: 0.25, ease: 'easeInOut' }}
							className="flex items-center gap-3"
						>
							<ScrambleText value={slot1} visible={!activeNotification} />
							<span className="text-stone-500">·</span>
							<ScrambleText value={slot2} visible={!activeNotification} />
						</motion.span>
					)}
				</AnimatePresence>
			</div>
		</div>
	)
}
