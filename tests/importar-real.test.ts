import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { movimientoStock, producto, stock } from '../src/main/db/schema'
import { abrirBaseDePrueba, type BaseDePrueba } from './ayuda/base'

/**
 * Prueba opt-in contra el archivo de catálogo real.
 *
 * El fixture de `importacion.test.ts` cubre los casos raros, pero no los 681
 * registros de verdad. Esta prueba los corre enteros y de punta a punta. No
 * puede ser parte de CI: el archivo vive fuera del repo.
 *
 * Para correrla:
 *
 *   TROQIO_CATALOGO=/ruta/a/stock.json pnpm vitest run tests/importar-real.test.ts
 */
const RUTA = process.env.TROQIO_CATALOGO

let mockBase: BaseDePrueba

vi.mock('../src/main/db/index', () => ({
  getDb: () => mockBase.db
}))

const { aplicarImportacion, analizarImportacion } = await import('../src/main/importar/aplicar')
const { listarProductos } = await import('../src/main/db/productos')

const args = (contenido: string) => ({
  contenido,
  nombreArchivo: 'stock.json',
  rutaArchivo: RUTA ?? '',
  modo: 'solo-nuevos' as const
})

// Si no está definida la variable, `describe.skip` deja la suite entera
// saltada en vez de fallar.
describe.skipIf(!RUTA)('importación del archivo real', () => {
  let contenido = ''

  beforeAll(() => {
    mockBase = abrirBaseDePrueba('real.db')
    contenido = readFileSync(resolve(RUTA as string), 'utf8')
  })

  afterAll(() => {
    mockBase?.cerrar()
  })

  it('acepta los 681 registros sin rechazar ninguno', () => {
    const informe = analizarImportacion(args(contenido))

    expect(informe.leidos).toBe(681)
    // Este archivo se analysó a mano y no tiene ni un registro inservible.
    // Si aparece un rechazo, el importador cambió y hay que mirarlo.
    expect(informe.rechazados).toEqual([])
    expect(informe.nuevos).toBe(681)
  })

  it('no inventa advertencias', () => {
    const advertencias = analizarImportacion(args(contenido)).advertencias

    // Verificado sobre el archivo real: 0 códigos duplicados, 0 formatos raros
    // y los 677 EAN-13 dan válido el dígito verificador (los otros 4 son 2
    // UPC-A y 2 EAN-8, también válidos).
    expect(advertencias).toEqual([])
  })

  it('entra todo con stock cero y sin movimientos', () => {
    const resultado = aplicarImportacion(args(contenido))
    expect(resultado).toEqual({
      insertados: 681,
      actualizados: 0,
      conservados: 0,
      rechazados: 0
    })

    const filasStock = mockBase.db.select().from(stock).all()
    expect(filasStock).toHaveLength(681)
    expect(filasStock.every(f => f.cantidad === 0)).toBe(true)
    expect(mockBase.db.select().from(movimientoStock).all()).toHaveLength(0)
  })

  it('deja el producto con su fila de stock, sin huérfanos', () => {
    aplicarImportacion(args(contenido))

    const huerfanos = mockBase.sqlite
      .prepare(
        `SELECT count(*) n FROM producto p
         LEFT JOIN stock s ON s.producto_id = p.id
         WHERE s.producto_id IS NULL`
      )
      .get() as { n: number }

    expect(huerfanos.n).toBe(0)
  })

  it('guarda el dato de origen tal cual, con sus tildes y sus comas', () => {
    aplicarImportacion(args(contenido))

    // La búsqueda pliega el texto para COMPARAR, pero lo guardado y lo
    // mostrado quedan exactamente como vino. Si esto cambia, se rompió la
    // promesa de no reescribir el catálogo de la farmacia.
    const conTilde = mockBase.sqlite
      .prepare("SELECT count(*) n FROM producto WHERE principio_activo GLOB '*[ÍÉÓÁÚ]*'")
      .get() as { n: number }
    const conComa = mockBase.sqlite
      .prepare("SELECT count(*) n FROM producto WHERE principio_activo LIKE '%,%'")
      .get() as { n: number }

    expect(conTilde.n).toBeGreaterThan(0)
    expect(conComa.n).toBeGreaterThan(0)
  })

  it('es idempotente sobre los 681 registros', () => {
    aplicarImportacion(args(contenido))
    const segunda = aplicarImportacion(args(contenido))

    expect(segunda).toEqual({
      insertados: 0,
      actualizados: 0,
      conservados: 681,
      rechazados: 0
    })
    expect(mockBase.db.select().from(producto).all()).toHaveLength(681)
    expect(mockBase.db.select().from(stock).all()).toHaveLength(681)
  })

  it('encuentra lo que se busca de verdad', () => {
    aplicarImportacion(args(contenido))

    const buscar = (filtro: string) =>
      listarProductos({ filtro, limite: 1, desplazamiento: 0, incluirInactivos: false }).total

    // Números medidos sobre el archivo real.
    expect(buscar('sodi')).toBe(25)
    expect(buscar('ibuprofeno')).toBe(20)
    expect(buscar('asoc')).toBe(90)

    // Con y sin tilde dan lo mismo: es lo que SQLite no hace solo.
    expect(buscar('cafeína')).toBe(10)
    expect(buscar('cafeina')).toBe(10)

    // La puntuación se respeta: el archivo trae `SODIO,CLORURO`, y hay que
    // buscarlo con la coma.
    expect(buscar('sodio,cloruro')).toBe(3)
    expect(buscar('sodio cloruro')).toBe(0)
  })
})
