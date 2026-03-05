import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { Device, DeviceState } from '../types'

interface DevicePatch {
	state?: Partial<DeviceState>
	online?: boolean
}

interface DeviceStoreState {
	devices: Device[]
	// tracks in-flight optimistic updates — SSE skips these properties until mutation settles
	pendingMutations: Map<string, Set<string>>

	// actions
	setDevices: (devices: Device[]) => void
	updateDevice: (id: string, patch: DevicePatch) => void
	addDevice: (device: Device) => void
	setOffline: (id: string) => void
	addPending: (id: string, properties: string[]) => void
	removePending: (id: string, properties: string[]) => void
}

export const useDeviceStore = create<DeviceStoreState>()(
	devtools(
		(set, get) => ({
			devices: [],
			pendingMutations: new Map(),

			setDevices: (devices) => set({ devices }),

			updateDevice: (id, patch) => {
				const { pendingMutations } = get()
				const pendingProps = pendingMutations.get(id)

				// filter out properties that have in-flight optimistic updates
				let filteredPatch = patch
				if (pendingProps && pendingProps.size > 0 && patch.state) {
					const filteredState = { ...patch.state }
					for (const prop of pendingProps) {
						delete filteredState[prop as keyof DeviceState]
					}
					filteredState satisfies Partial<DeviceState>
					filteredPatch = Object.keys(filteredState).length > 0
						? { ...patch, state: filteredState }
						: { ...patch, state: undefined }
				}

				set({
					devices: get().devices.map((d) =>
						d.id === id
							? {
									...d,
									...(filteredPatch.state ? { state: { ...d.state, ...filteredPatch.state } } : {}),
									...(filteredPatch.online !== undefined ? { online: filteredPatch.online } : {}),
								}
							: d,
					),
				})
			},

			addDevice: (device) => {
				const { devices } = get()
				if (devices.some((d) => d.id === device.id)) return
				set({ devices: [...devices, device] })
			},

			setOffline: (id) =>
				set({ devices: get().devices.map((d) => (d.id === id ? { ...d, online: false } : d)) }),

			addPending: (id, properties) => {
				const map = new Map(get().pendingMutations)
				const existing = map.get(id) ?? new Set()
				for (const p of properties) existing.add(p)
				map.set(id, existing)
				set({ pendingMutations: map })
			},

			removePending: (id, properties) => {
				const map = new Map(get().pendingMutations)
				const existing = map.get(id)
				if (!existing) return
				for (const p of properties) existing.delete(p)
				if (existing.size === 0) map.delete(id)
				set({ pendingMutations: map })
			},
		}),
		{ name: 'DeviceStore' },
	),
)
