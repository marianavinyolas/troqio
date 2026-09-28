import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

/**
 * Aplicacion de migraciones.
 *
 * Sin esto, la app abre una base nueva contra un esquema inexistente y el
 * primer `select` revienta con "no such table". Las migraciones corren una vez
 * por version, dentro de una transaccion, y son idempotentes: volver a
 * aplicarlas sobre una base al dia no hace nada.
 *
 * ⭐ LA RUTA TIENE QUE SER LA MISMA EN DESARROLLO Y EN LA APP EMPAQUETADA.
 *
 *   desarrollo:  <repo>/out/main/index.js   ->  <repo>/drizzle
 *   empaquetada: app.asar/out/main/index.js  ->  app.asar/drizzle
 *
 * En los dos casos la carpeta esta dos niveles arriba del bundle, asi que la
 * misma expresion sirve. Electron deja leer el asar como si fuera una carpeta
 * comun, asi que no hace falta desenpaquetar las migraciones. Por eso
 * `electron-builder.yml` incluye `drizzle/**` en `files`.
 */
export function getMigrationsFolder(): string {
  return join(__dirname, '..', '..', 'drizzle')
}

/**
 * Aplica las migraciones pendientes. Idempotente: solo corre las que faltan.
 *
 * El generico sigue al del migrator de drizzle, para que la base pueda traer
 * cualquier esquema y no solo el de la app.
 */
export function aplicarMigraciones<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema>,
  carpeta: string = getMigrationsFolder()
): void {
  if (!existsSync(carpeta)) {
    // Si esto se dispara, casi siempre es que `drizzle/**` quedo fuera del
    // `files` de electron-builder y la app instalada no encuentra el esquema.
    throw new Error(
      `No se encuentra la carpeta de migraciones en "${carpeta}". ` +
        'Verifica que drizzle/** esté incluido en electron-builder.yml (files).'
    )
  }

  migrate(db, { migrationsFolder: carpeta })
}
