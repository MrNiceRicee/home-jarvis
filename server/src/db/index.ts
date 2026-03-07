import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'node:fs'
import path from 'path'

import { env } from '../lib/env'
import * as schema from './schema'

// In a compiled Bun binary:
//   - Linux/macOS: Bun.main starts with '$bunfs://'
//   - Windows:     Bun.main starts with 'B:/~BUN/' (virtual drive letter for the bundle FS)
// Both indicate we're running from a compiled exe, not source.
const isCompiledBinary = Bun.main.startsWith('$bunfs://') || Bun.main.includes('~BUN')
const dbPath =
	env.DB_PATH ??
	(isCompiledBinary
		? path.join(path.dirname(process.execPath), 'data', 'jarvis.db')
		: path.join(import.meta.dir, '../../data/jarvis.db'))

// Ensure the data directory exists — SQLite cannot create a file whose parent dir is missing.
mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath, { create: true })

// WAL mode for concurrent reads, busy_timeout so hot-reload doesn't hit SQLITE_BUSY
sqlite.run('PRAGMA journal_mode=WAL;')
sqlite.run('PRAGMA busy_timeout=3000;')
sqlite.run('PRAGMA foreign_keys=ON;')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
