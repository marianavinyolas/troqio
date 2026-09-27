import type Database from 'better-sqlite3'

/**
 * Pragmas de la base. Funciones puras sobre la instancia, sin `electron`,
 * para poder testearlas en Node sin levantar la app.
 */
export function applyPragmas(db: Database.Database): void {
  // WAL: mejor resistencia ante caidas + permite leer mientras se escribe.
  db.pragma('journal_mode = WAL')
  // SQLite lo desactiva por defecto y cada conexion nueva lo pierde.
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
}
