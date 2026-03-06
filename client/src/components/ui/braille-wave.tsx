import { useEffect, useState } from 'react'

import { cn } from '../../lib/cn'

// 4 braille height levels: empty → bottom row → bottom 3 rows → full
const LEVELS = ['\u2800', '\u28C0', '\u28F6', '\u28FF'] as const

// symmetric 9-char pulse shape (indices into LEVELS)
const WAVE_SHAPE = [0, 1, 2, 3, 2, 1, 0, 0, 0] as const
const WAVE_LEN = WAVE_SHAPE.length

function buildWave(offset: number): string {
	return Array.from({ length: WAVE_LEN }, (_, i) => {
		const idx = (i + offset) % WAVE_LEN
		return LEVELS[WAVE_SHAPE[idx]]
	}).join('')
}

type BrailleWaveProps = Readonly<{
	isActive: boolean
	className?: string
}>

export function BrailleWave({ isActive, className }: BrailleWaveProps) {
	const [wave, setWave] = useState(() => buildWave(0))

	// reduced motion check
	const [reducedMotion, setReducedMotion] = useState(
		() => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
	)

	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
		const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
		mq.addEventListener('change', handler)
		return () => mq.removeEventListener('change', handler)
	}, [])

	useEffect(() => {
		if (!isActive || reducedMotion) return

		let offset = Math.floor(Math.random() * WAVE_LEN) // eslint-disable-line sonarjs/pseudo-random -- cosmetic animation offset
		const id = setInterval(() => {
			offset = (offset + 1) % WAVE_LEN
			setWave(buildWave(offset))
		}, 120)

		return () => clearInterval(id)
	}, [isActive, reducedMotion])

	if (reducedMotion) {
		return (
			<span className={cn('font-ioskeley', className)}>
				<span aria-hidden="true">SCANNING...</span>
				<span className="sr-only">Scanning</span>
			</span>
		)
	}

	return (
		<span className={cn('font-ioskeley', className)} style={{ fontFamily: "'IoskeleyMono', 'BrailleFallback', monospace" }}>
			<span aria-hidden="true">{wave}</span>
			<span className="sr-only">Scanning</span>
		</span>
	)
}
