import { Icono } from '@renderer/componentes/Icono'
import { cx } from '@renderer/cx'
import type { NombreIcono } from '@renderer/iconos'
import type { ReactNode } from 'react'

interface Props {
  icono: NombreIcono
  titulo: string
  descripcion?: string
  accion?: ReactNode
  className?: string
}

/** Estado vacio: "todavia no hay nada aca". */
export function Vacio({ icono, titulo, descripcion, accion, className }: Props) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface/60 px-6 py-12 text-center',
        className
      )}
    >
      <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-raised text-ink-subtle">
        <Icono nombre={icono} className="size-5.5" />
      </span>
      <p className="text-sm font-medium text-ink">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-ink-muted">{descripcion}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  )
}
