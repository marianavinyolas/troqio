import { Insignia } from '@renderer/componentes/ui/Insignia'
import { Tarjeta } from '@renderer/componentes/ui/Tarjeta'
import type { EstadoDiagnostico } from '@renderer/ganchos/useDiagnostico'
import type { DiagnosticoResult } from '@shared/ipc'

interface Props {
  estado: EstadoDiagnostico
  datos: DiagnosticoResult | null
  error: string | null
}

/**
 * Prueba de humo de todo el stack, visible desde la UI.
 *
 * Antes era el App.tsx entero del hito 0. Sigue siendo util: si el IPC o
 * better-sqlite3 se rompen, esta pantalla es lo primero que hay que mirar y
 * no hace falta abrir una terminal.
 */
export function Diagnostico({ estado, datos, error }: Props) {
  if (estado === 'cargando') {
    return (
      <Tarjeta>
        <p className="text-sm text-ink-muted">Verificando el entorno...</p>
      </Tarjeta>
    )
  }

  if (estado === 'error' || !datos) {
    return (
      <Tarjeta className="border-danger/30 bg-danger/5">
        <p className="mb-1 text-sm font-medium text-danger">
          Falló la comunicación con el proceso main
        </p>
        <p className="font-mono text-xs break-all text-ink-muted">{error}</p>
      </Tarjeta>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <Insignia tono="ok">
          <span className="size-1.5 rounded-full bg-ok" />
          Todo operativo
        </Insignia>
        <p className="text-sm text-ink-muted">
          Electron, IPC, better-sqlite3 y Drizzle funcionando.
        </p>
      </div>

      <Tarjeta titulo="Versiones" descripcion="Runtime de la app y de sus dependencias">
        <Fila etiqueta="Troqio" valor={datos.appVersion} />
        <Fila etiqueta="Electron" valor={datos.electronVersion} />
        <Fila etiqueta="Chromium" valor={datos.chromeVersion} />
        <Fila etiqueta="Node" valor={datos.nodeVersion} />
        <Fila etiqueta="SQLite" valor={datos.sqliteVersion} />
      </Tarjeta>

      <Tarjeta titulo="Base de datos" descripcion="Ubicación y estado del archivo local">
        <Fila etiqueta="Archivo" valor={datos.dbPath} />
        <Fila
          etiqueta="En disco"
          valor={datos.dbExists ? `${datos.dbSizeBytes} bytes` : 'todavía no se creó'}
        />
        <Fila
          etiqueta="journal_mode"
          valor={datos.journalMode}
          nota="WAL: deja leer mientras se escribe. Al respaldar hay que copiar también el -wal."
        />
        <Fila
          etiqueta="foreign_keys"
          valor={datos.foreignKeys ? 'ON' : 'OFF'}
          nota={
            datos.foreignKeys
              ? undefined
              : 'Debería estar ON. Si marca OFF, la integridad referencial no se está aplicando.'
          }
        />
      </Tarjeta>
    </div>
  )
}

function Fila({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-line px-5 py-3 last:border-b-0">
      <span className="text-sm text-ink-muted">{etiqueta}</span>
      <div className="min-w-0">
        <span className="font-mono text-sm break-all text-ink" title={valor}>
          {valor}
        </span>
        {nota && <p className="mt-0.5 text-xs text-ink-subtle">{nota}</p>}
      </div>
    </div>
  )
}
