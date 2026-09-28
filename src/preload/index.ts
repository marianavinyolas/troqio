import type {
  ActualizarProducto,
  ArchivoElegido,
  ArgsImportacion,
  CodigoBarras,
  DatosProducto,
  DiagnosticoResult,
  FiltroCatalogo,
  IdProducto,
  InformeImportacion,
  ListaProductos,
  ProductoConStock,
  ResultadoImportacion,
  ResumenCatalogo
} from '@shared/ipc'
import { contextBridge, ipcRenderer } from 'electron'

/**
 * Superficie minima expuesta al renderer.
 *
 * Solo funciones tipadas y sin argumentos crudos. El renderer no puede
 * ejecutar SQL ni tocar el sistema de archivos.
 *
 * Los tipos de los argumentos vienen del contrato compartido, pero eso NO
 * alcanza como validación: TypeScript compila en el renderer y el valor real
 * viaja por `invoke`, así que del otro lado se vuelve a validar con Zod. El
 * tipado de acá es para el autocompletado, no la barrera.
 */
const FILTRO_VACIO: FiltroCatalogo = {
  filtro: '',
  limite: 50,
  desplazamiento: 0,
  incluirInactivos: false
}

const troqio = {
  diagnostico: (): Promise<DiagnosticoResult> => ipcRenderer.invoke('diagnostico'),

  productos: {
    listar: (filtro: FiltroCatalogo = FILTRO_VACIO): Promise<ListaProductos> =>
      ipcRenderer.invoke('productos:listar', filtro),
    obtener: (args: IdProducto): Promise<ProductoConStock | null> =>
      ipcRenderer.invoke('productos:obtener', args),
    crear: (datos: DatosProducto): Promise<ProductoConStock> =>
      ipcRenderer.invoke('productos:crear', datos),
    actualizar: (datos: ActualizarProducto): Promise<ProductoConStock | null> =>
      ipcRenderer.invoke('productos:actualizar', datos),
    desactivar: (args: IdProducto): Promise<void> =>
      ipcRenderer.invoke('productos:desactivar', args),
    porCodigoBarras: (args: CodigoBarras): Promise<ProductoConStock | null> =>
      ipcRenderer.invoke('productos:porCodigoBarras', args),
    resumen: (): Promise<ResumenCatalogo> => ipcRenderer.invoke('productos:resumen')
  },

  importar: {
    elegirArchivo: (): Promise<ArchivoElegido | null> =>
      ipcRenderer.invoke('importar:elegirArchivo'),
    analizar: (args: ArgsImportacion): Promise<InformeImportacion> =>
      ipcRenderer.invoke('importar:analizar', args),
    aplicar: (args: ArgsImportacion): Promise<ResultadoImportacion> =>
      ipcRenderer.invoke('importar:aplicar', args)
  }
}

export type TroqioApi = typeof troqio

contextBridge.exposeInMainWorld('troqio', troqio)
