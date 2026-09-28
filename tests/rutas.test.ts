import { describe, expect, it } from 'vitest'
import { NOMBRES_ICONO } from '../src/renderer/src/iconos'
import { esIdRuta, obtenerRuta, RUTA_INICIAL, RUTAS } from '../src/renderer/src/rutas'

/**
 * El registro de rutas es datos puros justamente para poder verificarlo aca,
 * en entorno node y sin jsdom ni React.
 */
describe('registro de rutas', () => {
  it('no tiene ids repetidos', () => {
    const ids = RUTAS.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('solo referencia iconos que existen en el set', () => {
    for (const ruta of RUTAS) {
      expect(NOMBRES_ICONO).toContain(ruta.icono)
    }
  })

  it('la ruta inicial existe y esta disponible', () => {
    const inicial = obtenerRuta(RUTA_INICIAL)
    expect(inicial.disponible).toBe(true)
  })

  it('habilita exactamente las pantallas que ya están construidas', () => {
    // La lista se actualiza a mano en cada hito que entrega una pantalla, y
    // este test es lo que falla si alguien marca `disponible: true` sin
    // construirla, o al revés.
    const habilitadas = RUTAS.filter(r => r.disponible).map(r => r.id)
    expect(habilitadas).toEqual(['catalogo', 'diagnostico', 'estilos'])
  })

  it('cada pantalla habilitada tiene su hito acotado a lo entregado', () => {
    // El Catálogo es la primera pantalla de producto: llega en M3.
    expect(obtenerRuta('catalogo').hito).toBe('M3')
  })

  it('Estilos es la referencia del sistema de diseño', () => {
    expect(obtenerRuta('estilos').hito).toBe('M1')
  })

  it('toda pantalla deshabilitada dice en que hito llega', () => {
    for (const ruta of RUTAS) {
      if (ruta.disponible) continue
      expect(ruta.hito).toMatch(/^M\d+$/)
    }
  })

  it('toda pantalla tiene icono, etiqueta y descripcion', () => {
    for (const ruta of RUTAS) {
      expect(ruta.etiqueta.length).toBeGreaterThan(0)
      expect(ruta.descripcion.length).toBeGreaterThan(0)
    }
  })
})

describe('esIdRuta', () => {
  it('acepta los ids del registro', () => {
    for (const ruta of RUTAS) {
      expect(esIdRuta(ruta.id)).toBe(true)
    }
  })

  it('rechaza cualquier otra cosa', () => {
    for (const basura of ['busqueda2', '', 'Diagnostico', null, undefined, 42, {}]) {
      expect(esIdRuta(basura)).toBe(false)
    }
  })
})
