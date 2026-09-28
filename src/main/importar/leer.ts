import type {
  AdvertenciaImportacion,
  InformeImportacion,
  ModoImportacion,
  RechazoImportacion
} from '@shared/ipc'

/**
 * Lectura y análisis del archivo de catálogo heredado.
 *
 * NO escribe nada en la base: `analizarContenido` es puro. La idea es que el
 * usuario vea el informe antes de tocar 681 registros, y que el mismo
 * análisis sea el que se usa después de aplicar, para que el informe y el
 * resultado no puedan contradecirse.
 */

/** Cómo se llama el campo del troquel en el archivo de origen: mal escrito. */
const CLAVE_TROQUEL = 'toquel'
/** La grafía correcta, por si el sistema de origen algún día se corrige. */
const CLAVE_TROQUEL_BIEN = 'troquel'

/** Longitudes que corresponden a un formato de código real. */
const FORMATOS_REALES = new Set([8, 12, 13, 14])
/** Longitudes que además llevan dígito verificador. */
const CON_DIGITO_VERIFICADOR = new Set([8, 12, 13])

export interface RegistroImportable {
  nombre: string
  principioActivo: string | null
  numeroTroquel: string | null
  codigoBarras: string
}

export interface AnalisisArchivo {
  /** Únicos por código de barras, en el orden en que aparecen. */
  validos: RegistroImportable[]
  /** Registros descartados, con el motivo y su posición. */
  rechazados: RechazoImportacion[]
  /** Registros que se descartaron por repetir un código ya presente. */
  duplicadosEnArchivo: number
  advertencias: AdvertenciaImportacion[]
  /** Registros leídos del archivo, válidos o no. */
  leidos: number
}

/**
 * Dígito verificador de EAN-8, UPC-A y EAN-13.
 *
 * De derecha a izquierda se suman los dígitos alternando peso 3 y 1, empezando
 * en 3; el verificador es lo que falta para llegar al múltiplo de 10 más
 * cercano. En los 681 registros del archivo original los cuatro códigos que no
 * son EAN-13 dan válidos, así que hoy esta función no descarta nada: queda por
 * si un archivo futuro trae uno mal tipeado.
 */
export function checksumValido(codigo: string): boolean {
  if (!/^\d{8,13}$/.test(codigo)) return false

  const cuerpo = codigo.slice(0, -1)
  let suma = 0

  for (let i = 0; i < cuerpo.length; i++) {
    // El último peso del cuerpo va al revés, que es lo que distingue el
    // algoritmo EAN del UPC.
    suma += Number(cuerpo[i]) * ((cuerpo.length - i) % 2 === 1 ? 3 : 1)
  }

  return (10 - (suma % 10)) % 10 === Number(codigo.slice(-1))
}

function textoOpcional(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}

/**
 * Valida un registro crudo. Devuelve el motivo si no se puede usar.
 *
 * Lo que no se puede arreglar solo (nombre vacío, código con letras) se
 * rechaza; lo que se puede diagnosticar pero no impedir (checksum, formato
 * raro, sin troquel) es advertencia.
 */
function leerRegistro(crudo: unknown): { registro: RegistroImportable } | { error: string } {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    return { error: 'El registro no es un objeto' }
  }

  const fila = crudo as Record<string, unknown>
  const nombre = textoOpcional(fila.nombre)
  const codigoBarras = textoOpcional(fila.barcode ?? fila.codigoBarras)

  if (!nombre) return { error: 'Falta el nombre comercial' }
  if (!codigoBarras) return { error: 'Falta el código de barras' }
  if (!/^\d{8,14}$/.test(codigoBarras)) {
    return { error: `El código de barras "${codigoBarras}" no es un número de 8 a 14 dígitos` }
  }

  return {
    registro: {
      nombre,
      principioActivo: textoOpcional(fila.droga ?? fila.principioActivo),
      // Se aceptan las dos grafías porque la del archivo de origen está mal
      // escrita ("toquel") y eso no lo va a cambiar esta app.
      numeroTroquel: textoOpcional(fila[CLAVE_TROQUEL] ?? fila[CLAVE_TROQUEL_BIEN]),
      codigoBarras
    }
  }
}

