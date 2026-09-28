import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Esquema de la base. Tres tablas y nada mas.
 *
 * Decisiones que no son obvias y conviene no volver a discutir:
 *
 * - `codigo_barras` es TEXT, nunca INTEGER. Hay codigos con ceros iniciales
 *   (ej. `0070942507240`) que como numero pierden el 0 y dejan de existir.
 * - `numero_troquel` es nullable. Los 681 del catalogo inicial lo tienen, pero
 *   no hay que obligar a inventar uno si aparece algo sin troquel.
 * - Ninguna de las dos es UNIQUE. Un typo al cargar datos no debe bloquear el
 *   alta: el conflicto se reporta como advertencia, no como error.
 * - `stock` guarda la cantidad de cajas. No hay contador de "troqueles sueltos":
 *   el troquel es el recorte de la caja que se pega en la receta, no una unidad
 *   de stock.
 */

/** Tipo de movimiento del libro. El nombre va a la base, no solo al type. */
export const TIPOS_MOVIMIENTO = ['ingreso', 'egreso', 'ajuste'] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const producto = sqliteTable(
  'producto',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Nombre comercial, tal como viene del catalogo. */
    nombre: text('nombre').notNull(),
    /** Principio activo crudo. Se busca con LIKE, sin columna derivada. */
    principioActivo: text('principio_activo'),
    /** Numero de troquel oficial (Ministerio de Salud). Identifica la presentacion. */
    numeroTroquel: text('numero_troquel'),
    /** EAN-8, EAN-13 o UPC-A. Texto para preservar ceros iniciales. */
    codigoBarras: text('codigo_barras').notNull(),
    /** Baja logica: el producto se desactiva, no se borra (el historico lo referencia). */
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  t => [
    // Exactos: los usa el escaner (codigo) y la busqueda directa (troquel).
    // El indice no sirve para el LIKE '%texto%' de la busqueda por nombre; con
    // 681 filas da igual, y ya esta anotado revisar el tema sobre ~10.000.
    index('ix_producto_codigo_barras').on(t.codigoBarras),
    index('ix_producto_numero_troquel').on(t.numeroTroquel),
    index('ix_producto_nombre').on(t.nombre),
    index('ix_producto_principio_activo').on(t.principioActivo)
  ]
)

/**
 * Cantidad actual, una fila por producto.
 *
 * Invariante: todo producto tiene exactamente una fila acá. No lo garantiza
 * un trigger sino el alta, que inserta producto y stock en la misma
 * transaccion. Si alguna vez se rompe, se agrega un trigger.
 */
export const stock = sqliteTable(
  'stock',
  {
    productoId: integer('producto_id')
      .primaryKey()
      .references(() => producto.id, { onDelete: 'restrict' }),
    cantidad: integer('cantidad').notNull().default(0)
  },
  t => [
    // Ultima linea de defensa del requisito "nunca stock negativo". Aunque la
    // UI tenga un error, la base no puede quedar con -3.
    //
    // El typeof NO sobra: SQLite guarda afinidades, no tipos. El texto 'muchos'
    // entra en una columna INTEGER sin convertirse, y como en SQLite el orden
    // de tipos es NULL < INTEGER/REAL < TEXT < BLOB, la comparacion
    // 'muchos' > 0 da VERDADERA y el CHECK solo no lo frena. Sin el typeof, un
    // texto colado pasa el filtro de stock y el saldo queda escrito como texto.
    check('stock_cantidad_entera', sql`typeof(${t.cantidad}) = 'integer'`),
    check('stock_cantidad_no_negativa', sql`${t.cantidad} >= 0`)
  ]
)

/**
 * Libro de movimientos. Append-only: las filas no se actualizan ni se borran.
 *
 * Es la trazabilidad del inventario. El conteo inicial genera 681 ingresos, y
 * eso es justamente lo que despues permite revisar o revertir una carga.
 */
export const movimientoStock = sqliteTable(
  'movimiento_stock',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productoId: integer('producto_id')
      .notNull()
      .references(() => producto.id, { onDelete: 'restrict' }),
    tipo: text('tipo').$type<TipoMovimiento>().notNull(),
    /**
     * Signo segun el tipo: `ingreso` y `egreso` son siempre positivos, y el
     * `ajuste` es la diferencia con signo (contar 3 donde habia 8 es un -5).
     */
    cantidad: integer('cantidad').notNull(),
    /** Texto libre: "conteo inicial", "receta", "correccion de conteo". */
    motivo: text('motivo'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  t => [
    check('movimiento_tipo_valido', sql`${t.tipo} in ('ingreso', 'egreso', 'ajuste')`),
    // Reúne en una sola regla lo que exige cada tipo, para que se lea de una.
    // El typeof va primero por lo mismo que en `stock`: en SQLite el texto
    // ordena despues que el numero, asi que 'muchos' > 0 seria verdadero.
    check(
      'movimiento_cantidad_coherente',
      sql`typeof(${t.cantidad}) = 'integer' and ((${t.tipo} in ('ingreso', 'egreso') and ${t.cantidad} > 0) or (${t.tipo} = 'ajuste' and ${t.cantidad} <> 0))`
    ),
    // El historial de un producto se lee siempre ordenandolo por id.
    index('ix_movimiento_stock_producto').on(t.productoId, t.id)
  ]
)

export type Producto = typeof producto.$inferSelect
export type ProductoNuevo = typeof producto.$inferInsert
export type Stock = typeof stock.$inferSelect
export type MovimientoStock = typeof movimientoStock.$inferSelect
export type MovimientoStockNuevo = typeof movimientoStock.$inferInsert
