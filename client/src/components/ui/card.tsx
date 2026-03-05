import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface CardProps {
	children: ReactNode
	className?: string
	/** optional accent border color (CSS value) */
	accent?: string
	/** optional ambient edge glow (pre-computed CSS box-shadow value) */
	glowShadow?: string
	/** dims the card */
	muted?: boolean
	/** highlight ring */
	selected?: boolean
}

export function Card({ children, className, accent, glowShadow, muted, selected }: Readonly<CardProps>) {
	return (
		<div
			className={cn(
				'relative rounded-lg overflow-hidden',
				'bg-[#fffdf8]',
				'border-2',
				'transition-all duration-200',
				// non-glow cards: tailwind handles base + hover shadow
				!glowShadow && '[box-shadow:var(--shadow-raised),inset_0_1px_0_rgba(255,255,255,0.9)]',
				!glowShadow && 'hover:[box-shadow:var(--shadow-raised-hover),inset_0_1px_0_rgba(255,255,255,0.9)]',
				muted && 'opacity-60',
				selected && 'ring-2 ring-amber-500/70 ring-offset-1',
				className,
			)}
			style={{
				borderColor: accent ?? (muted ? '#e7e5e0' : 'rgba(168,151,125,0.15)'),
				// glow cards: inline shadow includes the edge glow layer
				...(glowShadow && {
					boxShadow: `var(--shadow-raised), inset 0 1px 0 rgba(255,255,255,0.9), ${glowShadow}`,
				}),
			}}
		>
			{children}
		</div>
	)
}

interface CardHeaderProps {
	children: ReactNode
	className?: string
	style?: React.CSSProperties
}

export function CardHeader({ children, className, style }: Readonly<CardHeaderProps>) {
	return (
		<div className={cn('px-4 pt-4 pb-3', className)} style={style}>
			{children}
		</div>
	)
}

export function CardBody({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
	return <div className={cn('px-4 pb-4', className)}>{children}</div>
}

export function CardFooter({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
	return (
		<div
			className={cn(
				'px-3 py-2',
				'flex items-center justify-between gap-2',
				className,
			)}
		>
			{children}
		</div>
	)
}
