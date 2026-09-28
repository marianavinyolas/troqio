import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aplicarMigraciones } from '../src/main/db/migrar'
import { applyPragmas } from '../src/main/db/pragmas'
import * as s from '../src/main/db/schema'

/** Carpeta real de migraciones, igual que la que usa la app. */
const CARPETA = resolve(__dirname, '..', 'drizzle')

let dir: string
let db: Database.Database

/** Base migrada de verdad, con los mismos pragmas que la app. */
function abrirMigrada(): Database.Database {
  const inst = new Database(join(dir, 'test.db'))
  applyPragmas(inst)
  aplicarMigraciones(drizzle(inst, { schema: s }), CARPETA)
  return inst
}

/** Inserta un producto con su fila de stock, como hara el alta en M3. */
function crearProducto(
  sobre: Database.Database = db,
  datos: Partial<{
    nombre: string
    principioActivo: string
    numeroTroquel: string | null
    codigoBarras: string
  }> = {}
): number {
  const { nombre, principioActivo, numeroTroquel, codigoBarras } = {
    nombre: 'IBUPROFENO 400 mg comp.x 20',
    principioActivo: 'IBUPROFENO',
    numeroTroquel: '9950001',
    codigoBarras: '7791234567890',
    ...datos
  }
  const info = sobre
    .prepare(
      `INSERT INTO producto (nombre, principio_activo, numero_troquel, codigo_barras,
                             activo, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, 1, 0, 0)`
    )
    .run(nombre, principioActivo, numeroTroquel, codigoBarras)
  sobre.prepare('INSERT INTO stock (producto_id, cantidad) VALUES (?, 0)').run(info.lastInsertRowid)
  return Number(info.lastInsertRowid)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'troqio-mig-'))
  db = abrirMigrada()
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('migraciones', () => {
  it('crea las tres tablas', () => {
    // `__drizzle_migrations` es la bitacora del migrator, no nuestra.
    const tablas = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'`
      )
      .all()
      .map(f => (f as { name: string }).name)
      .sort()

    expect(tablas).toEqual(['movimiento_stock', 'producto', 'stock'])
  })

  it('crea los cinco indices', () => {
    const indices = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%' ORDER BY name`
      )
      .all()
      .map(f => (f as { name: string }).name)

    expect(indices).toEqual([
      'ix_movimiento_stock_producto',
      'ix_producto_codigo_barras',
      'ix_producto_nombre',
      'ix_producto_numero_troquel',
      'ix_producto_principio_activo'
    ])
  })

  it('es idempotente: correrla de nuevo no cambia nada', () => {
    const antes = db.prepare('SELECT count(*) AS n FROM producto').get()
    const aplicar = () => aplicarMigraciones(drizzle(db, { schema: s }), CARPETA)

    aplicar()
    aplicar()

    expect(db.prepare('SELECT count(*) AS n FROM producto').get()).toEqual(antes)
    // Un solo registro de la bitacora: la migracion no se reaplica.
    expect(db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 1 })
  })

  it('falla con un mensaje util si la carpeta no existe', () => {
    const inst = new Database(join(dir, 'otra.db'))
    try {
      expect(() => aplicarMigraciones(drizzle(inst, { schema: s }), join(dir, 'no-esta'))).toThrow(
        /carpeta de migraciones/i
      )
    } finally {
      inst.close()
    }
  })
})

describe('marcas de tiempo', () => {
  // Verifica el comportamiento real de `$defaultFn` en vez de asumirlo: el
  // nombre sugiere "default", y no siempre significa solo "en el insert".
  const inst = () => drizzle(db, { schema: s })

  it('el insert las completa solo y las devuelve como Date', () => {
    const antes = Date.now()
    const fila = inst()
      .insert(s.producto)
      .values({ nombre: 'IBUPROFENO 400', codigoBarras: '7791234567890' })
      .returning()
      .get()

    expect(fila.creadoEn).toBeInstanceOf(Date)
    expect(fila.actualizadoEn).toBeInstanceOf(Date)
    // timestamp_ms:epoch, no epoch seconds. Un factor 1000 de mas es el error
    // clasico de esto y no lo detecta la base.
    expect(Math.abs(fila.creadoEn.getTime() - antes)).toBeLessThan(5000)
  })

  it('el update no pisa actualizadoEn si no se le pasa', () => {
    const original = new Date('2020-01-02T03:04:05Z')
    const fila = inst()
      .insert(s.producto)
      .values({
        nombre: 'X',
        codigoBarras: '1',
        creadoEn: original,
        actualizadoEn: original
      })
      .returning()
      .get()

    inst().update(s.producto).set({ nombre: 'Y' }).where(eq(s.producto.id, fila.id)).run()

    const despues = inst().select().from(s.producto).where(eq(s.producto.id, fila.id)).get()
    expect(despues).toBeDefined()
    expect(despues?.creadoEn).toEqual(original)
    // Si esto cambiaran, habria que poner la fecha a mano en cada update.
    expect(despues?.actualizadoEn).toEqual(original)
  })
})

