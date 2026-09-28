import type {
  DatosProducto,
  FiltroCatalogo,
  ListaProductos,
  ProductoConStock,
  ResumenCatalogo
} from '@shared/ipc'
import { and, asc, count, eq, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { escaparLike, fold } from './buscar'
import { getDb } from './index'
import { producto, stock } from './schema'

/**
 * Acceso a datos de productos.
 *
 * Todas las funciones devuelven la forma del contrato IPC (fechas ISO en
 * texto), no la fila de Drizzle. Es la única frontera donde se traduce, y así
 * el renderer nunca ve un `Date` ni un nombre de columna de SQLite.
 */

/** Producto + saldo: la forma en la que se lee un producto. */
const conStock = {
  id: producto.id,
  nombre: producto.nombre,
  principioActivo: producto.principioActivo,
  numeroTroquel: producto.numeroTroquel,
  codigoBarras: producto.codigoBarras,
  activo: producto.activo,
  creadoEn: producto.creadoEn,
  actualizadoEn: producto.actualizadoEn,
  cantidad: stock.cantidad
}

/**
 * Se deriva del esquema en vez de escribirse a mano.
 *
 * Escribirla fue el error anterior: `activo` con `mode: 'boolean'` devuelve un
 * booleano y no un 0/1, y el `leftJoin` vuelve `cantidad` nullable porque
 * SQLite no sabe que la fila existe. Inferirlo evita las dos trampas y no se
 * desactualiza si mañana se agrega una columna.
 */
type FilaProducto = typeof producto.$inferSelect & { cantidad: number | null }

function aProducto(fila: FilaProducto): ProductoConStock {
  return {
    id: fila.id,
    nombre: fila.nombre,
    principioActivo: fila.principioActivo,
    numeroTroquel: fila.numeroTroquel,
    codigoBarras: fila.codigoBarras,
    activo: fila.activo,
    creadoEn: fila.creadoEn.toISOString(),
    actualizadoEn: fila.actualizadoEn.toISOString(),
    // El invariante dice que todo producto tiene fila de stock, pero el
    // LEFT JOIN no puede saberlo. Ante un dato roto se muestra 0, que es lo
    // menos confuso para quien está mirando la pantalla.
    cantidad: fila.cantidad ?? 0
  }
}

/**
 * Condición de búsqueda sobre los tres campos por los que se busca.
 *
 * `fold()` es la función registrada en buscar.ts. Compara el texto plegado
 * de la columna contra el texto plegado del filtro, así que "atorvastatina"
 * encuentra "ATORVASTATÍN". La puntuación no se toca: si el dato dice
 * `SODIO,CLORURO`, hay que buscarlo con la coma.
 *
 * El comodín se arma a mano y NO con `sql` interpolado: va como parámetro
 * ligado, con los `%` del usuario escapados. Un filtro de `%` trae 20
 * resultados, no los 681.
 */
function coincide(filtro: string, ...columnas: AnySQLiteColumn[]): SQL | undefined {
  if (filtro === '') return undefined

  const patron = `%${escaparLike(fold(filtro))}%`
  return or(...columnas.map(columna => sql`fold(${columna}) LIKE ${patron} ESCAPE '\\'`)) as SQL
}

/**
 * Lista productos con filtro y paginación.
 *
 * El filtro es una sola caja de texto sobre nombre, principio activo y código
 * de barras. La búsqueda como experiencia (M5) viene después; esto es lo
 * mínimo para poder revisar 681 registros sin paginar a mano.
 */
export function listarProductos(filtro: FiltroCatalogo): ListaProductos {
  const db = getDb()

  const condiciones = [
    filtro.incluirInactivos ? undefined : eq(producto.activo, true),
    coincide(filtro.filtro, producto.nombre, producto.principioActivo, producto.codigoBarras)
  ].filter((c): c is SQL => c !== undefined)

  const where = condiciones.length > 0 ? and(...condiciones) : undefined

  const filas = db
    .select(conStock)
    .from(producto)
    .leftJoin(stock, eq(stock.productoId, producto.id))
    .where(where)
    // Nombre y luego id, para que dos productos con el mismo nombre queden
    // siempre en el mismo orden y la paginación no baile entre páginas.
    .orderBy(asc(producto.nombre), asc(producto.id))
    .limit(filtro.limite)
    .offset(filtro.desplazamiento)
    .all()

  const conteo = db.select({ n: count() }).from(producto).where(where).get() as
    | { n: number }
    | undefined

  return { filas: filas.map(aProducto), total: conteo?.n ?? 0 }
}

export function obtenerProducto(id: number): ProductoConStock | null {
  const fila = getDb()
    .select(conStock)
    .from(producto)
    .leftJoin(stock, eq(stock.productoId, producto.id))
    .where(eq(producto.id, id))
    .get()

  return fila ? aProducto(fila) : null
}

/**
 * Alta de producto: inserta el producto y su fila de stock en la misma
 * transacción.
 *
 * Es el invariante de que todo producto tenga saldo, y por eso va junto. Si
 * fueran dos operaciones, un corte de luz entre ambas dejaría un producto sin
 * fila de stock, que la UI no sabría cómo mostrar.
 */
export function crearProducto(datos: DatosProducto): ProductoConStock {
  const db = getDb()
  const ahora = new Date()

  const creado = db.transaction(tx => {
    const fila = tx
      .insert(producto)
      .values({ ...datos, activo: true, creadoEn: ahora, actualizadoEn: ahora })
      .returning()
      .get()

    tx.insert(stock).values({ productoId: fila.id, cantidad: 0 }).run()

    return fila
  })

  // Se relee con la consulta completa en lugar de armar el objeto a mano: el
  // stock recién insertado viene del mismo lugar que en el resto de las
  // funciones, y así no hay dos formas de armar lo mismo.
  return obtenerProducto(creado.id) as ProductoConStock
}

/**
 * Edición de un producto. NO toca el stock.
 *
 * El saldo se cambia con movimientos, no editando un campo: si se pudiera
 * editar, el libro de movimientos dejaría de explicar el saldo.
 */
export function actualizarProducto(id: number, datos: DatosProducto): ProductoConStock | null {
  getDb()
    .update(producto)
    .set({ ...datos, actualizadoEn: new Date() })
    .where(eq(producto.id, id))
    .run()

  return obtenerProducto(id)
}

/**
 * Baja lógica: el producto queda marcado y sus movimientos siguen apuntando
 * a él. Es lo que hace que dar de baja un producto no borre la historia de lo
 * que se descontó de él (las claves foráneas son ON DELETE RESTRICT).
 */
export function desactivarProducto(id: number): void {
  getDb()
    .update(producto)
    .set({ activo: false, actualizadoEn: new Date() })
    .where(and(eq(producto.id, id), eq(producto.activo, true)))
    .run()
}

/** Búsqueda exacta por código de barras. Es lo que usa el escáner. */
export function buscarPorCodigoBarras(codigo: string): ProductoConStock | null {
  const fila = getDb()
    .select(conStock)
    .from(producto)
    .leftJoin(stock, eq(stock.productoId, producto.id))
    .where(and(eq(producto.codigoBarras, codigo), eq(producto.activo, true)))
    .get()

  return fila ? aProducto(fila) : null
}

/** Conteos para el encabezado del catálogo. */
export function resumenCatalogo(): ResumenCatalogo {
  const db = getDb()

  const base = db
    .select({
      total: count(),
      activos: sql<number>`coalesce(sum(case when ${producto.activo} = 1 then 1 else 0 end), 0)`,
      conStock: sql<number>`coalesce(sum(case when ${stock.cantidad} > 0 then 1 else 0 end), 0)`
    })
    .from(producto)
    .leftJoin(stock, eq(stock.productoId, producto.id))
    .get() as { total: number; activos: number; conStock: number }

  const sinStock = db
    .select({ n: count() })
    .from(producto)
    .leftJoin(stock, eq(stock.productoId, producto.id))
    .where(and(eq(producto.activo, true), or(isNull(stock.cantidad), eq(stock.cantidad, 0))))
    .get()

  return {
    total: base.total,
    activos: base.activos,
    inactivos: base.total - base.activos,
    conStock: base.conStock,
    sinStock: sinStock?.n ?? 0
  }
}
