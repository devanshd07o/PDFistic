import { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import Titlebar from './components/Titlebar'
import Toolbar from './components/Toolbar'
import PDFViewer from './components/PDFViewer'
import Sidebar from './components/Sidebar'
import AIPanel from './components/AIPanel'
import KeyVault from './components/KeyVault'
import { PROVIDERS } from './utils/aiCall'
import { createWorker } from 'tesseract.js'
import { PREMIUM_FONTS } from './components/SettingsPanel'
import Onboarding from './components/Onboarding'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const stored = (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb } catch { return fb } }
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export default function App() {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(() => stored('pf-zoom', 1.2))
  const [theme, setTheme] = useState(() => stored('pf-theme', 'light'))
  const [sidebarOpen, setSidebarOpen] = useState(() => stored('pf-sidebar', true))
  const [outline, setOutline] = useState([])
  const [generatedOutline, setGeneratedOutline] = useState([])
  const [fileName, setFileName] = useState('')
  const [currentFile, setCurrentFile] = useState(null)
  const [recentFiles, setRecentFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState('')
  const [toolMode, setToolMode] = useState('select')
  const [highlightColor, setHighlightColor] = useState(() => stored('pf-hcolor', '#facc15'))
  const [penColor, setPenColor] = useState(() => stored('pf-pen-color', '#ef4444'))
  const [penSize, setPenSize] = useState(() => Math.min(4, Math.max(0.4, stored('pf-pen-size', 3))))
  const [highlights, setHighlights] = useState([])
  const [rotation, setRotation] = useState(0)
  const [fitMode, setFitMode] = useState('width')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchIndex, setSearchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [referCurrentPage, setReferCurrentPage] = useState(true)
  const [referPrevPage, setReferPrevPage] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => stored('pf-model', ''))
  const [apiModels, setApiModels] = useState({})
  const [apiKeys, setApiKeys] = useState({})
  const [configuredModels, setConfiguredModels] = useState([])
  const [keyVaultOpen, setKeyVaultOpen] = useState(false)
  const [pageTexts, setPageTexts] = useState({})
  const [aiPanelWidth, setAiPanelWidth] = useState(320)
  const [fontId, setFontId] = useState(() => stored('pf-fontid', 'system'))
  const [fontSize, setFontSize] = useState(() => stored('pf-fontsize', 13))
  const [showOnboarding, setShowOnboarding] = useState(() => !stored('pf-onboarded', false))
  const [ocrStatus, setOcrStatus] = useState('')
  const [pinnedFiles, setPinnedFiles] = useState(() => stored('pf-pinned', []))
  const [bboxHighlight, setBboxHighlight] = useState(null)
  const [navModalOpen, setNavModalOpen] = useState(false)
  const [navInput, setNavInput] = useState('')
  const navInputRef = useRef(null)
  const ocrWorkerRef = useRef(null)
  const getPageImageRef = useRef(null)
  const [selectedText, setSelectedText] = useState('')
  const chatFont = (PREMIUM_FONTS.find(f => f.id === fontId) || PREMIUM_FONTS[0]).value

  const applyApiKeys = useCallback((keys = {}) => {
    setApiKeys(keys)
    const configured = PROVIDERS.filter(provider => keys?.[provider.id]?.trim())
    setConfiguredModels(configured)
    setSelectedModel(model => {
      const saved = stored('pf-model', '')
      const preferred = saved || model
      return configured.some(p => p.id === preferred) ? preferred : (configured[0]?.id || '')
    })
  }, [])

  const applyApiModels = useCallback((models = {}) => {
    setApiModels(models)
  }, [])

  const handleGoHome = useCallback(() => {
    setPdfDoc(null); setFileName(''); setCurrentFile(null)
    setTotalPages(0); setCurrentPage(1); setOutline([])
    setGeneratedOutline([]); setPageTexts({}); setHighlights([])
    setSearchQuery(''); setSearchResults([]); setSearchIndex(-1)
  }, [])

  const handleAddPinnedFile = useCallback((file) => {
    setPinnedFiles(prev => {
      const filtered = prev.filter(f => f.path !== file.path)
      const next = [file, ...filtered].slice(0, 8)
      persist('pf-pinned', next)
      return next
    })
  }, [])

  const handleRemovePinnedFile = useCallback((path) => {
    setPinnedFiles(prev => {
      const next = prev.filter(f => f.path !== path)
      persist('pf-pinned', next)
      return next
    })
  }, [])

  const handleRemoveRecentFile = useCallback(async (path) => {
    // Optimistic removal so the card disappears instantly
    setRecentFiles(prev => prev.filter(f => f.path !== path))
    if (!window.electronAPI?.removeRecentFile) return
    const files = await window.electronAPI.removeRecentFile(path)
    if (Array.isArray(files)) setRecentFiles(files)
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    if (!window.electronAPI?.getRecentFiles) return
    const files = await window.electronAPI.getRecentFiles()
    setRecentFiles(Array.isArray(files) ? files : [])
  }, [])

  // ── Central upsert: always moves a file to the top, no duplicates ───────────
  // Pure in-memory merge used for optimistic updates.
  const mergeToTop = (prev, entry) => {
    const next = prev.filter(f => f.path !== entry.path)
    return [entry, ...next].slice(0, 30)
  }

  // Persist one entry to the Electron store + keep UI in sync.
  // Returns the authoritative list from Electron (or the optimistic one).
  const persistRecent = useCallback(async (entry) => {
    // Optimistic: show the change immediately
    setRecentFiles(prev => mergeToTop(prev, entry))
    if (!window.electronAPI?.saveRecentFile) return
    const files = await window.electronAPI.saveRecentFile(entry)
    if (Array.isArray(files)) setRecentFiles(files)
  }, [])

  // Persist multiple entries sequentially (avoids concurrent-write races in the
  // Electron store).  The first file in `entries` ends up at the very top.
  const persistRecentBatch = useCallback(async (entries) => {
    if (!entries?.length) return
    // Optimistic: merge all entries at once so the UI reflects the full batch
    setRecentFiles(prev => {
      let next = [...prev]
      // Reverse so the first entry lands on top after the loop
      for (const entry of [...entries].reverse()) {
        next = mergeToTop(next, entry)
      }
      return next
    })
    if (!window.electronAPI?.saveRecentFile) return
    // Sequential writes — each call returns the up-to-date list from the store
    let files
    for (const entry of entries) {
      files = await window.electronAPI.saveRecentFile(entry)
    }
    if (Array.isArray(files)) setRecentFiles(files)
  }, [])

  // Debounced progress tracker (page position, page count).
  // Uses `persistRecent` so it also deduplicates and moves to top.
  const saveRecentProgress = useCallback(async (file, page = currentPage, pageCount = totalPages, markOpened = false) => {
    if (!file?.path) return
    await persistRecent({
      path: file.path,
      name: file.name,
      lastPage: Math.max(1, Number(page) || 1),
      pageCount: Math.max(0, Number(pageCount) || 0),
      ...(markOpened ? { lastOpened: Date.now() } : {})
    })
  }, [currentPage, totalPages, persistRecent])

  const loadPDF = useCallback(async (source, name = '', options = {}) => {
    try {
      let data
      let fileInfo = null
      if (typeof source === 'string' && window.electronAPI) {
        const buf = await window.electronAPI.readFile(source)
        if (!buf) {
          if (window.electronAPI?.removeRecentFile) {
            const files = await window.electronAPI.removeRecentFile(source)
            setRecentFiles(Array.isArray(files) ? files : [])
          }
          return
        }
        data = new Uint8Array(buf)
        const nameFromPath = source.split(/[\\/]/).pop()
        setFileName(nameFromPath)
        fileInfo = { path: source, name: nameFromPath, data: data.slice() }
        setCurrentFile(fileInfo)
      } else if (source instanceof ArrayBuffer) {
        data = new Uint8Array(source)
        setFileName(name)
        fileInfo = { path: null, name, data: data.slice() }
        setCurrentFile(fileInfo)
      } else return
      const doc = await pdfjsLib.getDocument({ data }).promise
      const resumePage = Math.min(Math.max(Number(options.resumePage) || 1, 1), doc.numPages)
      setPdfDoc(doc)
      setTotalPages(doc.numPages)
      setCurrentPage(resumePage)
      setHighlights([])
      setRotation(0)
      setFitMode('custom')
      setSearchQuery('')
      setSearchResults([])
      setSearchIndex(-1)
      const toc = await doc.getOutline()
      setOutline(toc || [])
      setGeneratedOutline(toc?.length ? [] : await buildGeneratedOutline(doc))
      extractPageTexts(doc)
      if (fileInfo?.path) {
        await saveRecentProgress(fileInfo, resumePage, doc.numPages, true)
      }
    } catch (err) { console.error(err) }
  }, [saveRecentProgress])

  // Must be after loadPDF (uses it as dep)
  const handleOpenAndPinFile = useCallback(async () => {
    if (!window.electronAPI) return
    const fp = await window.electronAPI.openFileDialog()
    if (!fp) return
    const name = fp.split(/[\\/]/).pop()
    handleAddPinnedFile({ path: fp, name, pageCount: 0 })
    loadPDF(fp)
  }, [loadPDF, handleAddPinnedFile])

  const buildGeneratedOutline = async (doc) => {
    const generated = []
    const maxPages = Math.min(doc.numPages, 80)
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await doc.getPage(pageNum)
        const content = await page.getTextContent()
        const candidates = content.items
          .filter(item => item.str?.trim().length >= 4)
          .map(item => ({
            title: item.str.trim().replace(/\s+/g, ' '),
            page: pageNum,
            size: Math.hypot(item.transform[2], item.transform[3]) || Math.abs(item.transform[3]) || 0
          }))
          .filter(item => item.size >= 11 && item.title.length <= 90 && !/^\d+$/.test(item.title))
          .slice(0, 3)
        generated.push(...candidates)
      } catch {}
    }
    return generated
      .sort((a, b) => b.size - a.size)
      .slice(0, 40)
      .sort((a, b) => a.page - b.page)
  }

  const getOcrWorker = async () => {
    if (!ocrWorkerRef.current) {
      const worker = await createWorker('eng')
      ocrWorkerRef.current = worker
    }
    return ocrWorkerRef.current
  }

  const extractPageTexts = async (doc) => {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      try {
        const page = await doc.getPage(pageNum)
        const content = await page.getTextContent()
        const extracted = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()

        if (extracted.length > 50) {
          setPageTexts(prev => ({ ...prev, [pageNum]: extracted }))
        } else {
          // Fallback: OCR via offscreen canvas
          setOcrStatus(`Scanning page ${pageNum} of ${doc.numPages}…`)
          const canvas = document.createElement('canvas')
          const vp = page.getViewport({ scale: 2 })
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
          const worker = await getOcrWorker()
          const { data: { text } } = await worker.recognize(canvas)
          setPageTexts(prev => ({ ...prev, [pageNum]: text.trim() }))
        }
      } catch {
        setPageTexts(prev => ({ ...prev, [pageNum]: '' }))
      }
    }
    setOcrStatus('')
  }

  const goToPage = useCallback((page) => {
    if (!totalPages) return
    const nextPage = Math.min(Math.max(Number(page) || 1, 1), totalPages)
    setCurrentPage(nextPage)
  }, [totalPages])

  const changeZoom = useCallback((nextZoom) => {
    setFitMode('custom')
    if (typeof nextZoom === 'function') {
      setZoom(z => Math.max(0.5, Math.min(4, nextZoom(z))))
      return
    }
    setZoom(Math.max(0.5, Math.min(4, Number(nextZoom) || 1)))
  }, [])

  const clearPageHighlights = useCallback(() => {
    setHighlights(items => items.filter(item => item.page !== currentPage))
  }, [currentPage])

  const runSearch = useCallback(async (query = searchQuery) => {
    const needle = query.trim().toLowerCase()
    setSearchQuery(query)
    if (!pdfDoc || !needle) {
      setSearchResults([])
      setSearchIndex(-1)
      return
    }

    setIsSearching(true)
    const matches = []
    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => item.str).join(' ').toLowerCase()
        const count = pageText.split(needle).length - 1
        if (count > 0) matches.push({ page: pageNum, count })
      }
      setSearchResults(matches)
      setSearchIndex(matches.length ? 0 : -1)
      if (matches.length) goToPage(matches[0].page)
    } finally {
      setIsSearching(false)
    }
  }, [pdfDoc, searchQuery, goToPage])

  const stepSearchResult = useCallback((direction) => {
    if (searchResults.length === 0) return
    const nextIndex = (searchIndex + direction + searchResults.length) % searchResults.length
    setSearchIndex(nextIndex)
    goToPage(searchResults[nextIndex].page)
  }, [searchResults, searchIndex, goToPage])

  useEffect(() => {
    if (!pdfDoc) return
    const timer = window.setTimeout(() => runSearch(searchQuery), 250)
    return () => window.clearTimeout(timer)
  }, [pdfDoc, searchQuery, runSearch])

  const exportAiChat = () => {
    if (!aiMessages.length) return
    const lines = aiMessages.map(m => {
      const role = m.role === 'ai' ? 'Assistant' : 'User'
      const time = new Date(m.timestamp).toLocaleString()
      return `[${role} · p.${m.page || 1} · ${time}]\n${m.text}`
    })
    const blob = new Blob([lines.join('\n\n---\n\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'chat-export.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  const clearAiChat = () => {
    if (aiMessages.some(m => m.streaming)) return
    setAiMessages([])
  }

  const handleDownload = async () => {
    if (!currentFile?.data?.length) return
    const suggestedName = currentFile.name || 'document.pdf'
    if (window.electronAPI?.savePDF) {
      await window.electronAPI.savePDF(currentFile.data, suggestedName)
      return
    }
    const blob = new Blob([currentFile.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = suggestedName
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenFile = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFileDialog({ multiple: true })
      if (!result) return
      const paths = Array.isArray(result) ? result.filter(Boolean) : [result].filter(Boolean)
      if (paths.length === 0) return

      if (paths.length === 1) {
        // Single file — open it directly (loadPDF → saveRecentProgress handles recents)
        loadPDF(paths[0])
      } else {
        // Multiple files — add all to recents, open none (user picks from home screen)
        const entries = paths.map(fp => ({
          path: fp,
          name: fp.split(/[\\/]/).pop(),
          lastPage: 1,
          pageCount: 0,
          lastOpened: Date.now()
        }))
        await persistRecentBatch(entries)
      }
    } else {
      // Web / non-Electron fallback
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.pdf,application/pdf'
      input.multiple = true
      input.onchange = async (ev) => {
        const files = Array.from(ev.target.files || [])
        if (!files.length) return
        // In the browser we can only read the first file (no persistent paths)
        const reader = new FileReader()
        reader.onload = (e) => loadPDF(e.target.result, files[0].name)
        reader.readAsArrayBuffer(files[0])
      }
      input.click()
    }
  }

  const handleOpenRecentFile = async (file) => {
    if (!file?.path) return
    await loadPDF(file.path, file.name, { resumePage: file.lastPage })
  }

  const createDesktopShortcut = async () => {
    if (!window.electronAPI?.createDesktopShortcut) return
    const result = await window.electronAPI.createDesktopShortcut()
    setShortcutStatus(result?.ok ? 'Desktop shortcut added' : 'Shortcut failed')
    window.setTimeout(() => setShortcutStatus(''), 2400)
  }

  const saveApiKeys = async (keys) => {
    let saved = keys
    if (window.electronAPI?.setApiKeys) {
      saved = await window.electronAPI.setApiKeys(keys)
    } else {
      persist('pf-api-keys', keys)
    }
    applyApiKeys(saved)
    setKeyVaultOpen(false)
  }

  const saveApiModels = async (models) => {
    let saved = models
    if (window.electronAPI?.setApiModels) {
      saved = await window.electronAPI.setApiModels(models)
    } else {
      persist('pf-api-models', models)
    }
    applyApiModels(saved)
    return saved
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)

    // Windows Explorer drops files with an empty MIME type — match by extension too
    const isPdf = f =>
      f.type === 'application/pdf' ||
      ((!f.type || f.type === 'application/octet-stream') &&
        f.name?.toLowerCase().endsWith('.pdf'))

    const files = Array.from(e.dataTransfer.files).filter(isPdf)
    if (files.length === 0) return

    if (files.length === 1) {
      const file = files[0]
      if (file.path && window.electronAPI) {
        // loadPDF calls saveRecentProgress which calls persistRecent → moves to top
        loadPDF(file.path, file.name)
      } else {
        const reader = new FileReader()
        reader.onload = (ev) => loadPDF(ev.target.result, file.name)
        reader.readAsArrayBuffer(file)
      }
    } else {
      // Multiple files — batch-add all to recents (dedup, move to top)
      const withPaths = files.filter(f => f.path)
      if (withPaths.length > 0 && window.electronAPI) {
        const entries = withPaths.map(file => ({
          path: file.path,
          name: file.name,
          lastPage: 1,
          pageCount: 0,
          lastOpened: Date.now()
        }))
        await persistRecentBatch(entries)
      } else {
        // No paths available (web context) — open the first file
        const reader = new FileReader()
        reader.onload = (ev) => loadPDF(ev.target.result, files[0].name)
        reader.readAsArrayBuffer(files[0])
      }
    }
  }

  useEffect(() => {
    return window.electronAPI?.onOpenFile((fp) => loadPDF(fp))
  }, [loadPDF])

  // Cleanup OCR worker on unmount
  useEffect(() => {
    return () => { ocrWorkerRef.current?.terminate() }
  }, [])

  useEffect(() => {
    refreshRecentFiles()
  }, [refreshRecentFiles])

  useEffect(() => {
    let mounted = true
    const loadKeys = async () => {
      try {
        const keys = window.electronAPI?.getApiKeys ? await window.electronAPI.getApiKeys() : stored('pf-api-keys', {})
        const models = window.electronAPI?.getApiModels ? await window.electronAPI.getApiModels() : stored('pf-api-models', {})
        if (mounted) {
          applyApiKeys(keys || {})
          applyApiModels(models || {})
        }
      } catch {}
    }
    loadKeys()
    return () => { mounted = false }
  }, [applyApiKeys, applyApiModels])

  useEffect(() => {
    if (!currentFile?.path || !pdfDoc) return
    const timer = window.setTimeout(() => {
      saveRecentProgress(currentFile, currentPage, totalPages, false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [currentFile, pdfDoc, currentPage, totalPages, saveRecentProgress])

  useEffect(() => {
    return window.electronAPI?.onAppCommand((command) => {
      if (command === 'open-file') handleOpenFile()
      if (command === 'print') window.print()
      if (command === 'toggle-sidebar') setSidebarOpen(s => !s)
      if (command === 'zoom-in') changeZoom(z => +(z + 0.25).toFixed(2))
      if (command === 'zoom-out') changeZoom(z => +(z - 0.25).toFixed(2))
      if (command === 'reset-zoom') changeZoom(1.0)
    })
  }, [pdfDoc, changeZoom])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const tag = e.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable
      if (mod && key === 'o') { e.preventDefault(); handleOpenFile(); return }
      if (mod && key === 'f') { e.preventDefault(); window.dispatchEvent(new Event('pdfistic-focus-search')); return }
      if (mod && key === 'b') { e.preventDefault(); setSidebarOpen(s => !s); return }
      if (mod && key === 'p') { e.preventDefault(); if (pdfDoc) window.print(); return }
      if (mod && key === 'k') { e.preventDefault(); if (pdfDoc) { setNavModalOpen(true); setNavInput('') } return }
      if (isTyping) return
      if (key === 'h') { e.preventDefault(); setToolMode(mode => mode === 'highlight' ? 'select' : 'highlight'); return }
      if (key === 'r') { e.preventDefault(); setRotation(r => (r + 90) % 360); return }
      if (key === 'f11') return
      if (!pdfDoc) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(currentPage + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(currentPage - 1)
      else if (e.key === 'Home') goToPage(1)
      else if (e.key === 'End') goToPage(totalPages)
      else if (mod && e.key === '=') { e.preventDefault(); changeZoom(z => +(z + 0.25).toFixed(2)) }
      else if (mod && e.key === '-') { e.preventDefault(); changeZoom(z => +(z - 0.25).toFixed(2)) }
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); changeZoom(1.0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdfDoc, totalPages, currentPage, goToPage, changeZoom])

  // Ctrl/Cmd + scroll → zoom only, never scroll
  // capture:true  — runs before any scroll container sees the event
  // RAF-batched   — accumulates rapid trackpad deltas into one frame
  // Math.pow      — proportional zoom (each 100 deltaY = ×0.9 or ×1.11)
  useEffect(() => {
    let rafId = null
    let pending = 0

    const flush = () => {
      const delta = pending
      pending = 0
      rafId = null
      const factor = Math.pow(0.9, delta / 100)
      setZoom(z => Math.max(0.5, Math.min(4, z * factor)))
      setFitMode('custom')
    }

    const onWheel = (e) => {
      if (!pdfDoc) return
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target
      if (!(target instanceof Element) || !target.closest('.pdf-scroll')) return
      e.preventDefault()
      e.stopPropagation()
      const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      pending += normalizedDelta
      if (!rafId) rafId = requestAnimationFrame(flush)
    }

    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true })
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [pdfDoc])

  // Persist UI preferences
  useEffect(() => { persist('pf-theme', theme) }, [theme])
  useEffect(() => { persist('pf-sidebar', sidebarOpen) }, [sidebarOpen])
  useEffect(() => { persist('pf-hcolor', highlightColor) }, [highlightColor])
  useEffect(() => { persist('pf-pen-color', penColor) }, [penColor])
  useEffect(() => { persist('pf-pen-size', penSize) }, [penSize])
  useEffect(() => { persist('pf-fontid', fontId) }, [fontId])
  useEffect(() => { persist('pf-fontsize', fontSize) }, [fontSize])
  useEffect(() => { if (selectedModel) persist('pf-model', selectedModel) }, [selectedModel])
  useEffect(() => { if (navModalOpen) setTimeout(() => navInputRef.current?.focus(), 30) }, [navModalOpen])

  return (
    <div
      className={`app ${theme}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
    >
      <Titlebar theme={theme} fileName={fileName} />
      <Toolbar
        currentPage={currentPage} totalPages={totalPages}
        zoom={zoom} setZoom={changeZoom}
        theme={theme} setTheme={setTheme}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        onGoHome={handleGoHome}
        onOpenFile={handleOpenFile} onPageChange={goToPage}
        toolMode={toolMode} setToolMode={setToolMode}
        highlightColor={highlightColor} setHighlightColor={setHighlightColor}
        penColor={penColor} setPenColor={setPenColor}
        penSize={penSize} setPenSize={setPenSize}
        onClearHighlights={clearPageHighlights}
        highlightsOnPage={highlights.filter(item => item.page === currentPage).length}
        rotation={rotation} setRotation={setRotation}
        fitMode={fitMode} setFitMode={setFitMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        searchIndex={searchIndex}
        isSearching={isSearching}
        onRunSearch={runSearch}
        onStepSearchResult={stepSearchResult}
        onDownload={handleDownload}
        onOpenKeyVault={() => setKeyVaultOpen(true)}
        pdfDoc={pdfDoc}
        fontId={fontId} setFontId={setFontId}
        fontSize={fontSize} setFontSize={setFontSize}
        aiMessages={aiMessages}
        onExportChat={exportAiChat}
        onClearChat={clearAiChat}
        aiIsLoading={aiMessages.some(m => m.streaming)}
      />
      <div className="main-area">
        <Sidebar
          open={sidebarOpen} outline={outline}
          generatedOutline={generatedOutline}
          currentPage={currentPage}
          onPageJump={goToPage} pdfDoc={pdfDoc}
        />
        <PDFViewer
          pdfDoc={pdfDoc} currentPage={currentPage}
          setCurrentPage={setCurrentPage} zoom={zoom}
          theme={theme} isDragging={isDragging}
          toolMode={toolMode}
          highlightColor={highlightColor}
          penColor={penColor}
          penSize={penSize}
          highlights={highlights}
          setHighlights={setHighlights}
          rotation={rotation}
          fitMode={fitMode}
          setZoom={setZoom}
          searchQuery={searchQuery}
          activeSearchPage={searchIndex >= 0 ? searchResults[searchIndex]?.page : null}
          recentFiles={recentFiles}
          onOpenRecentFile={handleOpenRecentFile}
          onRemoveRecentFile={handleRemoveRecentFile}
          pinnedFiles={pinnedFiles}
          onOpenAndPinFile={handleOpenAndPinFile}
          onRemovePinnedFile={handleRemovePinnedFile}
          getPageImageRef={getPageImageRef}
          bboxHighlight={bboxHighlight}
          onOpenFile={handleOpenFile}
          onTextSelect={(text) => {
            setSelectedText(text)
            setAiPanelOpen(true)
          }}
        />
        <button
          className={`ai-toggle-tab ${theme} ${aiPanelOpen ? 'open' : ''}`}
          type="button"
          style={{ right: aiPanelOpen ? `${aiPanelWidth}px` : 0 }}
          onClick={() => setAiPanelOpen(open => !open)}
          title={aiPanelOpen ? 'Collapse AI panel' : 'Ask AI'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a4 4 0 0 0 4 4h1" />
            <path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a4 4 0 0 1-4 4h-1" />
            <path d="M12 6v15" /><path d="M8 8h2" /><path d="M14 8h2" />
          </svg>
          <span className="ai-tab-label">Ask AI</span>
        </button>
        <AIPanel
          open={aiPanelOpen}
          width={aiPanelWidth}
          setWidth={setAiPanelWidth}
          messages={aiMessages}
          setMessages={setAiMessages}
          input={aiInput}
          setInput={setAiInput}
          referCurrentPage={referCurrentPage}
          setReferCurrentPage={setReferCurrentPage}
          referPrevPage={referPrevPage}
          setReferPrevPage={setReferPrevPage}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          configuredModels={configuredModels}
          apiKeys={apiKeys}
          apiModels={apiModels}
          currentPage={currentPage}
          pageTexts={pageTexts}
          onBboxJump={(bbox) => {
            setBboxHighlight(bbox)
            if (bbox?.page) goToPage(bbox.page)
          }}
          onSearchJump={(query) => runSearch(query)}
          onOpenKeyVault={() => setKeyVaultOpen(true)}
          chatFont={chatFont}
          fontSize={fontSize}
          fileName={fileName}
          getPageImageRef={getPageImageRef}
          selectedText={selectedText}
          setSelectedText={setSelectedText}
        />
      </div>
      <KeyVault
        open={keyVaultOpen}
        apiKeys={apiKeys}
        apiModels={apiModels}
        onClose={() => setKeyVaultOpen(false)}
        onSave={async (keys, models) => {
          await saveApiKeys(keys)
          await saveApiModels(models)
          setKeyVaultOpen(false)
        }}
      />
      {showOnboarding && (
        <Onboarding
          theme={theme}
          onDone={() => { persist('pf-onboarded', true); setShowOnboarding(false) }}
          onOpenKeyVault={() => { persist('pf-onboarded', true); setShowOnboarding(false); setKeyVaultOpen(true) }}
        />
      )}
      {navModalOpen && (
        <div className={`nav-modal-backdrop ${theme}`} onClick={() => setNavModalOpen(false)}>
          <div className="nav-modal" onClick={e => e.stopPropagation()}>
            <span className="nav-modal-label">Jump to page</span>
            <div className="nav-modal-row">
              <input
                ref={navInputRef}
                className="nav-modal-input"
                type="number"
                min={1}
                max={totalPages}
                value={navInput}
                onChange={e => setNavInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const p = parseInt(navInput, 10)
                    if (Number.isFinite(p)) goToPage(p)
                    setNavModalOpen(false)
                  }
                  if (e.key === 'Escape') setNavModalOpen(false)
                }}
                placeholder={`1 – ${totalPages}`}
              />
              <span className="nav-modal-of">of {totalPages}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}