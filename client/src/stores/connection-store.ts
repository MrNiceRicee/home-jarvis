import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

interface ConnectionState {
	status: StreamStatus
	setStatus: (status: StreamStatus) => void
}

export const useConnectionStore = create<ConnectionState>()(
	devtools(
		(set) => ({
			status: 'connecting' satisfies StreamStatus,
			setStatus: (status) => set({ status }),
		}),
		{ name: 'ConnectionStore' },
	),
)
