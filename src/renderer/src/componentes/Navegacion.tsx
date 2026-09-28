import { Icono } from '@renderer/componentes/Icono'
import { cx } from '@renderer/cx'
import { type IdRuta, RUTAS } from '@renderer/rutas'

interface Props {
  activa: IdRuta
  onNavegar: (id: IdRuta) => void
  version: string
}

/**
 * Riel de navegacion lateral.
 *
 * Se contrae a solo iconos por debajo de 1024 px. La ventana minima de la app
 * es de 900 px, asi que en una pantalla chica de farmacia el riel chico deja
 * todo el ancho para la tabla de stock, que es lo que importa.
 */
export function Navegacion({ activa, onNavegar, version }: Props) {
  return (
    <nav
      aria-label="Navegacion principal"
      className="flex w-18 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-4 select-none lg:w-60"
    >
      <Marca />

      {RUTAS.map(ruta => {
        const esActiva = ruta.id === activa

        return (
          <button
            key={ruta.id}
            type="button"
            onClick={() => onNavegar(ruta.id)}
            aria-current={esActiva ? 'page' : undefined}
            title={ruta.etiqueta}
            className={cx(
              'flex h-9.5 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
              'focus-visible:ring-brand/40 focus-visible:ring-2 focus-visible:outline-none',
              'justify-center lg:justify-start',
              esActiva
                ? 'bg-brand-soft text-brand'
                : ruta.disponible
                  ? 'text-ink-muted hover:bg-raised hover:text-ink'
                  : 'text-ink-subtle hover:bg-raised hover:text-ink-muted'
            )}
          >
            <Icono nombre={ruta.icono} className="size-5 shrink-0" />
            <span className="hidden truncate lg:inline">{ruta.etiqueta}</span>
            {!ruta.disponible && (
              <span className="ml-auto hidden text-[0.625rem] tabular-nums text-ink-subtle lg:inline">
                {ruta.hito}
              </span>
            )}
          </button>
        )
      })}

      <p className="mt-auto hidden px-3 text-xs tabular-nums text-ink-subtle lg:block">
        v{version}
      </p>
    </nav>
  )
}

function Marca() {
  return (
    <div className="mb-4">
      {/* Visible solo con el riel contraido, donde no hay espacio para el texto. */}
      <div className="flex justify-center lg:hidden">
        <span className="flex size-9 items-center justify-center rounded-card bg-brand text-on-brand">
          <Icono nombre="codigo-barras" className="size-5" />
        </span>
      </div>

      <div className="hidden items-center gap-2.5 px-2 lg:flex">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-brand text-on-brand">
          <Icono nombre="codigo-barras" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink">Troqio</p>
          <p className="truncate text-xs text-ink-subtle">Inventario de troqueles</p>
        </div>
      </div>
    </div>
  )
}
