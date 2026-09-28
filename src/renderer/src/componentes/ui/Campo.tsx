import { Icono } from '@renderer/componentes/Icono'
import { cx } from '@renderer/cx'
import type { NombreIcono } from '@renderer/iconos'
import { type InputHTMLAttributes, type ReactNode, useId } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  ayuda?: string
  error?: string
  /** Icono a la izquierda, dentro del control (lupa, codigo de barras, etc.). */
  icono?: NombreIcono
  /** Oculta la etiqueta visualmente pero la mantiene para lectores de pantalla. */
  etiquetaOculta?: boolean
  accion?: ReactNode
}

/**
 * Campo de formulario con etiqueta, ayuda y error ya resueltos.
 *
 * El `id` lo genera React, asi que el_label_ siempre queda asociado al input
 * sin que haya que acordarse de pasarlo.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  icono,
  etiquetaOculta = false,
  accion,
  className,
  ...resto
}: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  // ReactNode tambien puede ser 0 o '', asi que no sirve como condicion directa
  // en un `cond && 'clase'`.
  const hayAccion = Boolean(accion)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cx('text-xs font-medium text-ink-muted', etiquetaOculta && 'sr-only')}
      >
        {etiqueta}
      </label>

      <div className="relative flex items-center">
        {icono && (
          <Icono
            nombre={icono}
            className={cx(
              'pointer-events-none absolute left-3 size-4.5',
              error ? 'text-danger' : 'text-ink-subtle'
            )}
          />
        )}

        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(error && idError, !error && ayuda && idAyuda) || undefined}
          className={cx(
            'h-10 w-full min-w-0 rounded-control border bg-surface text-sm text-ink placeholder:text-ink-subtle',
            'focus-visible:ring-brand/40 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
            icono && 'pl-10',
            hayAccion ? 'pr-10' : 'pr-3',
            error
              ? 'border-danger/50 focus-visible:ring-danger/30'
              : 'border-line-strong focus-visible:border-brand/50',
            className
          )}
          {...resto}
        />

        {accion && (
          <div className="absolute inset-y-0 right-1 flex items-center pr-1">{accion}</div>
        )}
      </div>

      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-ink-subtle">
          {ayuda}
        </p>
      )}

      {error && (
        <p id={idError} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
