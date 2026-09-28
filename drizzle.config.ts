import { defineConfig } from 'drizzle-kit'

/**
 * Configuracion de drizzle-kit.
 *
 * Solo se usa para GENERAR migraciones (`pnpm db:generate`). La app en
 * runtime no lee este archivo: aplica los .sql de `out` con el migrator de
 * drizzle, ver src/main/db/migrar.ts.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Solo lo necesita `drizzle-kit studio`, que no se usa en el proyecto.
    // La app abre la base en userData, en otra ruta.
    url: 'file:./troqio-local.db'
  },
  strict: true,
  verbose: true
})
