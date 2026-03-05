import { Link } from '@tanstack/react-router'

import { cn } from '../lib/cn'
import { ReadoutStrip } from './ReadoutStrip'

function NavItem({ to, label }: Readonly<{ to: string; label: string }>) {
	return (
		<Link
			to={to}
			className={cn(
				'relative flex items-center gap-2 px-3 py-1.5 text-sm font-ioskeley lowercase transition-all',
				'text-stone-400 hover:text-stone-700',
				'[&.active]:text-stone-800',
			)}
			activeOptions={to === '/' ? { exact: true } : undefined}
			aria-current={undefined}
		>
			{/* LED dot — active only */}
			<span
				className={cn(
					'w-1.5 h-1.5 rounded-full transition-all',
					'bg-transparent',
					'[.active_&]:bg-emerald-400 [.active_&]:shadow-[0_0_6px_rgba(52,211,153,0.5)]',
				)}
			/>
			{label}
		</Link>
	)
}

export function Navbar() {
	return (
		<nav
			className="sticky top-0 z-10 border-b border-[rgba(168,151,125,0.12)]"
			style={{
				background: 'linear-gradient(to bottom, rgba(255,253,248,0.95), rgba(245,242,236,0.9))',
				boxShadow: '0 1px 4px rgba(120,90,50,0.04), 0 6px 20px rgba(120,90,50,0.03), 0 12px 40px rgba(120,90,50,0.02), inset 0 -1px 0 rgba(120,90,50,0.06)',
				backdropFilter: 'blur(12px)',
			}}
		>
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-14">
					{/* left: nav items */}
					<div className="flex items-center gap-1">
						<NavItem to="/" label="/dashboard" />
						<NavItem to="/integrations" label="/integrations" />
						<NavItem to="/matter" label="/matter" />
					</div>
					{/* right: readout strip */}
					<ReadoutStrip />
				</div>
			</div>
		</nav>
	)
}
