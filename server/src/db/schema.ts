import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const sections = sqliteTable('sections', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	position: integer('position').notNull().default(0),
	createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
	updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
})

export const integrations = sqliteTable('integrations', {
	id: text('id').primaryKey(),
	brand: text('brand').notNull().unique(),
	config: text('config').notNull().default('{}'), // JSON blob — credentials, API keys
	session: text('session'), // JSON blob — runtime auth state (tokens, expiry). plaintext, same threat model as config
	authError: text('auth_error'), // last auth error message, null = healthy
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
})

export const devices = sqliteTable(
	'devices',
	{
		id: text('id').primaryKey(),
		integrationId: text('integration_id').references(() => integrations.id, {
			onDelete: 'cascade',
		}),
		brand: text('brand').notNull(),
		externalId: text('external_id').notNull(),
		name: text('name').notNull(),
		// 'light' | 'switch' | 'thermostat' | 'air_purifier' | 'sensor'
		type: text('type').notNull(),
		state: text('state').notNull().default('{}'), // JSON blob — current device state
		metadata: text('metadata'), // JSON blob — per-device connection info (ip, port)
		online: integer('online', { mode: 'boolean' }).notNull().default(true),
		hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
		matterEnabled: integer('matter_enabled', { mode: 'boolean' }).notNull().default(false),
		matterEndpointId: text('matter_endpoint_id'),
		sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'restrict' }),
		position: integer('position').notNull(),
		lastSeen: integer('last_seen'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
	},
	(t) => [
		unique().on(t.brand, t.externalId),
		index('idx_devices_integration').on(t.integrationId),
		index('idx_devices_section_position').on(t.sectionId, t.position),
		index('idx_devices_external_id').on(t.externalId),
	],
)

// singleton row — one Matter bridge per server
export const matterConfig = sqliteTable('matter_config', {
	id: text('id').primaryKey().default('singleton'),
	port: integer('port').notNull().default(5540),
	paired: integer('paired', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
})

export type Section = typeof sections.$inferSelect
export type NewSection = typeof sections.$inferInsert
export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type MatterConfig = typeof matterConfig.$inferSelect
