import { cx } from '@renderer/cx'
import type { ReactNode } from 'react'

interface Props {
  titulo?: string
  descripcion?: string
  acciones?: ReactNode
  className?: string
  children: ReactNode
}

/** Contenedor base de la app: borde sutil, esquinas redondeadas, sombra minima. */
export function Tarjeta({ titulo, descripcion, acciones, className, children }: Props) {
  const conEncabezado = Boolean(titulo || descripcion || acciones)

  return (
    <section
      className={cx(
        'min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card',
        className
      )}
    >
      {conEncabezado && (
        <header className="flex items-center gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {titulo && <h2 className="truncate text-sm font-semibold text-ink">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 truncate text-xs text-ink-muted">{descripcion}</p>}
          </div>
          {acciones && <div className="ml-auto flex shrink-0 items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
