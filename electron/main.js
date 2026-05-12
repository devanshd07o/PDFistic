const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV === 'development'
let mainWindow
let pendingFilePath = getPdfPathFromArgv(process.argv)
let storePromise
let speechProcess = null

app.setName('PDFistic')
app.setAppUserModelId('com.pdfistic.app')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function getPdfPathFromArgv(argv) {
  return argv.find(arg => {
    if (typeof arg !== 'string') return false
    return arg.toLowerCase().endsWith('.pdf') && fs.existsSync(arg)
  })
}

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../public/icon.ico')
}

function getShortcutTarget() {
  return app.isPackaged ? app.getPath('exe') : process.execPath
}

function getShortcutArgs() {
  return app.isPackaged ? '' : `"${app.getAppPath()}"`
}

async function getStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => new Store({
      name: 'pdfistic-state',
      defaults: {
        recentFiles: [],
        apiKeys: {
          gemini: '',
          groq: '',
          openrouter: '',
          cerebras: '',
          mistral: ''
        },
        apiModels: {
          gemini: 'gemini-3.1-flash-lite',
          groq: 'llama-3.3-70b-versatile',
          openrouter: 'inclusionai/ring-2.6-1t:free',
          cerebras: 'qwen-3-235b-a22b-instruct',
          mistral: 'mistralai/mistral-small'
        }
      }
    }))
  }
  return storePromise
}

function normalizeRecentFile(input = {}) {
  if (!input.path || typeof input.path !== 'string') return null
  const filePath = input.path
  if (!filePath.toLowerCase().endsWith('.pdf')) return null
  if (!fs.existsSync(filePath)) return null
  return {
    path: filePath,
    name: input.name || path.basename(filePath),
    lastOpened: Number(input.lastOpened) || Date.now(),
    lastPage: Math.max(1, Number(input.lastPage) || 1),
    pageCount: Math.max(0, Number(input.pageCount) || 0)
  }
}

async function getRecentFiles() {
  const store = await getStore()
  const recentFiles = Array.isArray(store.get('recentFiles')) ? store.get('recentFiles') : []
  const pruned = recentFiles
    .filter(item => item?.path && fs.existsSync(item.path))
    .map(item => ({
      path: item.path,
      name: item.name || path.basename(item.path),
      lastOpened: Number(item.lastOpened) || 0,
      lastPage: Math.max(1, Number(item.lastPage) || 1),
      pageCount: Math.max(0, Number(item.pageCount) || 0)
    }))
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, 10)
  if (pruned.length !== recentFiles.length) store.set('recentFiles', pruned)
  return pruned
}

async function upsertRecentFile(input = {}) {
  const nextFile = normalizeRecentFile(input)
  if (!nextFile) return getRecentFiles()

  const store = await getStore()
  const recentFiles = await getRecentFiles()
  const existing = recentFiles.find(item => item.path === nextFile.path)
  const merged = {
    ...existing,
    ...nextFile,
    lastOpened: input.lastOpened ? nextFile.lastOpened : (existing?.lastOpened || nextFile.lastOpened)
  }
  const next = [merged, ...recentFiles.filter(item => item.path !== nextFile.path)]
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, 10)
  store.set('recentFiles', next)
  return next
}

async function removeRecentFile(filePath) {
  const store = await getStore()
  const recentFiles = Array.isArray(store.get('recentFiles')) ? store.get('recentFiles') : []
  const next = recentFiles.filter(item => item?.path !== filePath)
  store.set('recentFiles', next)
  return next
}

function normalizeApiKeys(keys = {}) {
  return {
    gemini: typeof keys.gemini === 'string' ? keys.gemini : '',
    groq: typeof keys.groq === 'string' ? keys.groq : '',
    openrouter: typeof keys.openrouter === 'string' ? keys.openrouter : '',
    cerebras: typeof keys.cerebras === 'string' ? keys.cerebras : '',
    mistral: typeof keys.mistral === 'string' ? keys.mistral : ''
  }
}

function normalizeApiModels(models = {}) {
  return {
    gemini: typeof models.gemini === 'string' && models.gemini ? models.gemini : 'gemini-3.1-flash-lite',
    groq: typeof models.groq === 'string' && models.groq ? models.groq : 'llama-3.3-70b-versatile',
    openrouter: typeof models.openrouter === 'string' && models.openrouter ? models.openrouter : 'inclusionai/ring-2.6-1t:free',
    cerebras: typeof models.cerebras === 'string' && models.cerebras ? models.cerebras : 'qwen-3-235b-a22b-instruct',
    mistral: typeof models.mistral === 'string' && models.mistral ? models.mistral : 'mistralai/mistral-small'
  }
}

function sendFileToRenderer(filePath) {
  if (!filePath) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingFilePath = filePath
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  mainWindow.webContents.send('open-file', filePath)
}

function sendAppCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-command', command)
  }
}

function getSpeechScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'google_stt.py')
    : path.join(__dirname, '../python/google_stt.py')
}

function getPythonCandidates() {
  return [
    process.env.PDFISTIC_PYTHON ? { command: process.env.PDFISTIC_PYTHON, args: [] } : null,
    { command: 'python', args: [] },
    process.platform === 'win32' ? { command: 'py', args: ['-3.11'] } : null,
    process.platform === 'win32' ? { command: 'py', args: [] } : null,
    { command: 'python3', args: [] }
  ].filter(Boolean)
}

