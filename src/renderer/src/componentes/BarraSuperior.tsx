import type { ReactNode } from 'react'

interface Props {
  titulo: string
  descripcion?: string
  acciones?: ReactNode
}

/** Cabecera de la pantalla: que estas viendo y que podes hacer con esto. */
export function BarraSuperior({ titulo, descripcion, acciones }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-6 border-b border-line bg-surface px-8 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{titulo}</h1>
        {descripcion && <p className="mt-0.5 truncate text-sm text-ink-muted">{descripcion}</p>}
      </div>

      {acciones && <div className="ml-auto flex shrink-0 items-center gap-2">{acciones}</div>}
    </header>
  )
}
