import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

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
    integrationId: text('integration_id').references(() => integrations.id),
    brand: text('brand').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    // 'light' | 'switch' | 'thermostat' | 'air_purifier' | 'sensor'
    type: text('type').notNull(),
    state: text('state').notNull().default('{}'), // JSON blob — current device state
    online: integer('online', { mode: 'boolean' }).notNull().default(true),
    homekitEnabled: integer('homekit_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    homekitUuid: text('homekit_uuid'),
    lastSeen: integer('last_seen'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [unique().on(t.brand, t.externalId)]
)

// Singleton row — one HomeKit bridge per server
export const homekitConfig = sqliteTable('homekit_config', {
  id: text('id').primaryKey().default('singleton'),
  pin: text('pin').notNull(), // format: 'XXX-XX-XXX'
  username: text('username').notNull(), // MAC-style string e.g. 'AA:BB:CC:DD:EE:FF'
  port: integer('port').notNull().default(51826),
  paired: integer('paired', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type HomekitConfig = typeof homekitConfig.$inferSelect
