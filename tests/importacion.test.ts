import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movimientoStock, producto, stock } from '../src/main/db/schema'
import { abrirBaseDePrueba, type BaseDePrueba } from './ayuda/base'

/**
 * Ver `tests/productos.test.ts`: el módulo `db/index` pide `app.getPath()`,
 * que solo existe en Electron, así que se mockea y se le pasa una base
 * migrada de verdad. Lo que se ejercita es el SQL y el análisis del archivo.
 */
let mockBase: BaseDePrueba

vi.mock('../src/main/db/index', () => ({
  getDb: () => mockBase.db
}))

const { analizarContenido, armarInforme, checksumValido } = await import(
  '../src/main/importar/leer'
)
const { aplicarImportacion, analizarImportacion } = await import('../src/main/importar/aplicar')

/**
 * Fixture, no el archivo real.
 *
 * El archivo de origen vive en el Downloads de una máquina y no puede ser
 * dependencia de CI. El fixture reproduce todos los casos raros que salieron al
 * analizar los 681 registros: la grafía mal escrita `toquel`, la correcta
 * `troquel`, un código con ceros iniciales, UPC-A de 12, EAN-8 de 8, un
 * duplicado, uno sin troquel, y los que hay que rechazar.
 */
const FIXTURE = readFileSync(resolve(__dirname, 'fixtures', 'catalogo.json'), 'utf8')

/** El fixture tiene 16 registros: 10 importables, 5 rechazados, 1 duplicado. */
const IMPORTABLES = 10
const RECHAZADOS = 5
const DUPLICADOS = 1

function args(over: Partial<Parameters<typeof analizarImportacion>[0]> = {}) {
  return {
    contenido: FIXTURE,
    nombreArchivo: 'catalogo.json',
    rutaArchivo: 'C:/tmp/catalogo.json',
    modo: 'solo-nuevos' as const,
    ...over
  }
}

function filasProductos() {
  return mockBase.db.select().from(producto).all()
}

function ponerStock(productoId: number, cantidad: number) {
  mockBase.db.update(stock).set({ cantidad }).where(eq(stock.productoId, productoId)).run()
}

beforeEach(() => {
  mockBase = abrirBaseDePrueba()
})

afterEach(() => {
  mockBase.cerrar()
})

describe('checksumValido', () => {
  it('acepta los formatos que hay en el archivo de origen', () => {
    // Los cuatro formatos no-EAN-13 del archivo real dan válidos, así que hoy
    // esta función no descarta nada. Queda por si un archivo futuro trae uno
    // mal tipeado.
    expect(checksumValido('4015630058501')).toBe(true) // EAN-13, del archivo real
    expect(checksumValido('650240011351')).toBe(true) // UPC-A, del archivo real
    expect(checksumValido('77908384')).toBe(true) // EAN-8, del archivo real
    expect(checksumValido('7791234567898')).toBe(true) // EAN-13
  })

  it('rechaza un dígito verificador incorrecto', () => {
    expect(checksumValido('7791234567950')).toBe(false)
    expect(checksumValido('77908385')).toBe(false)
  })

  it('rechaza longitudes que no llevan verificador', () => {
    expect(checksumValido('1234567890')).toBe(false) // 10 dígitos, no es un formato
    expect(checksumValido('')).toBe(false)
  })
})

