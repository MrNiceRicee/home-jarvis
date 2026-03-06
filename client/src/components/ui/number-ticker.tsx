import { useEffect, useState } from 'react'

import { cn } from '../../lib/cn'

type NumberTickerProps = Readonly<{
	value: number
	className?: string
	/** tick duration in ms per step (default 60) */
	speed?: number
}>

export function NumberTicker({ value, className, speed = 60 }: NumberTickerProps) {
	const [display, setDisplay] = useState(value)

	useEffect(() => {
		if (display === value) return

		const direction = value > display ? 1 : -1
		const id = setInterval(() => {
			setDisplay((prev) => {
				const next = prev + direction
				if ((direction === 1 && next >= value) || (direction === -1 && next <= value)) {
					clearInterval(id)
					return value
				}
				return next
			})
		}, speed)

		return () => clearInterval(id)
	}, [value, display, speed])

	// reduced motion — skip animation
	const [reducedMotion] = useState(
		() => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
	)

	const shown = reducedMotion ? value : display

	return (
		<span className={cn('tabular-nums', className)}>
			{shown}
		</span>
	)
}
