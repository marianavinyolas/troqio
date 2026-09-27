import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { applyPragmas } from './pragmas'

let sqlite: Database.Database | null = null
let db: BetterSQLite3Database | null = null

/**
 * La base vive en userData, NUNCA junto al ejecutable.
 *
 * Windows: %APPDATA%\troqio\troqio.db
 * macOS:   ~/Library/Application Support/troqio/troqio.db
 *
 * Sobrevive a reinstalar la app porque electron-builder no borra userData
 * (`deleteAppDataOnUninstall: false` en electron-builder.yml).
 */
export function getDbPath(): string {
  return join(app.getPath('userData'), 'troqio.db')
}

function open(): Database.Database {
  mkdirSync(app.getPath('userData'), { recursive: true })

  const instance = new Database(getDbPath())
  applyPragmas(instance)
  return instance
}

/** Instancia nativa better-sqlite3. Usar solo para pragmas y diagnostico. */
export function getSqlite(): Database.Database {
  if (!sqlite) sqlite = open()
  return sqlite
}

/** Instancia Drizzle. Esta es la que usaran las queries. */
export function getDb(): BetterSQLite3Database {
  if (!db) db = drizzle(getSqlite())
  return db
}

export function closeDb(): void {
  sqlite?.close()
  sqlite = null
  db = null
}

export function getDbFileStats(): { exists: boolean; sizeBytes: number } {
  try {
    return { exists: true, sizeBytes: statSync(getDbPath()).size }
  } catch {
    return { exists: false, sizeBytes: 0 }
  }
}
