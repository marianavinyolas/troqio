import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { registrarFuncionesDeBusqueda } from './buscar'
import { aplicarMigraciones } from './migrar'
import { applyPragmas } from './pragmas'
import * as schema from './schema'

let sqlite: Database.Database | null = null
let db: BetterSQLite3Database<typeof schema> | null = null

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
  // Antes de la primera consulta: la búsqueda usa `fold()`, y sin registrarla
  // el error es "no such function: fold" en el primer filtro.
  registrarFuncionesDeBusqueda(instance)
  return instance
}

/** Instancia nativa better-sqlite3. Usar solo para pragmas y diagnostico. */
export function getSqlite(): Database.Database {
  if (!sqlite) sqlite = open()
  return sqlite
}

/**
 * Instancia Drizzle, con el esquema ya aplicado.
 *
 * El orden importa: primero pragmas, despues migraciones. Al reves, la
 * migracion correria con WAL sin configurar.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    const instancia = drizzle(getSqlite(), { schema })
    aplicarMigraciones(instancia)
    db = instancia
  }
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

export { schema }
