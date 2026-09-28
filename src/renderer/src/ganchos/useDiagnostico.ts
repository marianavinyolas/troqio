import type { DiagnosticoResult } from '@shared/ipc'
import { useEffect, useState } from 'react'

export type EstadoDiagnostico = 'cargando' | 'listo' | 'error'

export interface ResultadoDiagnostico {
  estado: EstadoDiagnostico
  datos: DiagnosticoResult | null
  error: string | null
}

/**
 * Carga el informe de arranque.
 *
 * Vive aca y no dentro de la pantalla para que el shell pueda usar la version
 * en el riel de navegacion sin disparar una segunda llamada IPC.
 */
export function useDiagnostico(): ResultadoDiagnostico {
  const [estado, setEstado] = useState<EstadoDiagnostico>('cargando')
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

  return { estado, datos, error }
}
