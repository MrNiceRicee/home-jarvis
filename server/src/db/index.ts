import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import path from 'path'

import * as schema from './schema'

const dbPath = path.join(import.meta.dir, '../../data/jarvis.db')

const sqlite = new Database(dbPath, { create: true })

// Enable WAL mode for better concurrent read performance
sqlite.run('PRAGMA journal_mode=WAL;')
sqlite.run('PRAGMA foreign_keys=ON;')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
