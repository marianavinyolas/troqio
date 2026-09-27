import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyPragmas } from '../src/main/db/pragmas'

function conTemporal(): { db: Database.Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'troqio-test-'))
  return { db: new Database(join(dir, 'test.db')), dir }
}

describe('applyPragmas', () => {
  it('activa WAL', () => {
    const { db, dir } = conTemporal()
    try {
      applyPragmas(db)
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deja foreign_keys activo', () => {
    const { db, dir } = conTemporal()
    try {
      // better-sqlite3 ya activa foreign_keys en cada conexion (a diferencia
      // de sqlite3 puro). applyPragmas lo fija de forma explicita para no
      // depender de ese default del driver, que podria cambiar.
      applyPragmas(db)
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reactiva foreign_keys si alguien la desactivo', () => {
    const { db, dir } = conTemporal()
    try {
      db.pragma('foreign_keys = OFF')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(0)

      applyPragmas(db)
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('garantia de no stock negativo', () => {
  // El CHECK de la columna es la ultima linea de defensa: hace fisicamente
  // imposible que exista stock negativo, aunque la UI tenga un error.
  it('rechaza una cantidad negativa', () => {
    const { db, dir } = conTemporal()
    try {
      db.exec(`
        CREATE TABLE stock (
          producto_id INTEGER PRIMARY KEY,
          cantidad    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0)
        );
        INSERT INTO stock (producto_id, cantidad) VALUES (1, 5);
      `)

      expect(() =>
        db.prepare('UPDATE stock SET cantidad = cantidad - 10 WHERE producto_id = 1').run()
      ).toThrow(/CHECK constraint failed/i)

      expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = 1').get()).toEqual({
        cantidad: 5
      })
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('el descuento guardado atomico solo afecta si hay stock suficiente', () => {
    const { db, dir } = conTemporal()
    try {
      db.exec(`
        CREATE TABLE stock (
          producto_id INTEGER PRIMARY KEY,
          cantidad    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0)
        );
        INSERT INTO stock (producto_id, cantidad) VALUES (1, 3);
      `)

      const descontar = db.prepare(
        'UPDATE stock SET cantidad = cantidad - ? WHERE producto_id = ? AND cantidad >= ?'
      )

      expect(descontar.run(2, 1, 2).changes).toBe(1)
      expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = 1').get()).toEqual({
        cantidad: 1
      })

      // Pide 5 de los 1 restantes: changes = 0, la UI debe avisar.
      expect(descontar.run(5, 1, 5).changes).toBe(0)
      expect(db.prepare('SELECT cantidad FROM stock WHERE producto_id = 1').get()).toEqual({
        cantidad: 1
      })
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
