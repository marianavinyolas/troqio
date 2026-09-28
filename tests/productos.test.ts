import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { producto, stock } from '../src/main/db/schema'
import { DatosProductoSchema } from '../src/shared/ipc'
import { abrirBaseDePrueba, type BaseDePrueba } from './ayuda/base'

/**
 * `productos.ts` llega a la base por `getDb()`, que pide
 * `app.getPath('userData')`. Fuera de Electron eso no existe, así que se
 * mockea ese módulo y se le pasa una base migrada de verdad. Lo que se ejercita
 * abajo es el SQL, los CHECK y la traducción a la forma del contrato, no la
 * conexión.
 *
 * El prefijo `mock` de la variable no es decorativo: Vitest lanza error si una
 * fábrica de `vi.mock` referencia de scope externo algo que no empiece por
 * `mock`.
 */
let mockBase: BaseDePrueba

vi.mock('../src/main/db/index', () => ({
  getDb: () => mockBase.db
}))

// Se importa DESPUÉS del mock para que ya esté en su lugar. El import está
// arriba del todo por la regla de `vi.mock`, que sube solo, así que el orden
// de este bloque no es lo que garantiza nada: lo garantiza el hoisting.
const {
  actualizarProducto,
  buscarPorCodigoBarras,
  crearProducto,
  desactivarProducto,
  listarProductos,
  obtenerProducto,
  resumenCatalogo
} = await import('../src/main/db/productos')

const LIMPIO = { filtro: '', limite: 50, desplazamiento: 0, incluirInactivos: false }

function buscar(texto: string) {
  return listarProductos({ ...LIMPIO, filtro: texto }).filas
}

function nuevo(over: Partial<Parameters<typeof crearProducto>[0]> = {}) {
  return crearProducto({
    nombre: 'PRODUCTO',
    principioActivo: null,
    numeroTroquel: null,
    codigoBarras: '7791234567890',
    ...over
  })
}

beforeEach(() => {
  mockBase = abrirBaseDePrueba()
})

afterEach(() => {
  mockBase.cerrar()
})

describe('crearProducto', () => {
  it('crea el producto con su fila de stock en cero', () => {
    // Se pasa por el schema, no directo al repositorio, porque ese es el
    // camino real: renderer → Zod → repositorio → base. El recorte de espacios
    // vive en el schema (que es donde se puede decir "el nombre es
    // obligatorio" con un mensaje útil), no en el repositorio. Un repositorio
    // que recortara sin validar convertiría un nombre de tres espacios en un
    // nombre vacío, que es peor.
    const creado = crearProducto(
      DatosProductoSchema.parse({
        nombre: '  IBUPROFENO 400 mg comp.x 20  ',
        principioActivo: 'IBUPROFENO',
        numeroTroquel: '9950001',
        codigoBarras: '7791234567890'
      })
    )

    expect(creado.nombre).toBe('IBUPROFENO 400 mg comp.x 20')
    expect(creado.cantidad).toBe(0)
    expect(creado.activo).toBe(true)

    // La fila de stock es parte del alta, no un afterthought.
    const filas = mockBase.db.select().from(stock).all()
    expect(filas).toHaveLength(1)
    expect(filas[0]?.productoId).toBe(creado.id)
    expect(filas[0]?.cantidad).toBe(0)
  })

  it('devuelve las fechas como texto ISO, no como Date', () => {
    const creado = nuevo()

    expect(typeof creado.creadoEn).toBe('string')
    expect(creado.creadoEn).toBe(new Date(creado.creadoEn).toISOString())
    expect(Number.isNaN(Date.parse(creado.creadoEn))).toBe(false)
  })

  it('acepta dos productos con el mismo código de barras', () => {
    // A propósito: `codigo_barras` y `numero_troquel` están indexados pero NO
    // son únicos, y un duplicado avisa, no bloquea. Este test falla el día que
    // alguien agregue un UNIQUE creyendo que está arreglando algo.
    nuevo({ nombre: 'A' })
    nuevo({ nombre: 'B' })

    expect(listarProductos(LIMPIO).total).toBe(2)
  })
})

