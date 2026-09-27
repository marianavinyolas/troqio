import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // better-sqlite3 es nativo: correr en forks evita problemas de hilos.
    pool: 'forks'
  }
})
