import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    // Keep native/3rd-party deps (better-sqlite3, drizzle) out of the bundle.
    // Bundling a .node binary breaks it.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      minify: 'esbuild',
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      minify: 'esbuild',
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      // ⭐ electron-vite 5 + Vite 7 no minifica el renderer por defecto.
      // Sin esto el bundle ronda los 645 kB en vez de ~180 kB.
      minify: 'esbuild',
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
