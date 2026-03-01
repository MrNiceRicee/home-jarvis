import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import path from 'path'

import * as schema from './schema'

// In a compiled Bun binary, Bun.main starts with '$bunfs://' (virtual bundle FS).
// import.meta.dir then points to the exe's directory — two levels up is wrong.
// Fall back to DB_PATH env var for explicit control, or detect context automatically.
const isCompiledBinary = Bun.main.startsWith('$bunfs://')
const dbPath =
	process.env.DB_PATH ??
	(isCompiledBinary
		? path.join(path.dirname(process.execPath), 'data', 'jarvis.db')
		: path.join(import.meta.dir, '../../data/jarvis.db'))

const sqlite = new Database(dbPath, { create: true })

// Enable WAL mode for better concurrent read performance
sqlite.run('PRAGMA journal_mode=WAL;')
sqlite.run('PRAGMA foreign_keys=ON;')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
