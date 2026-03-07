import { eq, sql } from 'drizzle-orm'

import type { DB } from '../db'
import { devices } from '../db/schema'

/** compute MAX(position) + 1 within a section for insertion ordering */
export function nextPosition(db: DB, sectionId: string): number {
	const result = db
		.select({ max: sql<number>`coalesce(max(${devices.position}), -1)` })
		.from(devices)
		.where(eq(devices.sectionId, sectionId))
		.get()
	return (result?.max ?? -1) + 1
}
