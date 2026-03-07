import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TemperatureUnit } from '../lib/temperature'

export type { TemperatureUnit }

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
