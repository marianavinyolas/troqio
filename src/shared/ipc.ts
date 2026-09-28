import { z } from 'zod'

/**
 * Contrato IPC compartido entre el proceso main y el renderer.
 *
 * IMPORTANTE: el renderer NUNCA es de confianza. Cada `ipcMain.handle`
 * revalida sus argumentos con estos schemas antes de tocar la base de datos.
 *
 * Las fechas viajan como ISO-8601 en texto, no como `Date`. El IPC de Electron
 * las clonaria sin problema, pero en la base son enteros epoch y en pantalla
 * van como dd/mm/aaaa: pasar siempre por el mismo formato hace que no haya dos
 * representaciones del mismo instante dando vueltas por el codigo.
 */

/** Diagnostico de arranque: prueba de humo de todo el stack (M0). */
export const DiagnosticoResultSchema = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  sqliteVersion: z.string(),
  journalMode: z.string(),
  foreignKeys: z.boolean(),
  dbPath: z.string(),
  dbExists: z.boolean(),
  dbSizeBytes: z.number()
})

export type DiagnosticoResult = z.infer<typeof DiagnosticoResultSchema>

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export const ProductoSchema = z.object({
  id: z.number().int(),
  nombre: z.string(),
  principioActivo: z.string().nullable(),
  numeroTroquel: z.string().nullable(),
  codigoBarras: z.string(),
  activo: z.boolean(),
  creadoEn: z.string(),
  actualizadoEn: z.string()
})

export type Producto = z.infer<typeof ProductoSchema>

/** Producto con su saldo. Es la forma que se muestra en el catalogo. */
export const ProductoConStockSchema = ProductoSchema.extend({
  cantidad: z.number().int().nonnegative()
})

export type ProductoConStock = z.infer<typeof ProductoConStockSchema>

/**
 * Datos que se pueden escribir de un producto.
 *
 * El `codigoBarras` se valida con 8 a 14 digitos: EAN-8, UPC-A, EAN-13 y
 * GTIN-14, que es lo que puede devolver un lector. No se acepta 6 ni 15.
 *
 * El `numeroTroquel` NO se fuerza a ser numerico. Es un dato informativo y
 * bloquear el alta por un caracter raro seria peor que guardarlo tal cual.
 */
export const DatosProductoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'Máximo 200 caracteres'),
  principioActivo: z.string().trim().max(200, 'Máximo 200 caracteres').nullable().default(null),
  numeroTroquel: z.string().trim().max(20, 'Máximo 20 caracteres').nullable().default(null),
  codigoBarras: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'El código de barras debe tener entre 8 y 14 dígitos')
})

export type DatosProducto = z.infer<typeof DatosProductoSchema>

export const IdProductoSchema = z.object({
  id: z.number().int().positive('El id tiene que ser un número entero positivo')
})

export type IdProducto = z.infer<typeof IdProductoSchema>

/** Edición: el id del producto más los mismos datos que el alta. */
export const ActualizarProductoSchema = IdProductoSchema.extend(DatosProductoSchema.shape)
export type ActualizarProducto = z.infer<typeof ActualizarProductoSchema>

/** Lectura por código de barras exacto. Es la que usa el escáner. */
export const CodigoBarrasSchema = z.object({
  codigoBarras: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'El código de barras debe tener entre 8 y 14 dígitos')
})

export type CodigoBarras = z.infer<typeof CodigoBarrasSchema>

/** Un campo vacío en el formulario es `null`, no `""`. */
export function vacioANulo(valor: string | undefined | null): string | null {
  const limpio = valor?.trim() ?? ''
  return limpio === '' ? null : limpio
}

/** Argumentos de `productos:listar`. */
export const FiltroCatalogoSchema = z.object({
  filtro: z.string().trim().max(120, 'Máximo 120 caracteres').default(''),
  limite: z.number().int().min(1).max(200).default(50),
  desplazamiento: z.number().int().min(0).default(0),
  incluirInactivos: z.boolean().default(false)
})

export type FiltroCatalogo = z.infer<typeof FiltroCatalogoSchema>

export const ListaProductosSchema = z.object({
  filas: z.array(ProductoConStockSchema),
  /** Total de productos que pasan el filtro, no los de esta pagina. */
  total: z.number().int().nonnegative()
})

export type ListaProductos = z.infer<typeof ListaProductosSchema>

export const ResumenCatalogoSchema = z.object({
  total: z.number().int().nonnegative(),
  activos: z.number().int().nonnegative(),
  inactivos: z.number().int().nonnegative(),
  conStock: z.number().int().nonnegative(),
  sinStock: z.number().int().nonnegative()
})

