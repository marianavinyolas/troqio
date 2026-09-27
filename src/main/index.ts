import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { closeDb, getDb, getDbFileStats, getDbPath, getSqlite } from './db'
import { registerIpc } from './ipc'

const isDev = !app.isPackaged
const isSmokeTest = process.argv.includes('--smoke-test')

/** Ventana principal, para poder enfocarla si se relanza la app. */
let ventanaPrincipal: BrowserWindow | null = null

/**
 * CSP de la app empaquetada.
 *
 * Se aplica por cabecera desde el proceso main y NO como <meta> en el HTML:
 * en desarrollo Vite inyecta scripts inline para el HMR, que una
 * `script-src 'self'` bloquearia. Asi el devserver funciona y el instalador
 * igual queda cerrado.
 *
 * 'unsafe-inline' solo en estilos: React usa estilos inline.
 */
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

function applyContentSecurityPolicy(): void {
  if (isDev) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_PROD]
      }
    })
  })
}

/**
 * `--smoke-test`: abre la base, ejecuta una consulta real, imprime el
 * resultado como JSON y termina. Sin ventana.
 *
 * Existe para que CI (o un humano) puedan verificar que el modulo nativo
 * funciona en la maquina destino sin depender de la interfaz.
 */
function runSmokeTest(): void {
  const row = getSqlite().prepare('select sqlite_version() as version').get() as {
    version: string
  }
  getDb()
  const stats = getDbFileStats()
  const journalMode = getSqlite().pragma('journal_mode', { simple: true })

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      sqliteVersion: row.version,
      journalMode,
      dbPath: getDbPath(),
      dbExists: stats.exists,
      electron: process.versions.electron
    })}\n`
  )
  closeDb()
  app.exit(0)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8fafc',
    title: 'Troqio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // ⭐ El preload no tiene acceso a Node. Toda la base de datos vive
      // en el proceso main y se accede solo por IPC.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // No permitir que el renderer navegue a sitios externos ni abra ventanas.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const isDevServer =
      process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)
    if (!isDevServer) event.preventDefault()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    if (ventanaPrincipal === win) ventanaPrincipal = null
  })

  ventanaPrincipal = win
  return win
}

/**
 * Una sola instancia.
 *
 * Doble clic en el acceso directo no debe abrir dos procesos escribiendo
 * sobre la misma base. La segunda instancia solo trae la ventana al frente.
 * El smoke test queda exceptuado: se usa en CI mientras no hay app abierta.
 */
if (!isSmokeTest && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = ventanaPrincipal
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    // En Windows agrupa la app correctamente en la barra de tareas.
    app.setAppUserModelId('ar.troqio.app')

    if (isSmokeTest) {
      runSmokeTest()
      return
    }

    registerIpc()
    applyContentSecurityPolicy()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})
