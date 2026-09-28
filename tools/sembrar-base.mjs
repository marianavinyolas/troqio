/**
 * Siembra una base de datos con los 681 productos del archivo de origen.
 *
 * Es lo mismo que hace `aplicarImportacion`, pero sin pasar por el diálogo de
 * archivos (que no se puede automatizar). Sirve para poder levantar la app real
 * contra un catálogo lleno y verificar la pantalla.
 *
 * Uso: node tools/sembrar-base.mjs <carpetaUserData>
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const [, , userData, origen] = process.argv

if (!userData || !origen) {
  console.error('Uso: node tools/sembrar-base.mjs <carpetaUserData> <archivo.json>')
  process.exit(1)
}

mkdirSync(userData, { recursive: true })

const sqlite = new Database(join(userData, 'troqio.db'))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const db = drizzle(sqlite)
migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') })

const datos = JSON.parse(readFileSync(origen, 'utf8'))
const ahora = Date.now()

const insProducto = sqlite.prepare(
  `INSERT INTO producto (nombre, principio_activo, numero_troquel, codigo_barras,
                          activo, creado_en, actualizado_en)
   VALUES (?, ?, ?, ?, 1, ?, ?)`
)
const insStock = sqlite.prepare('INSERT INTO stock (producto_id, cantidad) VALUES (?, 0)')

const importar = sqlite.transaction(registros => {
  let n = 0
  for (const r of registros) {
    const info = insProducto.run(
      String(r.nombre).trim(),
      r.droga ? String(r.droga).trim() : null,
      r.toquel ? String(r.toquel).trim() : null,
      String(r.barcode).trim(),
      ahora,
      ahora
    )
    insStock.run(info.lastInsertRowid)
    n++
  }
  return n
})

const insertados = importar(datos)
sqlite.close()

const total = Number(
  new Database(join(userData, 'troqio.db'), { readonly: true })
    .prepare('SELECT count(*) n FROM producto')
    .get().n
)

console.log(`sembrado: ${insertados} productos, ${total} en la base`)
console.log(`base: ${join(userData, 'troqio.db')}`)