export type ResumenCatalogo = z.infer<typeof ResumenCatalogoSchema>

// ---------------------------------------------------------------------------
// Importacion
// ---------------------------------------------------------------------------

/**
 * Que hacer con un producto que ya existe en la base.
 *
 * - `solo-nuevos`: conserva lo que ya esta (no pisa). Es el que conviene por
 *   defecto: una edicion hecha a mano en Troqio no se pierde por reimportar.
 * - `actualizar`: pisa los datos descriptivos con los del archivo. NO toca el
 *   stock, que es de esta farmacia.
 */
export const ModoImportacionSchema = z.enum(['solo-nuevos', 'actualizar'])
export type ModoImportacion = z.infer<typeof ModoImportacionSchema>

/** Lo que devuelve el selector de archivos. `null` si el usuario cancela. */
export const ArchivoElegidoSchema = z.object({
  ruta: z.string(),
  nombre: z.string(),
  /** Texto completo del archivo, ya decodificado. */
  contenido: z.string()
})

export type ArchivoElegido = z.infer<typeof ArchivoElegidoSchema>

/**
 * Un registro que no se puede importar. Se rechazan, nunca se corrigen solos:
 * un nombre vacio o un codigo con letras se tienen que ver a mano.
 */
export const RechazoImportacionSchema = z.object({
  /** Posicion dentro del arreglo del archivo, empezando en 1. */
  registro: z.number().int().positive(),
  nombre: z.string().nullable(),
  codigoBarras: z.string().nullable(),
  motivo: z.string()
})

export type RechazoImportacion = z.infer<typeof RechazoImportacionSchema>

export const TIPO_ADVERTENCIA = [
  'codigo-duplicado-en-archivo',
  'codigo-ilegible',
  'checksum-invalido',
  'sin-numero-de-troquel'
] as const

export const AdvertenciaImportacionSchema = z.object({
  tipo: z.enum(TIPO_ADVERTENCIA),
  codigoBarras: z.string().nullable(),
  /** Cuantos registros del archivo caen en esta advertencia. */
  veces: z.number().int().positive(),
  /** Algunos nombres, para poder identificar el caso sin volcar 681 filas. */
  ejemplos: z.array(z.string()).max(3)
})

export type AdvertenciaImportacion = z.infer<typeof AdvertenciaImportacionSchema>

/** Resultado del analisis en seco. No escribe nada. */
export const InformeImportacionSchema = z.object({
  archivo: z.object({
    nombre: z.string(),
    ruta: z.string(),
    bytes: z.number().int().nonnegative()
  }),
  /** Registros leidos del archivo, validos o no. */
  leidos: z.number().int().nonnegative(),
  /** Registros que se van a crear. */
  nuevos: z.number().int().nonnegative(),
  /** Registros que ya existen y, segun el modo, se van a pisar. */
  aActualizar: z.number().int().nonnegative(),
  /** Registros que ya existen y se conservan sin tocar. */
  aConservar: z.number().int().nonnegative(),
  rechazados: z.array(RechazoImportacionSchema),
  advertencias: z.array(AdvertenciaImportacionSchema),
  /**
   * Todos los productos del archivo entran con stock 0.
   *
   * El archivo de origen trae `units: 0` en los 681 registros, que es un
   * artefacto de la exportacion y no un conteo real. Por eso la importacion
   * NO genera movimientos de ingreso: el stock real se carga en el conteo.
   */
  todosEntranEnCero: z.literal(true)
})

export type InformeImportacion = z.infer<typeof InformeImportacionSchema>

/** Lo que efectivamente se escribio. */
export const ResultadoImportacionSchema = z.object({
  insertados: z.number().int().nonnegative(),
  actualizados: z.number().int().nonnegative(),
  conservados: z.number().int().nonnegative(),
  rechazados: z.number().int().nonnegative()
})

export type ResultadoImportacion = z.infer<typeof ResultadoImportacionSchema>

/** Argumentos de `importar:analizar` y `importar:aplicar`. */
export const ArgsImportacionSchema = z.object({
  contenido: z
    .string()
    .min(2, 'El archivo está vacío')
    .max(20_000_000, 'El archivo es demasiado grande (máximo 20 MB)'),
  nombreArchivo: z.string().min(1).max(255),
  rutaArchivo: z.string().max(1024).default(''),
  modo: ModoImportacionSchema.default('solo-nuevos')
})

export type ArgsImportacion = z.infer<typeof ArgsImportacionSchema>
