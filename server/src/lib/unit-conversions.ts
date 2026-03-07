// shared unit conversion helpers used by matter bridge, device factory, and adapters

// mired (micro reciprocal degrees) <-> kelvin
export function miredToKelvin(mired: number): number {
	return Math.round(1_000_000 / mired)
}

export function kelvinToMired(kelvin: number): number {
	return Math.round(1_000_000 / Math.max(1, kelvin))
}

// 0-100 brightness <-> 0-254 matter level
export function toMatterLevel(brightness: number): number {
	return Math.round(Math.min(100, Math.max(0, brightness)) * 2.54)
}

export function fromMatterLevel(level: number): number {
	return Math.round(Math.min(254, Math.max(0, level)) / 2.54)
}

// celsius -> matter fixed-point (celsius * 100)
export function toMatterTemp(celsius: number): number {
	return Math.round(celsius * 100)
}

// clamp a value to 0-100 percent range
export function clampPercent(value: number): number {
	return Math.round(Math.min(100, Math.max(0, value)))
}

// alias for fan speed clamping (same as clampPercent)
export const toFanPercent = clampPercent

// ─── fahrenheit / celsius (thermostat integrations) ──────────────────────────

export type TemperatureUnit = 'Fahrenheit' | 'Celsius'

// fahrenheit to celsius, 1 decimal place
// uses * 10 / 10 (not / 0.1 * 0.1) to avoid IEEE 754 artifacts
export function fToC(f: number): number {
	if (!Number.isFinite(f)) return 0
	return Math.round(((f - 32) * 5) / 9 * 10) / 10
}

// celsius to whole-number fahrenheit (resideo API expects integers for F accounts)
export function cToF(c: number): number {
	if (!Number.isFinite(c)) return 32
	return Math.round((c * 9) / 5 + 32)
}

// celsius to 0.5C increments (for celsius-native accounts)
export function cToHalfC(c: number): number {
	if (!Number.isFinite(c)) return 0
	return Math.round(c * 2) / 2
}

// convert API temp to internal celsius representation
export function apiToCelsius(value: number, unit: TemperatureUnit): number {
	if (!Number.isFinite(value)) return 0
	if (unit === 'Celsius') return Math.round(value * 10) / 10
	return fToC(value)
}

// convert internal celsius to API's native unit
export function celsiusToApi(celsius: number, unit: TemperatureUnit): number {
	if (!Number.isFinite(celsius)) return 0
	if (unit === 'Celsius') return cToHalfC(celsius)
	return cToF(celsius)
}

// vesync airQuality 1-4 → matter AirQualityEnum
export function toMatterAirQuality(airQuality?: number): number {
	switch (airQuality) {
		case 1:
			return 1 // Good
		case 2:
			return 2 // Fair
		case 3:
			return 4 // Poor
		case 4:
			return 5 // VeryPoor
		default:
			return 0 // Unknown
	}
}
