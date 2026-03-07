import { cn } from '../../lib/cn'

export function GaugeReadout({
	label,
	value,
	valueClass,
}: Readonly<{ label: string; value: string | number; valueClass?: string }>) {
	return (
		<div
			className={cn(
				'rounded-lg px-3 py-2.5 text-center',
				'bg-linear-to-b from-stone-50 to-stone-100/60',
				'border border-stone-200/50',
				'shadow-[var(--shadow-inset)]',
			)}
		>
			<p
				className={cn(
					'font-ioskeley text-lg font-semibold tabular-nums',
					valueClass ?? 'text-stone-800',
				)}
			>
				{value}
			</p>
			<p className="font-michroma text-[9px] text-stone-400 tracking-[0.2em] mt-0.5 uppercase">
				{label}
			</p>
		</div>
	)
}
