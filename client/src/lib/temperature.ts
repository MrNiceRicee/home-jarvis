export type TemperatureUnit = 'C' | 'F'

// celsius to fahrenheit (display only — whole number)
export function cToF(c: number): number {
	if (!Number.isFinite(c)) return 0
	return Math.round((c * 9) / 5 + 32)
}

// format for display: value + unit symbol
export function formatTemp(celsius: number, unit: TemperatureUnit): string {
	if (!Number.isFinite(celsius)) return '--'
	if (unit === 'F') return `${cToF(celsius)}°F`
	return `${Math.round(celsius * 10) / 10}°C`
}

// display value only (no unit symbol) — for ReadoutDisplay
export function displayTemp(celsius: number, unit: TemperatureUnit): string {
	if (!Number.isFinite(celsius)) return '--.-'
	if (unit === 'F') return `${cToF(celsius)}`
	return `${(Math.round(celsius * 10) / 10).toFixed(1)}`
}

// stepper delta in celsius for the given display unit
export function stepperDelta(unit: TemperatureUnit): number {
	// F users expect 1°F steps (~0.56°C), C users expect 0.5°C steps
	return unit === 'F' ? 5 / 9 : 0.5
}

// round a celsius value to the nearest clean display increment
export function roundToStep(celsius: number, unit: TemperatureUnit): number {
	if (unit === 'F') {
		// round-trip through F to get clean F values
		const f = Math.round((celsius * 9) / 5 + 32)
		return ((f - 32) * 5) / 9
	}
	return Math.round(celsius * 2) / 2
}
