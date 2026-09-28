import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { registrarFuncionesDeBusqueda } from '../../src/main/db/buscar'
import { aplicarMigraciones } from '../../src/main/db/migrar'
import { applyPragmas } from '../../src/main/db/pragmas'
import * as schema from '../../src/main/db/schema'

/** Carpeta real de migraciones, igual que la que usa la app. */
export const CARPETA_MIGRACIONES = resolve(__dirname, '..', '..', 'drizzle')

export interface BaseDePrueba {
  db: BetterSQLite3Database<typeof schema>
  sqlite: Database.Database
  cerrar(): void
}

/**
 * Base migrada de verdad, con los mismos pragmas y las mismas funciones SQL
 * que la app.
 *
 * Se construye a mano y no con `getDb()` porque ese pide `app.getPath()`, que
 * solo existe dentro de Electron. En los tests se mockea ese módulo y se
 * inyecta esta base, así que lo que se ejercita es el SQL y las funciones de
 * Drizzle, que es justo lo que hay que probar.
 */
export function abrirBaseDePrueba(nombre = 'test.db'): BaseDePrueba {
  const dir = mkdtempSync(join(tmpdir(), 'troqio-prueba-'))
  const sqlite = new Database(join(dir, nombre))

  applyPragmas(sqlite)
  // Sin esto, cualquier consulta con `fold()` falla con "no such function".
  registrarFuncionesDeBusqueda(sqlite)

  const db = drizzle(sqlite, { schema })
  aplicarMigraciones(db, CARPETA_MIGRACIONES)

  return {
    db,
    sqlite,
    cerrar() {
      sqlite.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
