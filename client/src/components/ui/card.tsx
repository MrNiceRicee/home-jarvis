import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface CardProps {
	children: ReactNode
	className?: string
	/** optional accent border color (CSS value) */
	accent?: string
	/** dims the card */
	muted?: boolean
	/** highlight ring */
	selected?: boolean
}

export function Card({ children, className, accent, muted, selected }: Readonly<CardProps>) {
	return (
		<div
			className={cn(
				'relative rounded-xl overflow-hidden',
				'bg-linear-to-b from-[#fffdf8] to-stone-50/80',
				'border',
				'shadow-[var(--shadow-raised)]',
				'[box-shadow:var(--shadow-raised),var(--shadow-inner-glow)]',
				'transition-all',
				muted && 'opacity-60',
				selected && 'ring-2 ring-amber-500/70 ring-offset-1',
				className,
			)}
			style={{
				borderColor: accent ?? (muted ? '#e7e5e0' : 'rgba(168,151,125,0.15)'),
				...(accent ? { borderWidth: '2px' } : {}),
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
				'px-4 py-2.5 border-t border-stone-100/80',
				'bg-linear-to-b from-stone-50/30 to-stone-50/60',
				'flex items-center justify-between',
				className,
			)}
		>
			{children}
		</div>
	)
}
