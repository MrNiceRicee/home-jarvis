import type { Device } from '../db/schema'
import type { DeviceState, SanitizedDevice } from '../integrations/types'
import { parseJson } from './parse-json'

/** strip metadata from device payloads before sending over SSE */
export function sanitizeDevice({ metadata: _, state, ...rest }: Device): SanitizedDevice {
	return { ...rest, state: parseJson<DeviceState>(state).unwrapOr({}) }
}
