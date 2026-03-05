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
