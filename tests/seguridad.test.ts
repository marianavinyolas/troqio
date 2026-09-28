/**
 * La CSP es lo único en toda la app que solo actúa cuando está empaquetada.
 *
 * Eso la deja en el peor lugar posible: el código de seguridad que ninguna
 * corrida ejecuta. En desarrollo no se aplica (Vite necesita `eval` y scripts
 * inline), así que el arnés de interfaz la tenía puesta y los tests tampoco la
 * miraban. Estos tests cubren las dos ramas, y el arnés la corre de verdad
 * con `TROQIO_CSP=1`.
 */
import { describe, expect, it, vi } from 'vitest'

type ModuloMain = typeof import('../src/main/index')

/**
 * Lo que Electron le pasa al listener de cabeceras.
 *
 * Se declara acá en vez de importar el tipo de Electron porque el stub es
 * parcial: el listener real recibe (details, callback) y el test solo ejercita
 * la parte que arma la cabecera.
 */
type Detalles = { responseHeaders: Record<string, string[]> }
type Callback = (respuesta: Detalles) => void

interface Resultado {
  csp: string | null
  cabecerasOriginales: Record<string, string[]> | null
}

/**
 * Importa `src/main/index` con un `electron` de mentira, aplica la CSP y
 * devuelve lo que el listener de cabeceras respondió.
 *
 * El módulo corre su andamiaje al importarse, así que el stub tiene que
 * responder a todo sin hacer nada. `whenReady` nunca resuelve a propósito: si
 * fuera a resolver, el módulo abriría una ventana con un `BrowserWindow` falso.
 */
async function aplicarCsp(isPackaged: boolean): Promise<Resultado> {
  const onHeadersReceived = vi.fn()

  vi.resetModules()
  vi.doMock('electron', () => ({
    app: {
      isPackaged,
      requestSingleInstanceLock: () => true,
      on: vi.fn(),
      quit: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: () => '/tmp/troqio-test',
      whenReady: () => new Promise<void>(() => {})
    },
    BrowserWindow: { getAllWindows: () => [] },
    session: { defaultSession: { webRequest: { onHeadersReceived } } },
    shell: { openExternal: vi.fn() }
  }))

  const modulo: ModuloMain = await import('../src/main/index')
  modulo.applyContentSecurityPolicy()

  const listener = onHeadersReceived.mock.calls[0]?.[0] as Callback | undefined
  if (!listener) return { csp: null, cabecerasOriginales: null }

  let respuesta: Detalles | undefined
  const detalles = { responseHeaders: { 'Content-Type': ['text/html'] } }
  ;(listener as unknown as (d: Detalles, c: Callback) => void)(detalles, r => {
    respuesta = r
  })

  return {
    csp: respuesta?.responseHeaders['Content-Security-Policy']?.[0] ?? null,
    cabecerasOriginales: respuesta?.responseHeaders ?? null
  }
}

describe('CSP', () => {
  it('no se aplica sin empaquetar: la del devserver la rompería', async () => {
    expect((await aplicarCsp(false)).csp).toBeNull()
  })

  it('la app empaquetada manda la CSP por cabecera', async () => {
    const { csp } = await aplicarCsp(true)
    expect(csp).toBeTruthy()
    expect(csp).toBe((await import('../src/main/index')).CSP_PROD)
  })

  it('no pisa las cabeceras que ya venían', async () => {
    const { cabecerasOriginales } = await aplicarCsp(true)
    expect(cabecerasOriginales?.['Content-Type']).toEqual(['text/html'])
  })

  it('no deja pasar eval, que es justo lo que Electron avisa', async () => {
    const { csp } = await aplicarCsp(true)
    expect(csp).not.toContain('unsafe-eval')
  })

  it('no deja pasar scripts inline, que es lo que habilita el HMR', async () => {
    const { csp } = await aplicarCsp(true)
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })

  it('deja pasar estilos inline, que React los usa', async () => {
    const { csp } = await aplicarCsp(true)
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/)
  })

  it('cierra lo que la app no usa', async () => {
    const { csp } = await aplicarCsp(true)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