describe('listarProductos', () => {
  beforeEach(() => {
    nuevo({
      nombre: 'ACTRON 400 mg caps.x 20',
      principioActivo: 'IBUPROFENO',
      numeroTroquel: '9950001',
      codigoBarras: '7791234567890'
    })
    nuevo({
      nombre: 'CLORURO DE SODIO 20% amp.x 5',
      principioActivo: 'SODIO,CLORURO',
      numeroTroquel: '9950002',
      codigoBarras: '7791234567891'
    })
    nuevo({
      nombre: 'ASPIRINA CÁPSULAS',
      principioActivo: 'ACETILSALICÍLICO,AC.',
      numeroTroquel: null,
      codigoBarras: '7791234567892'
    })
  })

  it('devuelve todo cuando no hay filtro, con el total completo', () => {
    const { filas, total } = listarProductos(LIMPIO)
    expect(total).toBe(3)
    expect(filas).toHaveLength(3)
  })

  it('filtra por nombre sin distinguir mayúsculas', () => {
    expect(buscar('actron').map(p => p.nombre)).toEqual(['ACTRON 400 mg caps.x 20'])
    expect(buscar('ACTRON')).toHaveLength(1)
  })

  it('filtra por principio activo', () => {
    expect(buscar('ibuprofeno')).toHaveLength(1)
  })

  it('filtra por código de barras', () => {
    expect(buscar('7791234567891')).toHaveLength(1)
  })

  // SQLite no pliega acentos: `LIKE` y `lower()` solo tratan ASCII. Sin la
  // función `fold()` registrada, buscar "capsulas" no encuentra "CÁPSULAS", y
  // con 104 de 681 productos acentuados eso es un agujero real.
  it('encuentra con tilde escrita y sin tilde escrita', () => {
    expect(buscar('cápsulas')).toHaveLength(1)
    expect(buscar('capsulas')).toHaveLength(1)
    expect(buscar('acetilsalicilico')).toHaveLength(1)
    expect(buscar('acetilsalicílico')).toHaveLength(1)
  })

  // La puntuación del dato se respeta: si viene `SODIO,CLORURO`, hay que
  // buscarlo con la coma. Arreglar el dato mal puesto es otra cosa; acomodar
  // la búsqueda para disimularlo no.
  it('respeta la puntuación: "sodio,cloruro" encuentra a "SODIO,CLORURO"', () => {
    expect(buscar('sodio,cloruro')).toHaveLength(1)
  })

  it('no acomoda la puntuación: "sodio cloruro" NO encuentra a "SODIO,CLORURO"', () => {
    expect(buscar('sodio cloruro')).toHaveLength(0)
  })

  it('no invierte el orden de las palabras', () => {
    // El dato está escrito con la sal primero. Desarmar la frase en tokens
    // para tolerar "cloruro sodio" es trabajo de la búsqueda de M5, no del
    // filtro de este hito. Acá se documenta la límite, no se promete.
    expect(buscar('cloruro sodio')).toHaveLength(0)
  })

  it('escapa los comodines de LIKE', () => {
    // Sin `ESCAPE`, un filtro de "%" trae el catálogo entero. Con el escape,
    // "%" busca un signo de porcentaje de verdad: en este catálogo hay uno, en
    // "CLORURO DE SODIO 20%", y solo tiene que salir ese.
    expect(buscar('%').map(p => p.nombre)).toEqual(['CLORURO DE SODIO 20% amp.x 5'])
    // "_" no aparece en ningún nombre, así que no encuentra nada.
    expect(buscar('_')).toEqual([])
  })

  it('no encuentra nada con un texto que no existe', () => {
    expect(buscar('xyzxyzxyz')).toEqual([])
  })

  it('pagina sin repetir ni saltear filas', () => {
    for (let i = 0; i < 12; i++) {
      nuevo({
        nombre: `PRODUCTO ${String(i).padStart(2, '0')}`,
        codigoBarras: `7790000000${String(i).padStart(3, '0')}`
      })
    }

    // 3 del `beforeEach` + 12 de acá = 15. Dos páginas de 10 cubren las dos.
    const primera = listarProductos({ ...LIMPIO, limite: 10, desplazamiento: 0 })
    const segunda = listarProductos({ ...LIMPIO, limite: 10, desplazamiento: 10 })

    // `total` cuenta los que pasan el filtro, no los de la página.
    expect(primera.total).toBe(15)
    expect(segunda.total).toBe(15)

    const ids = [...primera.filas, ...segunda.filas].map(p => p.id)
    expect(new Set(ids).size).toBe(15)
  })
})

