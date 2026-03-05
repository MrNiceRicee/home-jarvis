import { asc, eq, sql } from 'drizzle-orm'
import Elysia, { status, t } from 'elysia'

import { db } from '../db'
import { devices, sections } from '../db/schema'
import { log } from '../lib/logger'

const SECTION_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/

export const sectionsController = new Elysia({ prefix: '/api/sections' })
	.decorate('db', db)

	/** list all sections ordered by position */
	.get('', ({ db }) => {
		return db.select().from(sections).orderBy(asc(sections.position)).all()
	})

	/** create a new section — auto-positioned at end */
	.post(
		'',
		({ db, body }) => {
			const name = body.name.trim()
			if (!name || name.length > 50 || !SECTION_NAME_PATTERN.test(name)) {
				return status(400, { error: 'Invalid section name. Max 50 chars, letters/numbers/spaces/dashes/underscores only.' })
			}

			const existing = db.select().from(sections).where(eq(sections.name, name)).get()
			if (existing) {
				return status(409, { error: `Section "${name}" already exists` })
			}

			const maxPos = db
				.select({ max: sql<number>`coalesce(max(${sections.position}), -1)` })
				.from(sections)
				.get()
			const position = (maxPos?.max ?? -1) + 1

			const id = crypto.randomUUID()
			const now = Date.now()
			db.insert(sections)
				.values({ id, name, position, createdAt: now, updatedAt: now })
				.run()

			log.info('section created', { id, name, position })
			return db.select().from(sections).where(eq(sections.id, id)).get()
		},
		{ body: t.Object({ name: t.String() }) },
	)

	/** rename or reposition a section */
	.patch(
		'/:id',
		({ db, params, body }) => {
			const section = db.select().from(sections).where(eq(sections.id, params.id)).get()
			if (!section) return status(404, { error: 'Section not found' })

			const updates: Partial<{ name: string; position: number; updatedAt: number }> = {
				updatedAt: Date.now(),
			}

			if (body.name !== undefined) {
				const name = body.name.trim()
				if (!name || name.length > 50 || !SECTION_NAME_PATTERN.test(name)) {
					return status(400, { error: 'Invalid section name' })
				}
				updates.name = name
			}

			if (body.position !== undefined) {
				if (body.position < 0 || !Number.isInteger(body.position)) {
					return status(400, { error: 'Position must be a non-negative integer' })
				}
				updates.position = body.position
			}

			db.update(sections).set(updates).where(eq(sections.id, params.id)).run()
			log.info('section updated', { id: params.id, ...updates })
			return db.select().from(sections).where(eq(sections.id, params.id)).get()
		},
		{
			body: t.Object({
				name: t.Optional(t.String()),
				position: t.Optional(t.Number()),
			}),
		},
	)

	/** delete a section (must be empty) */
	.delete('/:id', ({ db, params }) => {
		const section = db.select().from(sections).where(eq(sections.id, params.id)).get()
		if (!section) return status(404, { error: 'Section not found' })

		if (params.id === 'home') {
			return status(400, { error: 'Cannot delete the default Home section' })
		}

		const deviceCount = db
			.select({ count: sql<number>`count(*)` })
			.from(devices)
			.where(eq(devices.sectionId, params.id))
			.get()

		if (deviceCount && deviceCount.count > 0) {
			return status(400, { error: 'Cannot delete a section that contains devices. Move devices first.' })
		}

		db.delete(sections).where(eq(sections.id, params.id)).run()
		log.info('section deleted', { id: params.id, name: section.name })
		return { ok: true }
	})
