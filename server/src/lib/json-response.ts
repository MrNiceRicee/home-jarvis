/** Return a JSON error response with correct Content-Type so Eden Treaty can parse it */
export function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}