describe('analizarContenido', () => {
  it('lee los productos válidos y cuenta lo que leyó', () => {
    const { validos, leidos } = analizarContenido(FIXTURE)

    expect(leidos).toBe(16)
    expect(validos[0]).toEqual({
      nombre: 'IBUPROFENO 400 mg comp.x 20',
      principioActivo: 'IBUPROFENO',
      numeroTroquel: '9950001',
      codigoBarras: '7791234567898'
    })
  })

  it('acepta la grafía mal escrita `toquel` y la correcta `troquel`', () => {
    const { validos } = analizarContenido(FIXTURE)
    const porNombre = new Map(validos.map(v => [v.nombre, v]))

    // El archivo de origen dice "toquel" en los 681 registros. Si algún día el
    // sistema de origen lo corrige, el importador tiene que seguir leyéndolo.
    expect(porNombre.get('IBUPROFENO 400 mg comp.x 20')?.numeroTroquel).toBe('9950001')
    expect(porNombre.get('TROQUEL CON LA GRAFIA CORRECTA')?.numeroTroquel).toBe('9950010')
  })

  it('deja el número de troquel en null cuando no viene', () => {
    const { validos } = analizarContenido(FIXTURE)
    expect(validos.find(v => v.nombre === 'SIN NUMERO DE TROQUEL')?.numeroTroquel).toBeNull()
  })

  it('conserva los ceros iniciales del código de barras', () => {
    // El código es TEXT justamente por esto: como número, 0070942507240
    // perdería los ceros de la izquierda y el escáner no lo encontraría nunca.
    const { validos } = analizarContenido(FIXTURE)
    expect(validos.find(v => v.nombre === 'CÓDIGO CON CEROS INICIALES')?.codigoBarras).toBe(
      '0070942507240'
    )
  })

  it('rechaza lo que no se puede usar, diciendo por qué', () => {
    const { rechazados } = analizarContenido(FIXTURE)

    expect(rechazados.map(r => `${r.registro}: ${r.motivo}`)).toEqual([
      '10: El registro no es un objeto',
      '11: Falta el nombre comercial',
      '12: Falta el código de barras',
      '13: El código de barras "779ABC" no es un número de 8 a 14 dígitos',
      '14: El código de barras "123" no es un número de 8 a 14 dígitos'
    ])
  })

  it('el rechazo dice en qué registro del archivo está el problema', () => {
    // Posición dentro del arreglo, empezando en 1: es lo único que permite
    // encontrar el registro en el JSON original.
    const { rechazados } = analizarContenido(FIXTURE)
    const sinNombre = rechazados.find(r => r.motivo.includes('nombre'))

    expect(sinNombre?.registro).toBe(11)
    expect(sinNombre?.codigoBarras).toBe('7791234567942')
  })

  it('se queda con el primero cuando el archivo repite un código', () => {
    const { validos, duplicadosEnArchivo } = analizarContenido(FIXTURE)

    expect(duplicadosEnArchivo).toBe(DUPLICADOS)
    const delCodigo = validos.filter(v => v.codigoBarras === '7791234567904')
    expect(delCodigo).toHaveLength(1)
    expect(delCodigo[0]?.nombre).toBe('CLORURO DE SODIO 20% amp.x 5')
  })

  it('avisa de los códigos con verificador roto, sin descartarlos', () => {
    const { validos, advertencias } = analizarContenido(FIXTURE)

    const aviso = advertencias.find(a => a.tipo === 'checksum-invalido')
    expect(aviso?.veces).toBe(1)
    expect(aviso?.ejemplos[0]).toContain('7791234567950')

    // Advertencia, no rechazo: puede ser un código interno sin verificador.
    expect(validos.some(v => v.codigoBarras === '7791234567950')).toBe(true)
  })

  it('avisa de los códigos que no son un formato real', () => {
    const aviso = analizarContenido(FIXTURE).advertencias.find(a => a.tipo === 'codigo-ilegible')
    expect(aviso?.veces).toBe(1)
    expect(aviso?.ejemplos[0]).toBe('123456789 (9 dígitos)')
  })

  it('avisa de los productos sin número de troquel, agrupados', () => {
    const aviso = analizarContenido(FIXTURE).advertencias.find(
      a => a.tipo === 'sin-numero-de-troquel'
    )
    expect(aviso?.veces).toBe(1)
    expect(aviso?.ejemplos).toEqual(['SIN NUMERO DE TROQUEL'])
  })

  it('agrupa los duplicados en un solo aviso', () => {
    const repetido = JSON.stringify([
      { nombre: 'A', barcode: '7791234567898' },
      { nombre: 'B', barcode: '7791234567898' },
      { nombre: 'C', barcode: '7791234567898' },
      { nombre: 'D', barcode: '7791234567904' }
    ])

    const { validos, duplicadosEnArchivo, advertencias } = analizarContenido(repetido)
    expect(duplicadosEnArchivo).toBe(2)
    expect(validos).toHaveLength(2)

    const avisos = advertencias.filter(a => a.tipo === 'codigo-duplicado-en-archivo')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]?.veces).toBe(2)
  })

  it('no inventa advertencias cuando el archivo está limpio', () => {
    const limpio = JSON.stringify([
      { nombre: 'A', droga: 'B', toquel: '1', barcode: '7791234567898', units: 0 }
    ])

    expect(analizarContenido(limpio).advertencias).toEqual([])
  })

  it('falla claro si el archivo no es JSON', () => {
    expect(() => analizarContenido('{ esto no es json')).toThrow(/no es un JSON válido/)
  })

  it('falla claro si el JSON no es una lista', () => {
    expect(() => analizarContenido('{"productos": []}')).toThrow(/lista de productos/)
  })
})

