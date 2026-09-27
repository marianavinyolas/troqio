import type { DiagnosticoResult } from '@shared/ipc'
import { app, ipcMain } from 'electron'
import { getDb, getDbFileStats, getDbPath, getSqlite } from '../db'

function readPragmaString(key: string): string {
  const value = getSqlite().pragma(key, { simple: true })
  return typeof value === 'string' ? value : String(value ?? '')
}

function readForeignKeys(): boolean {
  return getSqlite().pragma('foreign_keys', { simple: true }) === 1
}

/**
 * Allowlist de IPC. Cada handler es un comando explicito con argumentos
 * validados. No existe un `query(sql)` generico: esa seria una superficie
 * de inyeccion innecesaria incluso en una app local.
 */
export function registerIpc(): void {
  ipcMain.handle('diagnostico', (): DiagnosticoResult => {
    // Fuerza la apertura de la conexion para que este comando sea una
    // verdadera prueba de humo del modulo nativo.
    const sqliteVersion = readPragmaString('sqlite_version')
    const dbPath = getDbPath()
    getDb()
    const stats = getDbFileStats()

    return {
      // app.getVersion() lee package.json en desarrollo y la version
      // incrustada por electron-builder en el instalador.
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      sqliteVersion,
      journalMode: readPragmaString('journal_mode'),
      foreignKeys: readForeignKeys(),
      dbPath,
      dbExists: stats.exists,
      dbSizeBytes: stats.sizeBytes
    }
  })
}
