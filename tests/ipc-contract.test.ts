import { describe, expect, it } from 'vitest'
import {
  ActualizarProductoSchema,
  ArgsImportacionSchema,
  CodigoBarrasSchema,
  DatosProductoSchema,
  DiagnosticoResultSchema,
  FiltroCatalogoSchema,
  IdProductoSchema,
  InformeImportacionSchema,
  ProductoConStockSchema,
  ResumenCatalogoSchema,
  vacioANulo
} from '../src/shared/ipc'

describe('DiagnosticoResultSchema', () => {
  const valido = {
    appVersion: '0.1.0',
    electronVersion: '44.4.5',
    chromeVersion: '140.0.0.0',
    nodeVersion: '24.21.0',
    sqliteVersion: '3.53.4',
    journalMode: 'wal',
    foreignKeys: true,
    dbPath: 'C:\\Users\\farmacia\\AppData\\Roaming\\troqio\\troqio.db',
    dbExists: true,
    dbSizeBytes: 4096
  }

  it('acepta una respuesta completa', () => {
    expect(DiagnosticoResultSchema.safeParse(valido).success).toBe(true)
  })

  it('rechaza una respuesta incompleta', () => {
    const { sqliteVersion: _omitido, ...incompleto } = valido
    expect(DiagnosticoResultSchema.safeParse(incompleto).success).toBe(false)
  })

  it('rechaza tipos incorrectos', () => {
    expect(DiagnosticoResultSchema.safeParse({ ...valido, dbSizeBytes: 'muchos' }).success).toBe(
      false
    )
    expect(DiagnosticoResultSchema.safeParse({ ...valido, foreignKeys: 'sí' }).success).toBe(false)
  })
})

describe('DatosProductoSchema', () => {
  const valido = {
    nombre: 'IBUPROFENO 400 mg comp.x 20',
    principioActivo: 'IBUPROFENO',
    numeroTroquel: '9950001',
    codigoBarras: '7791234567898'
  }

  it('acepta un producto completo', () => {
    expect(DatosProductoSchema.safeParse(valido).success).toBe(true)
  })

  it('recorta los espacios antes de validar', () => {
    // Los espacios sueltos los mete el escáner. Sin recorte, un nombre con un
    // espacio al final no se encuentra nunca en la búsqueda.
    const r = DatosProductoSchema.parse({ ...valido, nombre: '  IBUPROFENO  ' })
    expect(r.nombre).toBe('IBUPROFENO')
  })

  it('exige un nombre con algo dentro', () => {
    expect(DatosProductoSchema.safeParse({ ...valido, nombre: '' }).success).toBe(false)
    expect(DatosProductoSchema.safeParse({ ...valido, nombre: '   ' }).success).toBe(false)
  })

  it('acepta el principio activo y el troquel en null', () => {
    expect(
      DatosProductoSchema.safeParse({ ...valido, principioActivo: null, numeroTroquel: null })
        .success
    ).toBe(true)
  })

  it('acepta un número de troquel con cualquier contenido', () => {
    // Es un dato informativo. Bloquear el alta por un carácter raro sería peor
    // que guardarlo tal cual, y el troquel no se busca por escáner.
    expect(DatosProductoSchema.safeParse({ ...valido, numeroTroquel: 'N/D' }).success).toBe(true)
    expect(DatosProductoSchema.safeParse({ ...valido, numeroTroquel: 'a1' }).success).toBe(true)
  })

  it('exige un código de barras de 8 a 14 dígitos', () => {
    for (const codigoBarras of ['77908384', '650240011351', '7791234567898', '0070942507240']) {
      expect(DatosProductoSchema.safeParse({ ...valido, codigoBarras }).success).toBe(true)
    }

    for (const codigoBarras of ['', '123', '779ABC', '77912345678901234', 7791234567898]) {
      expect(DatosProductoSchema.safeParse({ ...valido, codigoBarras }).success).toBe(false)
    }
  })

  it('conserva los ceros iniciales del código de barras', () => {
    // El código es TEXT por esto: como número, 0070942507240 perdía los ceros
    // de la izquierda y el escáner no lo encontraba nunca.
    expect(
      DatosProductoSchema.parse({ ...valido, codigoBarras: '0070942507240' }).codigoBarras
    ).toBe('0070942507240')
  })

  it('descarta campos que el renderer no debería mandar', () => {
    // `activo` y `cantidad` no se mandan desde el formulario: los pone la app.
    // Aceptarlos sería abrir la puerta a dar de alta un producto ya dado de
    // baja, o con un saldo inventado.
    const r = DatosProductoSchema.safeParse({ ...valido, activo: false, cantidad: 99 })
    expect(r.success).toBe(true)
    expect(r.success && 'cantidad' in r.data).toBe(false)
  })
})