describe('analizarImportacion', () => {
  it('cuenta todo como nuevo con la base vacía', () => {
    const informe = analizarImportacion(args())

    expect(informe.leidos).toBe(16)
    expect(informe.nuevos).toBe(IMPORTABLES)
    expect(informe.aActualizar).toBe(0)
    expect(informe.aConservar).toBe(0)
    expect(informe.rechazados).toHaveLength(RECHAZADOS)
  })

  it('avisa que todos los productos entran con stock cero', () => {
    // Los 681 registros del archivo de origen traen `units: 0`, que es un
    // artefacto de la exportación y no un conteo. El informe lo dice antes de
    // que el usuario lo descubra viendo todo en cero.
    expect(analizarImportacion(args()).todosEntranEnCero).toBe(true)
  })

  it('no escribe nada', () => {
    analizarImportacion(args())

    expect(filasProductos()).toHaveLength(0)
    expect(mockBase.db.select().from(stock).all()).toHaveLength(0)
  })

  it('con el modo por defecto conserva lo que ya existe', () => {
    aplicarImportacion(args())
    // Se edita a mano, como haría el usuario en la pantalla.
    mockBase.db.update(producto).set({ nombre: 'EDITADO A MANO' }).run()

    const informe = analizarImportacion(args())
    expect(informe.nuevos).toBe(0)
    expect(informe.aConservar).toBe(IMPORTABLES)
    expect(informe.aActualizar).toBe(0)
  })

  it('con `actualizar` cuenta los que se van a pisar', () => {
    aplicarImportacion(args())

    const informe = analizarImportacion(args({ modo: 'actualizar' }))
    expect(informe.aActualizar).toBe(IMPORTABLES)
    expect(informe.aConservar).toBe(0)
    expect(informe.nuevos).toBe(0)
  })
})

describe('armarInforme', () => {
  it('clasifica cada producto contra lo que hay en la base', () => {
    const analisis = analizarContenido(FIXTURE)
    const existentes = new Set(['7791234567898', '7791234567904'])

    const informe = armarInforme(
      { nombre: 'catalogo.json', ruta: 'C:/tmp/catalogo.json', bytes: 100 },
      analisis,
      existentes,
      'solo-nuevos'
    )

    expect(informe.nuevos).toBe(IMPORTABLES - 2)
    expect(informe.aConservar).toBe(2)
    expect(informe.aActualizar).toBe(0)
    expect(informe.archivo.bytes).toBe(100)
  })
})