function runSpeechPython(candidate, scriptPath, options) {
  const pauseMs = Math.min(Math.max(Number(options.pauseMs) || 2000, 500), 5000)
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (payload) => {
      if (settled) return
      settled = true
      speechProcess = null
      resolve(payload)
    }

    const args = [
      ...candidate.args,
      scriptPath,
      '--pause-ms',
      String(pauseMs),
      '--language',
      options.language || 'en-IN',
      '--fallback-language',
      options.fallbackLanguage || 'hi-IN',
      '--timeout-seconds',
      String(options.timeoutSeconds || 8),
      '--phrase-time-limit',
      String(options.phraseTimeLimit || 30)
    ]
    const child = spawn(candidate.command, args, { windowsHide: true })

    speechProcess = child
    const timeout = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ ok: false, error: 'Speech recognition timed out.' })
    }, 80000)

    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', error => {
      clearTimeout(timeout)
      finish({ ok: false, spawnFailed: error.code === 'ENOENT', error: error.message })
    })
    child.on('close', () => {
      clearTimeout(timeout)
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
      const jsonLine = lines[lines.length - 1]
      if (!jsonLine) {
        finish({ ok: false, error: stderr.trim() || 'Speech recognition returned no result.' })
        return
      }
      try {
        finish(JSON.parse(jsonLine))
      } catch {
        finish({ ok: false, error: stderr.trim() || jsonLine })
      }
    })
  })
}

async function recognizeSpeech(options = {}) {
  if (speechProcess) {
    return { ok: false, error: 'Speech recognition is already running.' }
  }

  const scriptPath = getSpeechScriptPath()
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Speech script missing: ${scriptPath}` }
  }

  let lastError = ''
  for (const candidate of getPythonCandidates()) {
    const result = await runSpeechPython(candidate, scriptPath, options)
    if (!result.spawnFailed) return result
    lastError = result.error
  }
  return { ok: false, error: lastError || 'Python was not found. Install Python and run python -m pip install -r python/requirements.txt.' }
}

function stopSpeechRecognition() {
  if (!speechProcess) return { ok: false }
  try { speechProcess.kill() } catch {}
  speechProcess = null
  return { ok: true }
}

function createAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open PDF', accelerator: 'CommandOrControl+O', click: () => sendAppCommand('open-file') },
        { label: 'Print', accelerator: 'CommandOrControl+P', click: () => sendAppCommand('print') },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CommandOrControl+B', click: () => sendAppCommand('toggle-sidebar') },
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: () => sendAppCommand('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => sendAppCommand('zoom-out') },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => sendAppCommand('reset-zoom') },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'PDFistic',
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#eff0f4',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      experimentalFeatures: true
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Allow microphone access for SpeechRecognition API
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === 'media')
    }
  )
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission) => permission === 'media'
  )

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    sendFileToRenderer(pendingFilePath)
    pendingFilePath = null
  })

  mainWindow.on('maximize', () => sendAppCommand('window-state-changed'))
  mainWindow.on('unmaximize', () => sendAppCommand('window-state-changed'))
}

app.on('second-instance', (_, argv) => {
  sendFileToRenderer(getPdfPathFromArgv(argv))
})

app.whenReady().then(() => {
  createAppMenu()
  createWindow()
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  sendFileToRenderer(filePath)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const data = fs.readFileSync(filePath)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  } catch { return null }
})

ipcMain.handle('get-recent-files', async () => getRecentFiles())

ipcMain.handle('save-recent-file', async (_, file) => upsertRecentFile(file))

ipcMain.handle('remove-recent-file', async (_, filePath) => removeRecentFile(filePath))

ipcMain.handle('get-api-keys', async () => {
  const store = await getStore()
  return normalizeApiKeys(store.get('apiKeys') || {})
})

ipcMain.handle('set-api-keys', async (_, keys) => {
  const store = await getStore()
  const normalized = normalizeApiKeys(keys)
  store.set('apiKeys', normalized)
  return normalized
})

ipcMain.handle('get-api-models', async () => {
  const store = await getStore()
  return normalizeApiModels(store.get('apiModels') || {})
})

ipcMain.handle('set-api-models', async (_, models) => {
  const store = await getStore()
  const normalized = normalizeApiModels(models)
  store.set('apiModels', normalized)
  return normalized
})

ipcMain.handle('recognize-speech', async (_, options) => recognizeSpeech(options))

ipcMain.handle('stop-speech-recognition', () => stopSpeechRecognition())

ipcMain.handle('save-pdf', async (_, bytes, suggestedName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName || 'document.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(result.filePath, Buffer.from(bytes))
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('create-desktop-shortcut', async () => {
  try {
    const desktopPath = path.join(app.getPath('desktop'), 'PDFistic.lnk')
    const target = getShortcutTarget()
    const shortcutCreated = shell.writeShortcutLink(desktopPath, {
      target,
      args: getShortcutArgs(),
      cwd: path.dirname(target),
      description: 'Open PDF files with PDFistic',
      icon: getIconPath(),
      iconIndex: 0,
      appUserModelId: 'com.pdfistic.app'
    })
    return { ok: shortcutCreated, path: desktopPath }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('is-maximized', () => Boolean(mainWindow?.isMaximized()))

ipcMain.on('win-minimize', () => mainWindow?.minimize())
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
ipcMain.on('win-close', () => mainWindow?.close())
