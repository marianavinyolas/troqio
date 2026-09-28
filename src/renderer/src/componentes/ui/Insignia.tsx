import { cx } from '@renderer/cx'
import type { ReactNode } from 'react'

export type TonoInsignia = 'neutro' | 'marca' | 'ok' | 'aviso' | 'peligro'

interface Props {
  tono?: TonoInsignia
  className?: string
  children: ReactNode
}

const TONOS: Record<TonoInsignia, string> = {
  neutro: 'border-line-strong bg-raised text-ink-muted',
  marca: 'border-brand/25 bg-brand-soft text-brand',
  ok: 'border-ok/25 bg-ok/8 text-ok',
  aviso: 'border-warn/25 bg-warn/10 text-warn',
  peligro: 'border-danger/25 bg-danger/8 text-danger'
}

/** Etiqueta compacta para estados: "M5", "Sin stock", "Activo". */
export function Insignia({ tono = 'neutro', className, children }: Props) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONOS[tono],
        className
      )}
    >
      {children}
    </span>
  )
}