/** Advertencia agrupada: una por tipo, no una por registro. */
function agrupar(
  tipo: AdvertenciaImportacion['tipo'],
  registros: RegistroImportable[],
  descripcion: (registro: RegistroImportable) => string
): AdvertenciaImportacion {
  return {
    tipo,
    codigoBarras: null,
    veces: registros.length,
    ejemplos: registros.slice(0, 3).map(descripcion)
  }
}

/**
 * Analiza el contenido del archivo y devuelve qué se puede importar y qué no.
 *
 * Los duplicados dentro del mismo archivo se resuelven acá: gana el primero y
 * el resto se descarta, dejando aviso. Insertar dos productos con el mismo
 * código rompe la búsqueda por escáner sin avisar, y el aviso tiene que salir
 * de acá y no de una restricción de la base (que no la hay, a propósito).
 */
export function analizarContenido(contenido: string): AnalisisArchivo {
  let datos: unknown

  try {
    datos = JSON.parse(contenido)
  } catch (e) {
    throw new Error(
      `El archivo no es un JSON válido: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  if (!Array.isArray(datos)) {
    throw new Error(
      'El archivo tiene que ser una lista de productos: un arreglo JSON con un objeto por producto'
    )
  }

  const validos: RegistroImportable[] = []
  const rechazados: RechazoImportacion[] = []
  const vistos = new Set<string>()
  let duplicados = 0

  for (const [indice, crudo] of datos.entries()) {
    const leido = leerRegistro(crudo)

    if ('error' in leido) {
      const fila = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<
        string,
        unknown
      >
      rechazados.push({
        registro: indice + 1,
        nombre: textoOpcional(fila.nombre),
        codigoBarras: textoOpcional(fila.barcode ?? fila.codigoBarras),
        motivo: leido.error
      })
      continue
    }

    if (vistos.has(leido.registro.codigoBarras)) {
      duplicados++
      continue
    }

    vistos.add(leido.registro.codigoBarras)
    validos.push(leido.registro)
  }

  return {
    validos,
    rechazados,
    duplicadosEnArchivo: duplicados,
    advertencias: revisarAdvertencias(validos, duplicados),
    leidos: datos.length
  }
}

function revisarAdvertencias(
  validos: RegistroImportable[],
  duplicados: number
): AdvertenciaImportacion[] {
  const advertencias: AdvertenciaImportacion[] = []

  if (duplicados > 0) {
    advertencias.push({
      tipo: 'codigo-duplicado-en-archivo',
      codigoBarras: null,
      veces: duplicados,
      ejemplos: ['Se conserva la primera aparición de cada código']
    })
  }

  const ilegibles = validos.filter(r => !FORMATOS_REALES.has(r.codigoBarras.length))
  if (ilegibles.length > 0) {
    advertencias.push(
      agrupar(
        'codigo-ilegible',
        ilegibles,
        r => `${r.codigoBarras} (${r.codigoBarras.length} dígitos)`
      )
    )
  }

  const checksumMalo = validos.filter(
    r => CON_DIGITO_VERIFICADOR.has(r.codigoBarras.length) && !checksumValido(r.codigoBarras)
  )
  if (checksumMalo.length > 0) {
    advertencias.push(
      agrupar('checksum-invalido', checksumMalo, r => `${r.codigoBarras} · ${r.nombre}`)
    )
  }

  const sinTroquel = validos.filter(r => r.numeroTroquel === null)
  if (sinTroquel.length > 0) {
    advertencias.push(agrupar('sin-numero-de-troquel', sinTroquel, r => r.nombre))
  }

  return advertencias
}

/** Completa el informe con lo que ya está en la base, según el modo. */
export function armarInforme(
  archivo: { nombre: string; ruta: string; bytes: number },
  analisis: AnalisisArchivo,
  existentes: ReadonlySet<string>,
  modo: ModoImportacion
): InformeImportacion {
  let nuevos = 0
  let aActualizar = 0
  let aConservar = 0

  for (const registro of analisis.validos) {
    if (!existentes.has(registro.codigoBarras)) {
      nuevos++
    } else if (modo === 'actualizar') {
      aActualizar++
    } else {
      aConservar++
    }
  }

  return {
    archivo,
    leidos: analisis.leidos,
    nuevos,
    aActualizar,
    aConservar,
    rechazados: analisis.rechazados,
    advertencias: analisis.advertencias,
    todosEntranEnCero: true
  }
}
