import { useThree } from '@react-three/fiber'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/** bridge SSE-driven React Query cache updates to R3F invalidate() */
export function useRackInvalidate() {
	const queryClient = useQueryClient()
	const invalidate = useThree((s) => s.invalidate)

	useEffect(() => {
		const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
			if (
				event.type === 'updated' &&
				typeof event.query.queryKey[0] === 'string' &&
				(event.query.queryKey[0] === 'devices' || event.query.queryKey[0] === 'sections')
			) {
				invalidate()
			}
		})
		return unsubscribe
	}, [queryClient, invalidate])
}
