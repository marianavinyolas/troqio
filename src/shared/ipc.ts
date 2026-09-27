import { z } from 'zod'

/**
 * Contrato IPC compartido entre el proceso main y el renderer.
 *
 * IMPORTANTE: el renderer NUNCA es de confianza. Cada `ipcMain.handle`
 * revalida sus argumentos con estos schemas antes de tocar la base de datos.
 */

/** Diagnostico de arranque: prueba de humo de todo el stack (M0). */
export const DiagnosticoResultSchema = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  sqliteVersion: z.string(),
  journalMode: z.string(),
  foreignKeys: z.boolean(),
  dbPath: z.string(),
  dbExists: z.boolean(),
  dbSizeBytes: z.number()
})

export type DiagnosticoResult = z.infer<typeof DiagnosticoResultSchema>
