import { Icono } from '@renderer/componentes/Icono'
import { Boton } from '@renderer/componentes/ui/Boton'
import { Campo } from '@renderer/componentes/ui/Campo'
import { Insignia } from '@renderer/componentes/ui/Insignia'
import { Tarjeta } from '@renderer/componentes/ui/Tarjeta'
import { Vacio } from '@renderer/componentes/ui/Vacio'
import { useCatalogo } from '@renderer/ganchos/useCatalogo'
import type { ProductoConStock } from '@shared/ipc'
import { useState } from 'react'
import { Importar } from './Importar'
import { ProductoForm } from './ProductoForm'

/** Cuántos productos trae cada página. Tiene que coincidir con el hook. */
const TAMANO_PAGINA = 50

/**
 * Catálogo: alta, edición, baja e importación.
 *
 * Las tres subpantallas (listado, formulario, importación) se eligen con un
 * `useState`, no con rutas. Un destino nuevo en el enrutado es una entrada en
 * `rutas.ts`; esto es una vista de la misma pantalla y no merece un historial
 * de navegador. Cuando haga falta abrir un producto desde un resultado de
 * búsqueda (M5), ahí sí se cambia el enrutado.
 */
export function Catalogo() {
  const catalogo = useCatalogo()

  if (catalogo.vista === 'formulario') {
    return (
      <ProductoForm
        producto={catalogo.editando}
        onVolver={catalogo.volverALista}
        onGuardado={() => {
          catalogo.recargar()
          catalogo.volverALista()
        }}
      />
    )
  }

  if (catalogo.vista === 'importar') {
    return <Importar onVolver={catalogo.volverALista} onImportado={catalogo.recargar} />
  }

  return <Lista catalogo={catalogo} />
}

type Estado = ReturnType<typeof useCatalogo>

function Lista({ catalogo }: { catalogo: Estado }) {
  const [porDeBaja, setPorDeBaja] = useState<ProductoConStock | null>(null)

  const { filas, total, pagina, resumen, cargando, error, filtro, incluirInactivos } = catalogo
  const ultimaPagina = Math.max(0, Math.ceil(total / TAMANO_PAGINA) - 1)

  async function darDeBaja(producto: ProductoConStock) {
    await window.troqio.productos.desactivar({ id: producto.id })
    setPorDeBaja(null)
    // Recarga la lista, no solo los contadores: si no, el producto dado de
    // baja seguiría en pantalla con la fila siguiente.
    catalogo.recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/5 px-4 py-3">
          <Icono nombre="alerta" className="mt-0.5 size-4.5 shrink-0 text-danger" />
          <p className="text-sm break-all text-danger">{error}</p>
        </div>
      )}

      {resumen && <Resumen conteo={resumen} />}

      <div className="flex flex-wrap items-end gap-2">
        <Campo
          etiqueta="Buscar en el catálogo"
          icono="lupa"
          placeholder="Nombre, principio activo o código"
          value={filtro}
          onChange={e => catalogo.setFiltro(e.target.value)}
          className="min-w-64 flex-1"
        />

        <Boton variante="primario" onClick={catalogo.abrirAlta}>
          <Icono nombre="mas" className="size-4" />
          Nuevo producto
        </Boton>

        <Boton variante="secundario" onClick={catalogo.abrirImportacion}>
          <Icono nombre="subir" className="size-4" />
          Importar
        </Boton>
      </div>

      <Tarjeta
        titulo={filtro ? `Resultados para "${filtro}"` : 'Catálogo'}
        descripcion={
          cargando ? 'Consultando...' : `${total} ${total === 1 ? 'producto' : 'productos'}`
        }
        acciones={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted select-none">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={e => catalogo.setIncluirInactivos(e.target.checked)}
              className="size-3.5 accent-brand"
            />
            Mostrar dados de baja
          </label>
        }
      >
        {filas.length === 0 && !cargando ? (
          <div className="p-4">
            {filtro ? (
              <Vacio
                icono="lupa"
                titulo="No hay nada con ese texto"
                descripcion="Probá con menos palabras, o con el nombre comercial."
              />
            ) : (
              <Vacio
                icono="caja"
                titulo="El catálogo está vacío"
                descripcion="Cargá el archivo del sistema anterior, o dá de alta el primer producto a mano."
                accion={
                  <div className="flex gap-2">
                    <Boton variante="primario" onClick={catalogo.abrirImportacion}>
                      <Icono nombre="subir" className="size-4" />
                      Importar catálogo
                    </Boton>
                    <Boton variante="secundario" onClick={catalogo.abrirAlta}>
                      <Icono nombre="mas" className="size-4" />
                      Nuevo producto
                    </Boton>
                  </div>
                }
              />
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {filas.map(producto => (
                <li key={producto.id}>
                  <FilaProducto
                    producto={producto}
                    onEditar={() => catalogo.abrirEdicion(producto)}
                    onDeBaja={() => setPorDeBaja(producto)}
                  />
                </li>
              ))}
            </ul>

            {total > TAMANO_PAGINA && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <span className="text-xs text-ink-muted">
                  Página {pagina + 1} de {ultimaPagina + 1}
                </span>
                <div className="flex gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={pagina === 0}
                    onClick={() => catalogo.irA(pagina - 1)}
                  >
                    <Icono nombre="atras" className="size-3.5" />
                    Anterior
                  </Boton>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={pagina >= ultimaPagina}
                    onClick={() => catalogo.irA(pagina + 1)}
                  >
                    Siguiente
                    <Icono nombre="chevron-derecha" className="size-3.5" />
                  </Boton>
                </div>
              </div>
            )}
          </>
        )}
      </Tarjeta>

      {porDeBaja && (
        <ConfirmarDeBaja
          producto={porDeBaja}
          onCancelar={() => setPorDeBaja(null)}
          onConfirmar={() => darDeBaja(porDeBaja)}
        />
      )}
    </div>
  )
}

