import { Result } from 'neverthrow'

import { toErrorMessage } from './error-utils'

/**
 * Type-safe JSON.parse wrapped in neverthrow Result.
 * Caller specifies the expected type via generic — no `as` casts at call sites.
 *
 * @example
 * const state = parseJson<DeviceState>(raw).unwrapOr({})
 */
export function parseJson<T>(raw: string): Result<T, Error> {
	return Result.fromThrowable(
		(s: string): T => JSON.parse(s) as T,
		(e) => new Error(`Invalid JSON: ${toErrorMessage(e)}`),
	)(raw)
}