describe('IdProductoSchema', () => {
  it('acepta un id positivo', () => {
    expect(IdProductoSchema.safeParse({ id: 1 }).success).toBe(true)
  })

  it('rechaza lo que no puede ser un id', () => {
    for (const id of [0, -1, 1.5, '1', null, undefined, Number.NaN]) {
      expect(IdProductoSchema.safeParse({ id }).success).toBe(false)
    }
  })
})

describe('ActualizarProductoSchema', () => {
  it('es el id más los mismos datos del alta', () => {
    const r = ActualizarProductoSchema.safeParse({
      id: 7,
      nombre: 'X',
      principioActivo: null,
      numeroTroquel: null,
      codigoBarras: '7791234567898'
    })
    expect(r.success).toBe(true)
  })

  it('exige el id además de los datos', () => {
    const r = ActualizarProductoSchema.safeParse({
      nombre: 'X',
      principioActivo: null,
      numeroTroquel: null,
      codigoBarras: '7791234567898'
    })
    expect(r.success).toBe(false)
  })
})

describe('CodigoBarrasSchema', () => {
  it('exige solo dígitos', () => {
    expect(CodigoBarrasSchema.safeParse({ codigoBarras: '7791234567898' }).success).toBe(true)
    expect(CodigoBarrasSchema.safeParse({ codigoBarras: '779abc' }).success).toBe(false)
  })
})

describe('FiltroCatalogoSchema', () => {
  it('pone valores por defecto a lo que no se manda', () => {
    expect(FiltroCatalogoSchema.parse({})).toEqual({
      filtro: '',
      limite: 50,
      desplazamiento: 0,
      incluirInactivos: false
    })
  })

  it('topa la página a un tamaño usable', () => {
    expect(FiltroCatalogoSchema.safeParse({ limite: 0 }).success).toBe(false)
    expect(FiltroCatalogoSchema.safeParse({ limite: 100_000 }).success).toBe(false)
    expect(FiltroCatalogoSchema.safeParse({ limite: 200 }).success).toBe(true)
  })

  it('no acepta un desplazamiento negativo', () => {
    expect(FiltroCatalogoSchema.safeParse({ desplazamiento: -1 }).success).toBe(false)
  })

  it('topa el largo del filtro', () => {
    expect(FiltroCatalogoSchema.safeParse({ filtro: 'a'.repeat(121) }).success).toBe(false)
  })
})

describe('ArgsImportacionSchema', () => {
  const valido = {
    contenido: '[{"nombre":"X","barcode":"7791234567898"}]',
    nombreArchivo: 'stock.json'
  }

  it('acepta un archivo y deja el modo por defecto en `solo-nuevos`', () => {
    // El modo por defecto es el que no pisa una edición manual. El otro queda
    // a un clic de distancia, no a un clic de más.
    expect(ArgsImportacionSchema.parse(valido).modo).toBe('solo-nuevos')
  })

  it('rechaza un archivo vacío', () => {
    expect(ArgsImportacionSchema.safeParse({ ...valido, contenido: '' }).success).toBe(false)
  })

  it('rechaza un archivo absurdamente grande', () => {
    expect(
      ArgsImportacionSchema.safeParse({ ...valido, contenido: 'a'.repeat(21_000_000) }).success
    ).toBe(false)
  })

  it('rechaza un modo que no existe', () => {
    expect(ArgsImportacionSchema.safeParse({ ...valido, modo: 'borrar-todo' }).success).toBe(false)
  })
})

