// duplicated intentionally — runtime import from server package risks Vite side-effect bundling
/** extract a message from an unknown thrown value — replaces `(e as Error).message` */
export function toErrorMessage(e: unknown): string {
	if (e instanceof Error) return e.message
	if (typeof e === 'string') return e
	return String(e)
}
