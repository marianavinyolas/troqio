/**
 * Set de iconos en SVG, dibujados a mano para no depender de una libreria.
 *
 * Benefits de hacerlo asi:
 *  - cero dependencias nuevas en un app que tiene que ser offline y mantenible;
 *  - `img-src 'self'` no necesita ampliarse para nada;
 *  - los trazados son datos puros, asi que `tests/rutas.test.ts` puede
 *    verificar que cada ruta referencia un icono que existe de verdad.
 *
 * Todos los iconos usan el mismo lienzo de 24x24 y se dibujan con trazo
 * (no relleno) para que mantengan el mismo peso visual a cualquier tamaño.
 */

export const NOMBRES_ICONO = [
  'lupa',
  'caja',
  'codigo-barras',
  'historial',
  'datos',
  'pulso',
  'check',
  'alerta',
  'info',
  'mas',
  'chevron-derecha',
  'deshacer',
  'atras'
] as const

export type NombreIcono = (typeof NOMBRES_ICONO)[number]

/**
 * Un icono es una lista de primitivas. Se guardan como datos (no como JSX)
 * para que este modulo siga siendo importable desde un test en node.
 */
export type Trazo =
  | { d: string }
  | { circulo: [cx: number, cy: number, r: number] }
  | { linea: [x1: number, y1: number, x2: number, y2: number] }
  | { rect: [x: number, y: number, w: number, h: number, rx: number] }

export const TRAZOS: Record<NombreIcono, Trazo[]> = {
  lupa: [{ circulo: [11, 11, 7] }, { linea: [16.65, 16.65, 21, 21] }],
  caja: [{ rect: [2.5, 4, 19, 16, 2] }, { linea: [2.5, 9.5, 21.5, 9.5] }, { d: 'M12 9.5V20' }],
  'codigo-barras': [
    { linea: [4, 5, 4, 19] },
    { linea: [7.5, 5, 7.5, 19] },
    { linea: [11, 5, 11, 13] },
    { linea: [14.5, 5, 14.5, 19] },
    { linea: [18, 5, 18, 13] },
    { linea: [20.5, 5, 20.5, 19] }
  ],
  historial: [
    { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
    { d: 'M3 3v5h5' },
    { d: 'M12 7v5l4 2' }
  ],
  datos: [
    { d: 'M3 5c0 1.66 4.03 3 9 3s9-1.34 9-3-4.03-3-9-3-9 1.34-9 3Z' },
    { d: 'M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5' },
    { d: 'M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3' }
  ],
  pulso: [{ d: 'M22 12h-4l-3 9L9 3l-3 9H2' }],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  alerta: [
    {
      d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z'
    },
    { d: 'M12 9v4' },
    { d: 'M12 17h.01' }
  ],
  info: [{ circulo: [12, 12, 9] }, { d: 'M12 16v-4' }, { d: 'M12 8h.01' }],
  mas: [{ d: 'M5 12h14' }, { d: 'M12 5v14' }],
  'chevron-derecha': [{ d: 'm9 18 6-6-6-6' }],
  deshacer: [{ d: 'M3 7v6h6' }, { d: 'M21 17a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.3 2.6L3 13' }],
  atras: [{ d: 'M19 12H5' }, { d: 'm12 19-7-7 7-7' }]
}

/** Clave estable por primitiva, para no usar el indice del array como key. */
export function claveTrazo(trazo: Trazo, indice: number): string {
  if ('d' in trazo) return trazo.d
  if ('circulo' in trazo) return `c${trazo.circulo.join('_')}`
  if ('linea' in trazo) return `l${trazo.linea.join('_')}`
  return `r${trazo.rect.join('_')}_${indice}`
}
