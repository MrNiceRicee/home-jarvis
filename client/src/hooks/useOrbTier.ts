import { useEffect, useState } from 'react'

// breakpoint-driven orb resolution tiers
// larger viewport → more braille chars (same font size) → higher-res orb

interface OrbTier {
	cols: number
	rows: number
	size: number // CSS container width AND viewBox dimension (1:1 = consistent text)
}

const TIERS: { minWidth: number; tier: OrbTier }[] = [
	{ minWidth: 1440, tier: { cols: 33, rows: 27, size: 700 } },
	{ minWidth: 1024, tier: { cols: 27, rows: 23, size: 600 } },
	{ minWidth: 0, tier: { cols: 23, rows: 19, size: 500 } },
]

function getTier(): OrbTier {
	const w = window.innerWidth
	for (const { minWidth, tier } of TIERS) {
		if (w >= minWidth) return tier
	}
	return TIERS[TIERS.length - 1].tier
}

export function useOrbTier(): OrbTier {
	const [tier, setTier] = useState(getTier)

	useEffect(() => {
		// use matchMedia listeners so we only re-render at breakpoints, not every pixel
		const queries = TIERS.map(({ minWidth }) => window.matchMedia(`(min-width: ${minWidth}px)`))

		const handler = () => setTier(getTier())
		for (const mql of queries) {
			mql.addEventListener('change', handler)
		}
		return () => {
			for (const mql of queries) {
				mql.removeEventListener('change', handler)
			}
		}
	}, [])

	return tier
}