describe('actualizarProducto', () => {
  it('cambia los datos y deja el stock como estaba', () => {
    const creado = nuevo({ nombre: 'VIEJO', principioActivo: 'VIEJO', numeroTroquel: '1' })

    // Se carga stock a mano para comprobar que editar no lo pisa.
    mockBase.db.update(stock).set({ cantidad: 42 }).where(eq(stock.productoId, creado.id)).run()

    const editado = actualizarProducto(creado.id, {
      nombre: 'NUEVO',
      principioActivo: 'NUEVO',
      numeroTroquel: '2',
      codigoBarras: '7791234567890'
    })

    expect(editado?.nombre).toBe('NUEVO')
    expect(editado?.cantidad).toBe(42)
  })

  it('actualiza `actualizado_en` explícitamente', () => {
    // `creado_en`/`actualizado_en` se llenan con `$defaultFn`, que NO vuelve a
    // correr en un UPDATE. Si acá no se setea a mano, editar un producto deja
    // la fecha de creación y el historial queda mintiendo.
    const creado = nuevo({ nombre: 'X' })

    const viejo = 1_000_000_000_000 // 2001-09-09, una fecha que no sale por casualidad
    mockBase.db
      .update(producto)
      .set({ actualizadoEn: new Date(viejo) })
      .where(eq(producto.id, creado.id))
      .run()

    const editado = actualizarProducto(creado.id, {
      nombre: 'Y',
      principioActivo: null,
      numeroTroquel: null,
      codigoBarras: '7791234567890'
    })

    expect(editado?.actualizadoEn).not.toBe(new Date(viejo).toISOString())
  })

  it('devuelve null si el producto no existe', () => {
    expect(
      actualizarProducto(9999, {
        nombre: 'X',
        principioActivo: null,
        numeroTroquel: null,
        codigoBarras: '7791234567890'
      })
    ).toBeNull()
  })
})

describe('desactivarProducto', () => {
  it('saca el producto de la lista pero lo conserva', () => {
    const creado = nuevo()

    desactivarProducto(creado.id)

    expect(listarProductos(LIMPIO).total).toBe(0)
    // Sigue estando: la baja es lógica, para no romper los movimientos que lo
    // apuntan (las claves foráneas son ON DELETE RESTRICT).
    expect(obtenerProducto(creado.id)?.activo).toBe(false)
  })

  it('se puede volver a listar con `incluirInactivos`', () => {
    const creado = nuevo()
    desactivarProducto(creado.id)

    expect(listarProductos({ ...LIMPIO, incluirInactivos: true }).total).toBe(1)
  })

  it('no lo devuelve la búsqueda por código de barras', () => {
    const creado = nuevo()
    desactivarProducto(creado.id)

    // Un producto dado de baja no se puede vender por escáner.
    expect(buscarPorCodigoBarras('7791234567890')).toBeNull()
  })

  it('es idempotente', () => {
    const creado = nuevo()
    desactivarProducto(creado.id)
    const primera = obtenerProducto(creado.id)?.actualizadoEn
    desactivarProducto(creado.id)

    // El WHERE exige `activo = 1`, así que la segunda pasada no toca nada y
    // tampoco patea la fecha.
    expect(obtenerProducto(creado.id)?.actualizadoEn).toBe(primera)
  })
})

describe('buscarPorCodigoBarras', () => {
  beforeEach(() => nuevo())

  it('es exacto, no por subcadena', () => {
    expect(buscarPorCodigoBarras('7791234567890')?.nombre).toBe('PRODUCTO')
    // El escáner manda el código completo; un parcial no debe devolver un
    // producto que no es.
    expect(buscarPorCodigoBarras('7791234567')).toBeNull()
  })

  it('devuelve null si no existe', () => {
    expect(buscarPorCodigoBarras('0000000000000')).toBeNull()
  })
})

describe('resumenCatalogo', () => {
  it('cuenta lo que hay para el encabezado del catálogo', () => {
    const conStock = nuevo({ nombre: 'CON STOCK', codigoBarras: '7791234567890' })
    nuevo({ nombre: 'SIN STOCK', codigoBarras: '7791234567891' })
    const dadoDeBaja = nuevo({ nombre: 'DADO DE BAJA', codigoBarras: '7791234567892' })

    mockBase.db.update(stock).set({ cantidad: 7 }).where(eq(stock.productoId, conStock.id)).run()
    desactivarProducto(dadoDeBaja.id)

    expect(resumenCatalogo()).toEqual({
      total: 3,
      activos: 2,
      inactivos: 1,
      conStock: 1,
      // Solo los activos: un producto dado de baja no es un faltante que haya
      // que reponer.
      sinStock: 1
    })
  })

  it('no cuenta un producto que no tiene fila de stock como "con stock"', () => {
    // El invariante dice que todo producto la tiene, pero el LEFT JOIN no lo
    // puede garantizar. Ante datos rotos se cuenta como 0, que es lo menos
    // confuso, en vez de dejarlo fuera del total.
    const info = mockBase.db
      .insert(producto)
      .values({
        nombre: 'HUERFANO',
        principioActivo: null,
        numeroTroquel: null,
        codigoBarras: '7791234567899',
        activo: true,
        creadoEn: new Date(),
        actualizadoEn: new Date()
      })
      .run()

    expect(info.changes).toBe(1)
    const resumen = resumenCatalogo()
    expect(resumen.total).toBe(1)
    expect(resumen.conStock).toBe(0)
    expect(resumen.sinStock).toBe(1)
  })
})
