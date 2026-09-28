import type { NombreIcono } from './iconos'

/**
 * Registro de destinos de la app.
 *
 * Datos puros a proposito: sin React, sin componentes. Asi `tests/rutas.test.ts`
 * los puede verificar en entorno node sin jsdom, y el shell decide aparte que
 * componente pintar para cada id.
 */

export type IdRuta =
  | 'busqueda'
  | 'catalogo'
  | 'conteo'
  | 'movimientos'
  | 'respaldo'
  | 'diagnostico'
  | 'estilos'

export interface Ruta {
  readonly id: IdRuta
  readonly etiqueta: string
  readonly descripcion: string
  readonly icono: NombreIcono
  /** Milestone del roadmap que entrega esta pantalla. */
  readonly hito: string
  /** false = todavia no se puede entrar; la app muestra un aviso. */
  readonly disponible: boolean
}

export const RUTAS: readonly Ruta[] = [
  {
    id: 'busqueda',
    etiqueta: 'Buscar',
    descripcion: 'Busca por nombre comercial, principio activo o código de barras.',
    icono: 'lupa',
    hito: 'M5',
    disponible: false
  },
  {
    id: 'catalogo',
    etiqueta: 'Catálogo',
    descripcion: 'Alta, edición e importación de productos y sus códigos.',
    icono: 'caja',
    hito: 'M3',
    disponible: true
  },
  {
    id: 'conteo',
    etiqueta: 'Conteo',
    descripcion: 'Escanea cada caja del salón para cargar el stock inicial.',
    icono: 'codigo-barras',
    hito: 'M4',
    disponible: false
  },
  {
    id: 'movimientos',
    etiqueta: 'Movimientos',
    descripcion: 'Entradas, descuentos y ajustes, con historial append-only.',
    icono: 'historial',
    hito: 'M6',
    disponible: false
  },
  {
    id: 'respaldo',
    etiqueta: 'Respaldo',
    descripcion: 'Copia de seguridad de la base local, con la app cerrada.',
    icono: 'datos',
    hito: 'M7',
    disponible: false
  },
  {
    id: 'diagnostico',
    etiqueta: 'Diagnóstico',
    descripcion: 'Estado de Electron, IPC, SQLite y de la base de datos.',
    icono: 'pulso',
    hito: 'M0',
    disponible: true
  },
  {
    id: 'estilos',
    etiqueta: 'Estilos',
    descripcion: 'Tokens de tema y componentes base del sistema de diseño.',
    icono: 'info',
    hito: 'M1',
    disponible: true
  }
]

/** Destino al abrir la app. */
export const RUTA_INICIAL: IdRuta = 'diagnostico'

export function esIdRuta(valor: unknown): valor is IdRuta {
  return typeof valor === 'string' && RUTAS.some(ruta => ruta.id === valor)
}

export function obtenerRuta(id: IdRuta): Ruta {
  const ruta = RUTAS.find(r => r.id === id)
  if (!ruta) throw new Error(`Ruta desconocida: ${id}`)
  return ruta
}
