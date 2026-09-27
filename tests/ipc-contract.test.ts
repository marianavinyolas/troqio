import { describe, expect, it } from 'vitest'
import { DiagnosticoResultSchema } from '../src/shared/ipc'

describe('DiagnosticoResultSchema', () => {
  const valido = {
    appVersion: '0.1.0',
    electronVersion: '44.4.5',
    chromeVersion: '140.0.0.0',
    nodeVersion: '24.21.0',
    sqliteVersion: '3.53.4',
    journalMode: 'wal',
    foreignKeys: true,
    dbPath: 'C:\\Users\\farmacia\\AppData\\Roaming\\troqio\\troqio.db',
    dbExists: true,
    dbSizeBytes: 4096
  }

  it('acepta una respuesta completa', () => {
    expect(DiagnosticoResultSchema.safeParse(valido).success).toBe(true)
  })

  it('rechaza una respuesta incompleta', () => {
    const { sqliteVersion: _omitido, ...incompleto } = valido
    expect(DiagnosticoResultSchema.safeParse(incompleto).success).toBe(false)
  })

  it('rechaza tipos incorrectos', () => {
    expect(DiagnosticoResultSchema.safeParse({ ...valido, dbSizeBytes: 'muchos' }).success).toBe(
      false
    )
    expect(DiagnosticoResultSchema.safeParse({ ...valido, foreignKeys: 'sí' }).success).toBe(false)
  })
})
