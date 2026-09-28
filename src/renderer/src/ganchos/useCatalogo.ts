import type { ProductoConStock, ResumenCatalogo } from '@shared/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Cuántos productos trae cada consulta. 50 entra cómodo en una pantalla. */
const TAMANO_PAGINA = 50

/** Cuánto se espera antes de consultar, en ms. */
const ESPERA_FILTRO = 200

export type VistaCatalogo = 'lista' | 'formulario' | 'importar'

export interface EstadoCatalogo {
  vista: VistaCatalogo
  /** Producto en edición, o `null` si el formulario es un alta. */
  editando: ProductoConStock | null

  filas: ProductoConStock[]
  total: number
  pagina: number
  resumen: ResumenCatalogo | null

  cargando: boolean
  error: string | null

  filtro: string
  incluirInactivos: boolean

  irA(pagina: number): void
  setFiltro(texto: string): void
  setIncluirInactivos(valor: boolean): void
  /** Vuelve a consultar la lista y el resumen. No devuelve una promesa. */
  recargar(): void
  abrirAlta(): void
  abrirEdicion(producto: ProductoConStock): void
  abrirImportacion(): void
  volverALista(): void
}

/**
 * Estado del catálogo: listado, filtro, paginación y a qué subpantalla está.
 *
 * El listado no se trae entero. Con 681 productos y la intención de que el
 * catálogo crezca, se pagina en el main: el renderer nunca pide más de 200
 * filas de una vez.
 */
export function useCatalogo(): EstadoCatalogo {
  const [vista, setVista] = useState<VistaCatalogo>('lista')
  const [editando, setEditando] = useState<ProductoConStock | null>(null)

  const [filas, setFilas] = useState<ProductoConStock[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [resumen, setResumen] = useState<ResumenCatalogo | null>(null)

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * El texto del filtro y el texto que se consulta son dos estados distintos.
   *
   * El primero va pegado a la caja de texto, para que escribir se sienta
   * inmediato. El segundo se retrasa `ESPERA_FILTRO`, para que escribir
   * "ibuprofeno" haga una consulta y no diez. La caja de texto de M5 va a
   * reusar este mismo mecanismo.
   */
  const [filtro, setFiltroTexto] = useState('')
  const [filtroConsultado, setFiltroConsultado] = useState('')
  const [incluirInactivos, setIncluirInactivos] = useState(false)

  /**
   * Número del último pedido.
   *
   * Dos consultas pueden viajar a la vez y no terminar en orden. Si la de
   * "ib" tarda más que la de "ibuprofeno", sin esto la lista queda mostrando
   * el resultado de "ib" con el texto de "ibuprofeno" en el campo de arriba.
   */
  const pedidoEnCurso = useRef(0)

  /**
   * Contador que se sube para pedir una consulta nueva sin cambiar el filtro.
   *
   * Es lo que hace `recargar`. La alternativa obvia, poner el filtro en su
   * propio estado y tocarlo, no funciona: si el valor es el mismo, React no
   * vuelve a renderizar y la consulta no se dispara.
   *
   * Está en las dependencias del efecto de la consulta aunque no se lea: es un
   * disparador. Súbilo y la consulta se vuelve a correr, que es lo que quiere
   * `recargar`. Por eso el linter lo marca como dependencia de más, y por eso
   * está en la lista igual.
   */
  const [disparador, setDisparador] = useState(0)

  useEffect(() => {
    const temporizador = setTimeout(() => setFiltroConsultado(filtro), ESPERA_FILTRO)
    return () => clearTimeout(temporizador)
  }, [filtro])

  useEffect(() => {
    const numero = pedidoEnCurso.current + 1
    pedidoEnCurso.current = numero
    let vigente = true

    setCargando(true)
    ;(async () => {
      try {
        // Se lee para que el disparador cuente como dependencia usada: sin
        // esto, el efecto depende de un valor que nunca mira y el linter
        // avisa que sobra. Leerlo no cambia nada, la consulta ya va siempre.
        void disparador

        const [listado, conteo] = await Promise.all([
          window.troqio.productos.listar({
            filtro: filtroConsultado,
            limite: TAMANO_PAGINA,
            desplazamiento: pagina * TAMANO_PAGINA,
            incluirInactivos
          }),
          window.troqio.productos.resumen()
        ])

        if (!vigente) return

        // Si la última página se quedó vacía, se retrocede en vez de mostrar
        // "catálogo vacío": pasa al dar de baja el último producto de la
        // última página, y el catálogo entero sigue lleno.
        if (listado.filas.length === 0 && pagina > 0) {
          setPagina(pagina - 1)
          return
        }

        setFilas(listado.filas)
        setTotal(listado.total)
        setResumen(conteo)
        setError(null)
      } catch (e) {
        if (!vigente) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (vigente) setCargando(false)
      }
    })()

    // Al cambiar cualquier dependencia arranca una consulta nueva y la anterior
    // deja de poder escribir.
    return () => {
      vigente = false
    }
  }, [filtroConsultado, incluirInactivos, pagina, disparador])

  const setFiltro = useCallback((texto: string) => {
    setFiltroTexto(texto)
    // Cambiar el filtro vuelve a la primera página: si se estaba en la 7 con
    // otro filtro, esa página ya no existe.
    setPagina(0)
  }, [])

  const irA = useCallback((nueva: number) => {
    setPagina(Math.max(0, nueva))
  }, [])

  /**
   * Vuelve a consultar la lista y el resumen.
   *
   * Antes esto solo refrescaba los contadores de arriba, y la lista seguía
   * mostrando lo que había antes de dar de baja, editar o importar: el
   * contador decía 681 y abajo seguían las 50 filas viejas. Los contadores y
   * las filas tienen que venir de la misma consulta.
   */
  const recargar = useCallback(() => {
    setDisparador(n => n + 1)
  }, [])

  return {
    vista,
    editando,
    filas,
    total,
    pagina,
    resumen,
    cargando,
    error,
    filtro,
    incluirInactivos,
    irA,
    setFiltro,
    setIncluirInactivos,
    recargar,
    abrirAlta() {
      setEditando(null)
      setVista('formulario')
    },
    abrirEdicion(producto: ProductoConStock) {
      setEditando(producto)
      setVista('formulario')
    },
    abrirImportacion() {
      setVista('importar')
    },
    volverALista() {
      setEditando(null)
      setVista('lista')
    }
  }
}
