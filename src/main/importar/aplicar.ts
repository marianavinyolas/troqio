import type { ArgsImportacion, InformeImportacion, ResultadoImportacion } from '@shared/ipc'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { producto, stock } from '../db/schema'
import { analizarContenido, armarInforme } from './leer'

/**
 * Importación del catálogo heredado.
 *
 * Idempotente por código de barras: volver a importar el mismo archivo no
 * duplica nada, y con el modo por defecto tampoco pisa lo que ya está. Es la
 * diferencia entre poder probar la importación tres veces y tener que
 * deshacer a mano los 681 registros a la tercera.
 *
 * Ningún producto entra con movimientos de ingreso: todos arrancan en 0. El
 * archivo de origen trae `units: 0` en los 681 registros, que es un artefacto
 * de la exportación y no un conteo. El stock real se carga en el conteo (M4),
 * y es el que va a dejar el primer ingreso en el libro.
 */

/** Códigos de barras que ya están en la base, para decidir nuevo o no. */
function codigosExistentes(codigos: string[]): Set<string> {
  if (codigos.length === 0) return new Set()

  // `inArray` genera un `IN (?, ?, ...)` con 681 parámetros. SQLite tiene el
  // límite por defecto en 999, así que hoy entra; con un catálogo más grande
  // hay que trocear la consulta.
  const filas = getDb()
    .select({ codigoBarras: producto.codigoBarras })
    .from(producto)
    .where(inArray(producto.codigoBarras, codigos))
    .all()

  return new Set(filas.map(fila => fila.codigoBarras))
}

/**
 * Análisis en seco: lee el archivo y dice qué pasaría, sin escribir nada.
 */
export function analizarImportacion(args: ArgsImportacion): InformeImportacion {
  const analisis = analizarContenido(args.contenido)
  const existentes = codigosExistentes(analisis.validos.map(r => r.codigoBarras))

  return armarInforme(
    { nombre: args.nombreArchivo, ruta: args.rutaArchivo, bytes: args.contenido.length },
    analisis,
    existentes,
    args.modo
  )
}

/**
 * Aplica la importación.
 *
 * Va en una sola transacción: o entran los 681 registros, o no entra ninguno.
 * A mitad de camino no puede quedar el catálogo a medias, que es el peor
 * estado posible para una app de inventario.
 *
 * El análisis se corre otra vez acá, y no se confía en el informe que llegó
 * del renderer. Es el mismo archivo, pero es la base la que decide qué existe
 * y qué no, en el momento de escribir.
 */
export function aplicarImportacion(args: ArgsImportacion): ResultadoImportacion {
  const analisis = analizarContenido(args.contenido)
  const existentes = codigosExistentes(analisis.validos.map(r => r.codigoBarras))
  const ahora = new Date()

  return getDb().transaction(tx => {
    let insertados = 0
    let actualizados = 0
    let conservados = 0

    const nuevos = analisis.validos.filter(r => !existentes.has(r.codigoBarras))
    const aPisar =
      args.modo === 'actualizar' ? analisis.validos.filter(r => existentes.has(r.codigoBarras)) : []
    conservados = analisis.validos.length - nuevos.length - aPisar.length

    if (nuevos.length > 0) {
      // Un solo INSERT con muchos VALUES: 681 filas en un statement, en vez de
      // 681 viajes de ida y vuelta.
      tx.insert(producto)
        .values(
          nuevos.map(registro => ({
            ...registro,
            activo: true,
            creadoEn: ahora,
            actualizadoEn: ahora
          }))
        )
        .run()

      // El saldo se crea junto, o el producto quedaría sin fila de stock.
      const ids = tx
        .select({ id: producto.id })
        .from(producto)
        .where(
          inArray(
            producto.codigoBarras,
            nuevos.map(r => r.codigoBarras)
          )
        )
        .all()

      if (ids.length > 0) {
        tx.insert(stock)
          .values(ids.map(({ id }) => ({ productoId: id, cantidad: 0 })))
          .run()
      }

      insertados = ids.length
    }

    for (const registro of aPisar) {
      // Se actualiza uno por uno porque el where es por código de barras y no
      // hay forma de agruparlos en un solo statement. Con 681 es instantáneo;
      // si algún día el catálogo crece mucho, el bucle es el primer lugar a
      // mirar.
      tx.update(producto)
        .set({ ...registro, actualizadoEn: ahora })
        .where(eq(producto.codigoBarras, registro.codigoBarras))
        .run()
      actualizados++
    }

    return {
      insertados,
      actualizados,
      conservados,
      rechazados: analisis.rechazados.length + analisis.duplicadosEnArchivo
    }
  })
}
