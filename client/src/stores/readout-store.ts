import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ReadoutState {
	statusColor: string
	slot1: string
	slot2: string
	activeNotification: string | null

	// actions
	setSlot1: (value: string) => void
	setSlot2: (value: string) => void
	setStatusColor: (color: string) => void
	pushNotification: (message: string) => void
	dismissNotification: () => void
}

export const useReadoutStore = create<ReadoutState>()(
	devtools(
		(set) => ({
			statusColor: 'stone',
			slot1: '--',
			slot2: '--',
			activeNotification: null,

			setSlot1: (value) => set({ slot1: value }),
			setSlot2: (value) => set({ slot2: value }),
			setStatusColor: (color) => set({ statusColor: color }),
			pushNotification: (message) => set({ activeNotification: message }),
			dismissNotification: () => set({ activeNotification: null }),
		}),
		{ name: 'ReadoutStore' },
	),
)
