import type { DiagnosticoResult } from '@shared/ipc'
import { useEffect, useState } from 'react'

type Estado = 'cargando' | 'listo' | 'error'

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-4 border-b border-line px-5 py-3 last:border-b-0">
      <span className="text-sm text-ink-muted">{etiqueta}</span>
      <span className="truncate font-mono text-sm text-ink" title={valor}>
        {valor}
      </span>
    </div>
  )
}

export default function App() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [datos, setDatos] = useState<DiagnosticoResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    window.troqio
      .diagnostico()
      .then(r => {
        if (!vigente) return
        setDatos(r)
        setEstado('listo')
      })
      .catch((e: unknown) => {
        if (!vigente) return
        setError(e instanceof Error ? e.message : String(e))
        setEstado('error')
      })

    return () => {
      vigente = false
    }
  }, [])

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Troqio</h1>
        <p className="text-sm text-ink-muted">
          Inventario de troqueles &middot; hito 0 &middot; verificacion de entorno
        </p>
      </header>

      {estado === 'cargando' && (
        <div className="rounded-card border border-line bg-surface p-6 text-sm text-ink-muted">
          Verificando el entorno...
        </div>
      )}

      {estado === 'error' && (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-6">
          <p className="mb-1 text-sm font-medium text-danger">
            Fallo la comunicacion con el proceso main
          </p>
          <p className="font-mono text-xs text-ink-muted">{error}</p>
        </div>
      )}

      {estado === 'listo' && datos && (
        <>
          <div className="flex items-center gap-2 rounded-card border border-ok/25 bg-ok/5 px-5 py-3">
            <span className="inline-block size-2 rounded-full bg-ok" />
            <span className="text-sm font-medium">
              Electron, IPC, better-sqlite3 y Drizzle funcionando
            </span>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <Fila etiqueta="Electron" valor={datos.electronVersion} />
            <Fila etiqueta="Chromium" valor={datos.chromeVersion} />
            <Fila etiqueta="Node" valor={datos.nodeVersion} />
            <Fila etiqueta="SQLite" valor={datos.sqliteVersion} />
            <Fila etiqueta="journal_mode" valor={datos.journalMode} />
            <Fila
              etiqueta="foreign_keys"
              valor={datos.foreignKeys ? 'ON' : 'OFF (⚠ deberia estar ON)'}
            />
            <Fila etiqueta="Base de datos" valor={datos.dbPath} />
            <Fila
              etiqueta="Archivo"
              valor={`${datos.dbExists ? 'existe' : 'se creara'} · ${datos.dbSizeBytes} bytes`}
            />
          </div>
        </>
      )}
    </main>
  )
}
