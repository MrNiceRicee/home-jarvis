import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { DetectedDevice } from '../types'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

export interface BrandResult {
	brand: string
	count: number
	error?: string
}

export interface ScanState {
	status: ScanStatus
	devices: DetectedDevice[]
	brands: string[]
	brandResults: BrandResult[]
	error?: string
}

interface ScanStoreState extends ScanState {
	setScanState: (updater: (prev: ScanState) => ScanState) => void
	reset: () => void
}

const INITIAL: ScanState = {
	status: 'idle',
	devices: [],
	brands: [],
	brandResults: [],
}

export const useScanStore = create<ScanStoreState>()(
	devtools(
		(set, get) => ({
			...INITIAL,

			setScanState: (updater) => {
				const state = get()
				const prev: ScanState = {
					status: state.status,
					devices: state.devices,
					brands: state.brands,
					brandResults: state.brandResults,
					error: state.error,
				}
				set(updater(prev))
			},

			reset: () => set(INITIAL),
		}),
		{ name: 'ScanStore' },
	),
)