describe('InformeImportacionSchema', () => {
  const informe = {
    archivo: { nombre: 'stock.json', ruta: 'C:/tmp/stock.json', bytes: 165077 },
    leidos: 681,
    nuevos: 681,
    aActualizar: 0,
    aConservar: 0,
    rechazados: [],
    advertencias: [],
    todosEntranEnCero: true
  }

  it('acepta el informe completo', () => {
    expect(InformeImportacionSchema.safeParse(informe).success).toBe(true)
  })

  it('exige `todosEntranEnCero` en true', () => {
    // No es un campo informativo: la pantalla dice "todos entran con stock
    // cero" y tiene que ser verdad, porque el archivo de origen no trae
    // cantidades.
    expect(
      InformeImportacionSchema.safeParse({ ...informe, todosEntranEnCero: false }).success
    ).toBe(false)
  })

  it('acepta rechazos y advertencias con la forma que usa la pantalla', () => {
    const conDatos = InformeImportacionSchema.safeParse({
      ...informe,
      rechazados: [
        { registro: 11, nombre: null, codigoBarras: '7791234567942', motivo: 'Falta el nombre' }
      ],
      advertencias: [
        { tipo: 'checksum-invalido', codigoBarras: null, veces: 1, ejemplos: ['7791234567950'] }
      ]
    })
    expect(conDatos.success).toBe(true)
  })

  it('rechaza un tipo de advertencia desconocido', () => {
    const r = InformeImportacionSchema.safeParse({
      ...informe,
      advertencias: [{ tipo: 'inventado', codigoBarras: null, veces: 1, ejemplos: [] }]
    })
    expect(r.success).toBe(false)
  })
})

describe('ProductoConStockSchema', () => {
  const base = {
    id: 1,
    nombre: 'X',
    principioActivo: null,
    numeroTroquel: null,
    codigoBarras: '7791234567898',
    activo: true,
    creadoEn: '2026-06-26T21:44:41.000Z',
    actualizadoEn: '2026-06-26T21:44:41.000Z'
  }

  it('no acepta un saldo negativo', () => {
    expect(ProductoConStockSchema.safeParse({ ...base, cantidad: 0 }).success).toBe(true)
    expect(ProductoConStockSchema.safeParse({ ...base, cantidad: -1 }).success).toBe(false)
    expect(ProductoConStockSchema.safeParse({ ...base, cantidad: 1.5 }).success).toBe(false)
    // La base lo impide con un CHECK; el contrato lo vuelve a impedir del otro
    // lado, para que un bug de la capa de datos no llegue a la pantalla.
    expect(ProductoConStockSchema.safeParse({ ...base, cantidad: 'muchos' }).success).toBe(false)
  })
})

describe('ResumenCatalogoSchema', () => {
  it('acepta los conteos del encabezado', () => {
    const r = ResumenCatalogoSchema.safeParse({
      total: 681,
      activos: 681,
      inactivos: 0,
      conStock: 0,
      sinStock: 681
    })
    expect(r.success).toBe(true)
  })
})

describe('vacioANulo', () => {
  it('convierte un campo vacío del formulario en null', () => {
    // El formulario da strings; la columna es nullable. Sin esto, un campo
    // vacío se guardaría como "" y no como "no informado".
    expect(vacioANulo('')).toBeNull()
    expect(vacioANulo('   ')).toBeNull()
    expect(vacioANulo(undefined)).toBeNull()
    expect(vacioANulo(null)).toBeNull()
    expect(vacioANulo(' 9901 ')).toBe('9901')
  })
})