describe('producto', () => {
  it('preserva los ceros iniciales del codigo de barras', () => {
    crearProducto(db, { codigoBarras: '0070942507240' })

    const fila = db.prepare('SELECT codigo_barras FROM producto').get() as {
      codigo_barras: unknown
    }
    expect(typeof fila.codigo_barras).toBe('string')
    expect(fila.codigo_barras).toBe('0070942507240')
  })

  it('acepta el numero de troquel ausente', () => {
    expect(() => crearProducto(db, { numeroTroquel: null })).not.toThrow()
  })

  it('exige codigo de barras', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO producto (nombre, codigo_barras, activo, creado_en, actualizado_en)
           VALUES ('X', NULL, 1, 0, 0)`
        )
        .run()
    ).toThrow(/NOT NULL/i)
  })

  it('acepta codigos duplicados: se reportan, no se bloquean', () => {
    // Decision 1.a: sin restriccion UNIQUE. Un typo no puede impedir cargar datos.
    crearProducto(db, { codigoBarras: '7791234567890' })
    expect(() => crearProducto(db, { codigoBarras: '7791234567890' })).not.toThrow()
    expect(db.prepare('SELECT count(*) AS n FROM producto').get()).toEqual({ n: 2 })
  })
})

describe('stock: nunca negativo', () => {
  it('rechaza una cantidad negativa', () => {
    const id = crearProducto(db)
    db.prepare('UPDATE stock SET cantidad = 5 WHERE producto_id = ?').run(id)

    expect(() =>
      db.prepare('UPDATE stock SET cantidad = cantidad - 10 WHERE producto_id = ?').run(id)
    ).toThrow(/CHECK constraint failed/i)

    expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = ?').get(id)).toEqual({
      cantidad: 5
    })
  })

  it('el descuento guardado solo afecta si hay stock suficiente', () => {
    const id = crearProducto(db)
    db.prepare('UPDATE stock SET cantidad = 3 WHERE producto_id = ?').run(id)
    const descontar = db.prepare(
      'UPDATE stock SET cantidad = cantidad - ? WHERE producto_id = ? AND cantidad >= ?'
    )

    expect(descontar.run(2, id, 2).changes).toBe(1)
    expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = ?').get(id)).toEqual({
      cantidad: 1
    })

    // Pide 5 de los 1 restantes: changes = 0, la UI debe avisar.
    expect(descontar.run(5, id, 5).changes).toBe(0)
    expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = ?').get(id)).toEqual({
      cantidad: 1
    })
  })

  it('no permite borrar un producto que tiene stock', () => {
    const id = crearProducto(db)
    expect(() => db.prepare('DELETE FROM producto WHERE id = ?').run(id)).toThrow(
      /FOREIGN KEY constraint failed/i
    )
  })
})

describe('movimiento_stock', () => {
  // `cantidad` admite cualquier cosa a proposito: la idea es probar que la base
  // rechaza lo que sea, no solo lo que el tipado ya filtraria.
  const ingreso = (
    id: number,
    tipo: string,
    cantidad: number | string,
    motivo = 'conteo inicial'
  ) =>
    db
      .prepare(
        'INSERT INTO movimiento_stock (producto_id, tipo, cantidad, motivo, creado_en) VALUES (?, ?, ?, ?, 0)'
      )
      .run(id, tipo, cantidad, motivo)

  it('acepta ingreso y egreso con cantidad positiva', () => {
    const id = crearProducto(db)
    expect(() => ingreso(id, 'ingreso', 12)).not.toThrow()
    expect(() => ingreso(id, 'egreso', 3)).not.toThrow()
  })

  it('acepta un ajuste con signo, en las dos direcciones', () => {
    const id = crearProducto(db)
    // Contar 13 donde habia 8.
    expect(() => ingreso(id, 'ajuste', 5)).not.toThrow()
    // Contar 8 donde el sistema deca 13: la diferencia es -5.
    expect(() => ingreso(id, 'ajuste', -5)).not.toThrow()
  })

  it('rechaza un ajuste de diferencia cero', () => {
    // Un ajuste de 0 no registra nada y solo ensucia el historial.
    const id = crearProducto(db)
    expect(() => ingreso(id, 'ajuste', 0)).toThrow(/CHECK constraint failed/i)
  })

  it('rechaza un ingreso o egreso negativo', () => {
    const id = crearProducto(db)
    expect(() => ingreso(id, 'ingreso', -1)).toThrow(/CHECK constraint failed/i)
    expect(() => ingreso(id, 'egreso', 0)).toThrow(/CHECK constraint failed/i)
  })

  it('rechaza un tipo desconocido', () => {
    const id = crearProducto(db)
    expect(() => ingreso(id, 'borrado', 1)).toThrow(/CHECK constraint failed/i)
  })

  it('no permite borrar un producto con movimientos', () => {
    const id = crearProducto(db)
    ingreso(id, 'ingreso', 4)
    expect(() => db.prepare('DELETE FROM producto WHERE id = ?').run(id)).toThrow(
      /FOREIGN KEY constraint failed/i
    )
  })

  it('rechaza una cantidad que no es un numero entero', () => {
    // SQLite tiene afinidades, no tipos: el texto entra sin convertirse en una
    // columna INTEGER. Los CHECK por eso comparan tambien typeof().
    const id = crearProducto(db)
    expect(() => ingreso(id, 'ingreso', 'muchos')).toThrow(/CHECK constraint failed/i)
    expect(() => ingreso(id, 'ingreso', 2.5)).toThrow(/CHECK constraint failed/i)
  })

  it('tambien rechaza texto o flotantes en el saldo de stock', () => {
    const id = crearProducto(db)
    expect(() =>
      db.prepare('UPDATE stock SET cantidad = ? WHERE producto_id = ?').run('muchos', id)
    ).toThrow(/CHECK constraint failed/i)
    expect(() =>
      db.prepare('UPDATE stock SET cantidad = ? WHERE producto_id = ?').run(1.5, id)
    ).toThrow(/CHECK constraint failed/i)
  })
})
