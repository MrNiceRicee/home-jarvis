import { cn } from '../../lib/cn'

export function ConsolePanel({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
	return (
		<div
			className={cn(
				'rounded-xl overflow-hidden',
				'bg-linear-to-b from-surface-warm to-stone-50/80',
				'border border-[rgba(168,151,125,0.15)]',
				'shadow-[var(--shadow-raised),var(--shadow-inner-glow)]',
				'p-5',
				className,
			)}
		>
			{children}
		</div>
	)
}

export function ConsolePanelLabel({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="flex items-center gap-2 mb-4">
			<span
				className="font-michroma text-2xs font-semibold text-stone-600 tracking-[0.15em] uppercase"
				style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}
			>
				{children}
			</span>
			<div className="flex-1 h-px bg-stone-300/80" />
		</div>
	)
}
