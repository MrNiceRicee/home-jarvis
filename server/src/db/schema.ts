import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const integrations = sqliteTable('integrations', {
	id: text('id').primaryKey(),
	brand: text('brand').notNull().unique(),
	config: text('config').notNull().default('{}'), // JSON blob — credentials, API keys
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
		matterEnabled: integer('matter_enabled', { mode: 'boolean' }).notNull().default(false),
		matterEndpointId: text('matter_endpoint_id'),
		lastSeen: integer('last_seen'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
	},
	(t) => [
		unique().on(t.brand, t.externalId),
		index('idx_devices_integration').on(t.integrationId),
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

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type MatterConfig = typeof matterConfig.$inferSelect
