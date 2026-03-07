import type { CSSProperties } from 'react'

export function ledStyle(active: boolean, color?: string): CSSProperties | undefined {
	if (active) {
		const c = color ?? 'rgb(52,211,153)'
		return {
			backgroundColor: c,
			boxShadow: `0 0 4px ${c}, 0 0 8px color-mix(in srgb, ${c} 40%, transparent)`,
		}
	}
	if (color) {
		return {
			backgroundColor: `color-mix(in srgb, ${color} 60%, #78716c)`,
			boxShadow: `0 0 2px color-mix(in srgb, ${color} 30%, transparent)`,
		}
	}
	return undefined
}