describe('aplicarImportacion', () => {
  it('inserta los productos con su fila de stock', () => {
    const resultado = aplicarImportacion(args())

    expect(resultado).toEqual({
      insertados: IMPORTABLES,
      actualizados: 0,
      conservados: 0,
      rechazados: RECHAZADOS + DUPLICADOS
    })

    const filasStock = mockBase.db.select().from(stock).all()
    expect(filasStock).toHaveLength(IMPORTABLES)
    expect(filasStock.every(f => f.cantidad === 0)).toBe(true)
  })

  it('entra todo con stock cero y sin movimientos', () => {
    // El archivo trae `units: 0` en todos los registros, que no es un conteo
    // real. Si la importación fabricara movimientos, el libro mentiría: el
    // stock real se carga en el conteo (M4), que es lo que va a dejar el
    // primer ingreso.
    aplicarImportacion(args())

    expect(mockBase.db.select().from(movimientoStock).all()).toHaveLength(0)
    expect(
      mockBase.db
        .select()
        .from(stock)
        .all()
        .every(f => f.cantidad === 0)
    ).toBe(true)
  })

  it('es idempotente: correrlo dos veces no duplica nada', () => {
    aplicarImportacion(args())
    const segunda = aplicarImportacion(args())

    expect(segunda).toEqual({
      insertados: 0,
      actualizados: 0,
      conservados: IMPORTABLES,
      rechazados: RECHAZADOS + DUPLICADOS
    })
    expect(filasProductos()).toHaveLength(IMPORTABLES)
    expect(mockBase.db.select().from(stock).all()).toHaveLength(IMPORTABLES)
  })

  it('con `solo-nuevos` no pisa una edición manual', () => {
    aplicarImportacion(args())
    mockBase.db.update(producto).set({ nombre: 'EDITADO A MANO' }).run()

    aplicarImportacion(args())

    expect(filasProductos().filter(p => p.nombre === 'EDITADO A MANO')).toHaveLength(IMPORTABLES)
  })

  it('con `actualizar` pisa los datos descriptivos pero no el stock', () => {
    aplicarImportacion(args())
    const id = filasProductos()[0]?.id as number
    mockBase.db.update(producto).set({ nombre: 'EDITADO A MANO' }).run()
    ponerStock(id, 33)

    const resultado = aplicarImportacion(args({ modo: 'actualizar' }))

    expect(resultado.actualizados).toBe(IMPORTABLES)
    expect(filasProductos().filter(p => p.nombre === 'EDITADO A MANO')).toHaveLength(0)

    // El stock es de esta farmacia, no del archivo de origen: la importación
    // no lo toca nunca, en ningún modo.
    expect(
      mockBase.db
        .select()
        .from(stock)
        .all()
        .find(s => s.productoId === id)?.cantidad
    ).toBe(33)
  })

  it('no rompe la fila de stock de un producto actualizado', () => {
    aplicarImportacion(args())
    aplicarImportacion(args({ modo: 'actualizar' }))

    const ids = new Set(filasProductos().map(p => p.id))
    const stocks = mockBase.db.select().from(stock).all()

    expect(stocks).toHaveLength(IMPORTABLES)
    expect(stocks.every(s => ids.has(s.productoId))).toBe(true)
  })

  it('rechaza un archivo inválido sin tocar la base', () => {
    aplicarImportacion(args())

    expect(() => aplicarImportacion(args({ contenido: '{ roto' }))).toThrow(/no es un JSON válido/)
    expect(filasProductos()).toHaveLength(IMPORTABLES)
  })

  it('no deja el catálogo a medias si algo falla a mitad de camino', () => {
    // Un trigger que aborta en un producto concreto simula el fallo más
    // difícil de ver: uno que aparece cuando ya se escribió media importación.
    // La garantía es la transacción: entra todo o no entra nada.
    mockBase.sqlite.exec(`
      CREATE TRIGGER prueba_aborta BEFORE INSERT ON producto
      WHEN NEW.nombre = 'DISPARA FALLO'
      BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END;
    `)

    const conFallo = JSON.stringify([
      { nombre: 'PRIMERO', barcode: '7791234567898' },
      { nombre: 'DISPARA FALLO', barcode: '7791234567904' },
      { nombre: 'TERCERO', barcode: '7791234567911' }
    ])

    expect(() => aplicarImportacion(args({ contenido: conFallo }))).toThrow(/fallo de prueba/)

    // Ni el producto anterior al que falló, ni el posterior.
    expect(filasProductos()).toHaveLength(0)
    expect(mockBase.db.select().from(stock).all()).toHaveLength(0)
  })

  it('agrega solo los productos nuevos si el archivo crece', () => {
    aplicarImportacion(args())

    const ampliado = JSON.stringify([
      { nombre: 'IBUPROFENO 400 mg comp.x 20', barcode: '7791234567898', toquel: '9950001' },
      { nombre: 'PRODUCTO NUEVO', barcode: '7795555555555', toquel: '9999999' }
    ])

    const resultado = aplicarImportacion(args({ contenido: ampliado }))

    expect(resultado).toEqual({
      insertados: 1,
      actualizados: 0,
      conservados: 1,
      rechazados: 0
    })
    expect(filasProductos()).toHaveLength(IMPORTABLES + 1)
  })

  it('repone un producto dado de baja si se reimporta', () => {
    // Caso real: el usuario da de baja algo, reexporta el catálogo y lo vuelve
    // a importar. Con `solo-nuevos` el código ya existe, así que se conserva
    // tal cual, dado de baja. Reactivar automáticamente sería peor: dar de
    // baja es una decisión, no un efecto secundario de importar.
    aplicarImportacion(args())
    const id = filasProductos()[0]?.id as number
    mockBase.db.update(producto).set({ activo: false }).where(eq(producto.id, id)).run()

    aplicarImportacion(args())

    expect(
      mockBase.db
        .select()
        .from(producto)
        .all()
        .find(p => p.id === id)?.activo
    ).toBe(false)
  })
})
