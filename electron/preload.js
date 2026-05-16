const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  readFile: (fp) => ipcRenderer.invoke('read-file', fp),
  savePDF: (bytes, suggestedName) => ipcRenderer.invoke('save-pdf', bytes, suggestedName),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  saveRecentFile: (file) => ipcRenderer.invoke('save-recent-file', file),
  removeRecentFile: (fp) => ipcRenderer.invoke('remove-recent-file', fp),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  setApiKeys: (keys) => ipcRenderer.invoke('set-api-keys', keys),
  getApiModels: () => ipcRenderer.invoke('get-api-models'),
  setApiModels: (models) => ipcRenderer.invoke('set-api-models', models),
  recognizeSpeech: (options) => ipcRenderer.invoke('recognize-speech', options),
  stopSpeechRecognition: () => ipcRenderer.invoke('stop-speech-recognition'),
  onOpenFile: (cb) => {
    const handler = (_, fp) => cb(fp)
    ipcRenderer.on('open-file', handler)
    return () => ipcRenderer.removeListener('open-file', handler)
  },
  onAppCommand: (cb) => {
    const handler = (_, command) => cb(command)
    ipcRenderer.on('app-command', handler)
    return () => ipcRenderer.removeListener('app-command', handler)
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close')
})