import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TemperatureUnit = 'C' | 'F'

interface PreferencesState {
	temperatureUnit: TemperatureUnit
	setTemperatureUnit: (unit: TemperatureUnit) => void
}

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set) => ({
			temperatureUnit: 'F',
			setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),
		}),
		{ name: 'jarvis-preferences' },
	),
)
