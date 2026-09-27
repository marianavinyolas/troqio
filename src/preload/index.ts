import type { DiagnosticoResult } from '@shared/ipc'
import { contextBridge, ipcRenderer } from 'electron'

/**
 * Superficie minima expuesta al renderer.
 *
 * Solo funciones tipadas y sin argumentos crudos. El renderer no puede
 * ejecutar SQL ni tocar el sistema de archivos.
 */
const troqio = {
  diagnostico: (): Promise<DiagnosticoResult> => ipcRenderer.invoke('diagnostico')
}

export type TroqioApi = typeof troqio

contextBridge.exposeInMainWorld('troqio', troqio)