function Resumen({ conteo }: { conteo: NonNullable<Estado['resumen']> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Contador etiqueta="Productos" valor={conteo.activos} />
      <Contador etiqueta="Con stock" valor={conteo.conStock} tono="ok" />
      <Contador
        etiqueta="Sin stock"
        valor={conteo.sinStock}
        tono={conteo.sinStock > 0 ? 'aviso' : undefined}
      />
      <Contador etiqueta="Dados de baja" valor={conteo.inactivos} />
    </div>
  )
}

function Contador({
  etiqueta,
  valor,
  tono
}: {
  etiqueta: string
  valor: number
  tono?: 'ok' | 'aviso'
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <p
        className={`text-xl font-semibold tabular-nums ${
          tono === 'ok' ? 'text-ok' : tono === 'aviso' ? 'text-warn' : 'text-ink'
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{etiqueta}</p>
    </div>
  )
}

function FilaProducto({
  producto,
  onEditar,
  onDeBaja
}: {
  producto: ProductoConStock
  onEditar(): void
  onDeBaja(): void
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{producto.nombre}</p>
          {!producto.activo && <Insignia tono="neutro">Dado de baja</Insignia>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
          {producto.principioActivo && <span className="truncate">{producto.principioActivo}</span>}
          <span className="font-mono">{producto.codigoBarras}</span>
          {producto.numeroTroquel && <span>Troquel {producto.numeroTroquel}</span>}
        </div>
      </div>

      <span
        className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${
          producto.cantidad === 0 ? 'text-ink-subtle' : 'text-ink'
        }`}
        title={`Stock: ${producto.cantidad}`}
      >
        {producto.cantidad === 0 ? '0' : producto.cantidad}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <Boton
          variante="fantasma"
          tamano="sm"
          onClick={onEditar}
          aria-label={`Editar ${producto.nombre}`}
          title="Editar"
        >
          <Icono nombre="lapiz" className="size-4" />
        </Boton>
        <Boton
          variante="fantasma"
          tamano="sm"
          onClick={onDeBaja}
          disabled={!producto.activo}
          aria-label={`Dar de baja ${producto.nombre}`}
          title={producto.activo ? 'Dar de baja' : 'Ya está dado de baja'}
        >
          <Icono nombre="basura" className="size-4" />
        </Boton>
      </div>
    </div>
  )
}

/**
 * Confirmación de la baja.
 *
 * Es una baja lógica: el producto queda, sus movimientos siguen apuntando a él
 * y el historial no se rompe. Aun así se pide confirmación, porque desde el
 * listado un clic de más esconde un producto del escáner.
 */
function ConfirmarDeBaja({
  producto,
  onCancelar,
  onConfirmar
}: {
  producto: ProductoConStock
  onCancelar(): void
  onConfirmar(): void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
      <div
        className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold text-ink">¿Dar de baja este producto?</h3>
        <p className="mt-2 text-sm text-ink-muted">
          <strong className="font-medium text-ink">{producto.nombre}</strong> deja de aparecer en
          las búsquedas y el escáner ya no lo encuentra. No se borra nada: queda en el historial y
          se puede volver a mostrar con la casilla de arriba.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCancelar} autoFocus>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar}>
            <Icono nombre="basura" className="size-4" />
            Dar de baja
          </Boton>
        </div>
      </div>
    </div>
  )
}
