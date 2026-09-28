import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  type ActualizarProducto,
  ActualizarProductoSchema,
  type ArchivoElegido,
  type ArgsImportacion,
  ArgsImportacionSchema,
  type CodigoBarras,
  CodigoBarrasSchema,
  type DatosProducto,
  DatosProductoSchema,
  type DiagnosticoResult,
  type FiltroCatalogo,
  FiltroCatalogoSchema,
  type IdProducto,
  IdProductoSchema
} from '@shared/ipc'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { getDb, getDbFileStats, getDbPath, getSqlite } from '../db'
import {
  actualizarProducto,
  buscarPorCodigoBarras,
  crearProducto,
  desactivarProducto,
  listarProductos,
  obtenerProducto,
  resumenCatalogo
} from '../db/productos'
import { analizarImportacion, aplicarImportacion } from '../importar/aplicar'

function readPragmaString(key: string): string {
  const value = getSqlite().pragma(key, { simple: true })
  return typeof value === 'string' ? value : String(value ?? '')
}

function readForeignKeys(): boolean {
  return getSqlite().pragma('foreign_keys', { simple: true }) === 1
}

/**
 * Convierte un error en una línea que se pueda leer en una pantalla.
 *
 * Un `ZodError` es un objeto con un `issues` lleno de datos. Ese objeto no
 * sobrevive el cruce del IPC: en el renderer llega un `Error` corriente cuyo
 * mensaje es el volcado JSON de los issues, y Electron lo vuelca entero en la
 * consola del main. En el formulario eso significaba que el usuario veía
 * `[{"origin":"string","code":"too_small",…}]` en vez de "El nombre es
 * obligatorio".
 *
 * La validación por campo la hace el renderer con el MISMO schema del
 * `src/shared/ipc`, así que en el camino normal esto no se ve: el error llega
 * ya mapeado a su campo. Esto es la red de abajo, para cuando algo se escapa.
 */
function mensajeDeError(e: unknown): string {
  const issues = (e as { issues?: { path?: PropertyKey[]; message?: string }[] } | null)?.issues
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map(issue => {
        const campo = issue.path?.join('.')
        const texto = issue.message ?? 'valor inválido'
        return campo ? `${campo}: ${texto}` : texto
      })
      .join(' · ')
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * Registra un comando de la allowlist.
 *
 * El wrapper existe solo para el mensaje del error: `ipcMain.handle` propaga
 * lo que se tira tal cual, y sin esto cada validación fallida deja un
 * `ZodError` completo en la consola. El esquema sigue validando en el main:
 * es la barrera real, y que el renderer valide antes es una cortesía, no la
 * garantía.
 */
function manejar(canal: string, fn: (args: unknown) => unknown): void {
  ipcMain.handle(canal, async (_event, args: unknown) => {
    try {
      return await fn(args)
    } catch (e) {
      throw new Error(mensajeDeError(e))
    }
  })
}

/**
 * Allowlist de IPC. Cada handler es un comando explicito con argumentos
 * validados. No existe un `query(sql)` generico: esa seria una superficie
 * de inyeccion innecesaria incluso en una app local.
 *
 * Todo lo que viene del renderer pasa por un schema de Zod antes de tocar la
 * base. Un `.parse()` que tira no es un bug: es un renderer que intentó hacer
 * algo que no puede.
 */
export function registerIpc(): void {
  manejar('diagnostico', (): DiagnosticoResult => {
    // Fuerza la apertura de la conexion para que este comando sea una
    // verdadera prueba de humo del modulo nativo.
    const sqliteVersion = readPragmaString('sqlite_version')
    const dbPath = getDbPath()
    getDb()
    const stats = getDbFileStats()

    return {
      // app.getVersion() lee package.json en desarrollo y la version
      // incrustada por electron-builder en el instalador.
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      sqliteVersion,
      journalMode: readPragmaString('journal_mode'),
      foreignKeys: readForeignKeys(),
      dbPath,
      dbExists: stats.exists,
      dbSizeBytes: stats.sizeBytes
    }
  })

  // --- Productos ---------------------------------------------------------

  manejar('productos:listar', args => {
    const filtro: FiltroCatalogo = FiltroCatalogoSchema.parse(args)
    return listarProductos(filtro)
  })

  manejar('productos:obtener', args => {
    const { id }: IdProducto = IdProductoSchema.parse(args)
    return obtenerProducto(id)
  })

  manejar('productos:crear', args => {
    const datos: DatosProducto = DatosProductoSchema.parse(args)
    return crearProducto(datos)
  })

  manejar('productos:actualizar', args => {
    const { id, ...datos }: ActualizarProducto = ActualizarProductoSchema.parse(args)
    return actualizarProducto(id, datos)
  })

  manejar('productos:desactivar', args => {
    const { id }: IdProducto = IdProductoSchema.parse(args)
    desactivarProducto(id)
  })

  /** Lectura por código exacto. Es la que usa el escáner. */
  manejar('productos:porCodigoBarras', args => {
    const { codigoBarras }: CodigoBarras = CodigoBarrasSchema.parse(args)
    return buscarPorCodigoBarras(codigoBarras)
  })

  manejar('productos:resumen', () => resumenCatalogo())

  // --- Importación -------------------------------------------------------

  /**
   * Selector de archivos nativo.
   *
   * Vive en el main a propósito: el renderer corre con `sandbox: true` y no
   * puede tocar el disco. Así la app lee un archivo sin abrir permisos ni
   * agregar un `<input type="file">` con el archivo entero en memoria del
   * renderer.
   */
  manejar('importar:elegirArchivo', async (): Promise<ArchivoElegido | null> => {
    const opciones = {
      title: 'Elegir el archivo del catálogo',
      properties: ['openFile' as const],
      filters: [{ name: 'Archivo JSON', extensions: ['json'] }],
      defaultPath: app.getPath('documents')
    }

    // El diálogo se abre sobre la ventana activa para que salga centrado y por
    // detrás de la app, y no como una ventana suelta.
    const ventana = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const resultado = ventana
      ? await dialog.showOpenDialog(ventana, opciones)
      : await dialog.showOpenDialog(opciones)

    if (resultado.canceled) return null

    // Con `noUncheckedIndexedAccess` el primer elemento es `string | undefined`
    // aunque el array no esté vacío. El diálogo garantiza al menos uno cuando
    // no se cancela, pero un `??` es más barato que un aserto.
    const ruta = resultado.filePaths[0]
    if (!ruta) return null

    return { ruta, nombre: basename(ruta), contenido: await readFile(ruta, 'utf8') }
  })

  manejar('importar:analizar', args => {
    const validos: ArgsImportacion = ArgsImportacionSchema.parse(args)
    return analizarImportacion(validos)
  })

  manejar('importar:aplicar', args => {
    const validos: ArgsImportacion = ArgsImportacionSchema.parse(args)
    return aplicarImportacion(validos)
  })
}
