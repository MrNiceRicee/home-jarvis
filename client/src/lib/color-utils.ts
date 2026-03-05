import type { DeviceState } from '../types'

// ─── Temperature → RGB ────────────────────────────────────────────────────────

interface RgbAnchor {
	k: number
	r: number
	g: number
	b: number
}

/**
 * sRGB anchor points for correlated color temperature.
 * Interpolating in sRGB avoids OKLCH hue-rotation artifacts (the green zone
 * that appears ~5000K when going from hue 90° to 220° in polar OKLCH space).
 */
const RGB_ANCHORS: readonly RgbAnchor[] = [
	{ k: 2700, r: 255, g: 171, b: 82 }, // warm amber
	{ k: 4000, r: 255, g: 236, b: 205 }, // neutral warm white
	{ k: 6500, r: 214, g: 234, b: 255 }, // cool blue-white
]

/** Map 2700–6500K to a CSS rgb() color string via 3 sRGB anchor points. */
export function tempToColor(kelvin: number): string {
	const clamped = Math.max(2700, Math.min(6500, kelvin))

	let low = RGB_ANCHORS[0]
	let high = RGB_ANCHORS[RGB_ANCHORS.length - 1]
	for (let i = 0; i < RGB_ANCHORS.length - 1; i++) {
		if (clamped <= RGB_ANCHORS[i + 1].k) {
			low = RGB_ANCHORS[i]
			high = RGB_ANCHORS[i + 1]
			break
		}
	}

	const t = (clamped - low.k) / (high.k - low.k)
	const r = Math.round(low.r + (high.r - low.r) * t)
	const g = Math.round(low.g + (high.g - low.g) * t)
	const b = Math.round(low.b + (high.b - low.b) * t)
	return `rgb(${r} ${g} ${b})`
}

// ─── Mired ↔ Kelvin ───────────────────────────────────────────────────────────

export function miredToKelvin(mired: number): number {
	return Math.round(1_000_000 / mired)
}

export function kelvinToMired(kelvin: number): number {
	return Math.round(1_000_000 / kelvin)
}

// ─── Card accent ──────────────────────────────────────────────────────────────

/**
 * Edge-lit acrylic effect: border uses the direct light color, and a soft
 * box-shadow glow scales with brightness (like an LED strip behind frosted
 * panel edge). No header tinting — card surface stays neutral.
 */
export interface LightAccent {
	/** Direct light color for the card border. */
	borderColor: string
	/** Pre-computed CSS box-shadow value for the ambient edge glow. */
	glowShadow: string
}

export function lightAccentStyle(state: DeviceState): LightAccent | undefined {
	if (!state.on) return undefined

	const brt = (state.brightness ?? 100) / 100
	// glow intensity: 30% at 0 brightness → 75% at full brightness
	const glowPct = Math.round(30 + brt * 45)

	if (state.colorTemp !== undefined) {
		const color = tempToColor(state.colorTemp)
		return {
			borderColor: color,
			glowShadow: `0 0 20px 6px color-mix(in srgb, ${color} ${glowPct}%, transparent)`,
		}
	}

	if (state.color !== undefined) {
		const { r, g, b } = state.color
		const color = `rgb(${r} ${g} ${b})`
		return {
			borderColor: color,
			glowShadow: `0 0 20px 6px color-mix(in srgb, ${color} ${glowPct}%, transparent)`,
		}
	}

	return undefined
}

// ─── Shared constants ─────────────────────────────────────────────────────────

export const SCENES = [
	{ name: 'Relax', colorTemp: 2700, brightness: 35 },
	{ name: 'Read', colorTemp: 4000, brightness: 80 },
	{ name: 'Focus', colorTemp: 5500, brightness: 100 },
	{ name: 'Energize', colorTemp: 6500, brightness: 100 },
] as const

export const CCT_SWATCHES = [2700, 3500, 4000, 5000, 6500] as const

export const COLOR_PRESETS = [
	{ label: 'Red', value: { r: 255, g: 30, b: 30 } },
	{ label: 'Orange', value: { r: 255, g: 130, b: 30 } },
	{ label: 'Yellow', value: { r: 255, g: 230, b: 30 } },
	{ label: 'Green', value: { r: 30, g: 200, b: 60 } },
	{ label: 'Blue', value: { r: 30, g: 100, b: 255 } },
	{ label: 'Purple', value: { r: 170, g: 30, b: 255 } },
] as const
