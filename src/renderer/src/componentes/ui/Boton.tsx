import { cx } from '@renderer/cx'
import type { ButtonHTMLAttributes } from 'react'

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro'
export type TamanoBoton = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  tamano?: TamanoBoton
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong',
  secundario: 'border border-line-strong bg-surface text-ink hover:bg-raised',
  fantasma: 'text-ink-muted hover:bg-raised hover:text-ink',
  peligro: 'border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10'
}

const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm'
}

/**
 * `type` por defecto "button": un boton de la UI casi nunca debe enviar un
 * formulario, y olvidarlo es la causa clasica de un submit inesperado.
 */
export function Boton({
  variante = 'secundario',
  tamano = 'md',
  type = 'button',
  className,
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-brand/40 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variante],
        TAMANOS[tamano],
        className
      )}
      {...resto}
    />
  )
}
