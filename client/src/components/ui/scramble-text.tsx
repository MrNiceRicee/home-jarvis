import { useEffect, useState } from 'react'
import { useScramble } from 'use-scramble'

import { cn } from '../../lib/cn'

interface ScrambleTextProps {
	value: string
	className?: string
	visible?: boolean
	/** unicode range for scramble characters, e.g. [0x2800, 0x28FF] for braille */
	range?: [number, number]
}

export function ScrambleText({ value, className, visible = true, range }: Readonly<ScrambleTextProps>) {
	const [reducedMotion, setReducedMotion] = useState(
		() => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
	)

	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
		const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
		mq.addEventListener('change', handler)
		return () => mq.removeEventListener('change', handler)
	}, [])

	const shouldAnimate = visible && !reducedMotion

	const { ref } = useScramble({
		text: value,
		speed: shouldAnimate ? 0.8 : 0,
		tick: 1,
		step: 2,
		scramble: 3,
		seed: 0,
		playOnMount: shouldAnimate,
		...(range && { range }),
	})

	if (!shouldAnimate) {
		return (
			<>
				<span className={cn('font-ioskeley', className)} aria-hidden="true">
					{value}
				</span>
				<span className="sr-only" aria-live="polite">{value}</span>
			</>
		)
	}

	return (
		<>
			<span ref={ref} className={cn('font-ioskeley', className)} aria-hidden="true" />
			<span className="sr-only" aria-live="polite">{value}</span>
		</>
	)
}
