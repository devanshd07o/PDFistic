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
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export default function App() {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1.2)
  const [theme, setTheme] = useState('light')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [outline, setOutline] = useState([])
  const [generatedOutline, setGeneratedOutline] = useState([])
  const [fileName, setFileName] = useState('')
  const [currentFile, setCurrentFile] = useState(null)
  const [recentFiles, setRecentFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState('')
  const [toolMode, setToolMode] = useState('select')
  const [highlightColor, setHighlightColor] = useState('#facc15')
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
  const [selectedModel, setSelectedModel] = useState('')
  const [apiModels, setApiModels] = useState({})
  const [apiKeys, setApiKeys] = useState({})
  const [configuredModels, setConfiguredModels] = useState([])
  const [keyVaultOpen, setKeyVaultOpen] = useState(false)
  const [pageTexts, setPageTexts] = useState({})
  const [aiPanelWidth, setAiPanelWidth] = useState(320)
  const [fontId, setFontId] = useState('system')
  const [fontSize, setFontSize] = useState(13)
  const [ocrStatus, setOcrStatus] = useState('')
  const ocrWorkerRef = useRef(null)
  const chatFont = (PREMIUM_FONTS.find(f => f.id === fontId) || PREMIUM_FONTS[0]).value

  const applyApiKeys = useCallback((keys = {}) => {
    setApiKeys(keys)
    const configured = PROVIDERS.filter(provider => keys?.[provider.id]?.trim())
    setConfiguredModels(configured)
    setSelectedModel(model => configured.some(provider => provider.id === model) ? model : (configured[0]?.id || ''))
  }, [])

  const applyApiModels = useCallback((models = {}) => {
    setApiModels(models)
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    if (!window.electronAPI?.getRecentFiles) return
    const files = await window.electronAPI.getRecentFiles()
    setRecentFiles(Array.isArray(files) ? files : [])
  }, [])

  const saveRecentProgress = useCallback(async (file, page = currentPage, pageCount = totalPages, markOpened = false) => {
    if (!file?.path || !window.electronAPI?.saveRecentFile) return
    const files = await window.electronAPI.saveRecentFile({
      path: file.path,
      name: file.name,
      lastPage: Math.max(1, Number(page) || 1),
      pageCount: Math.max(0, Number(pageCount) || 0),
      ...(markOpened ? { lastOpened: Date.now() } : {})
    })
    setRecentFiles(Array.isArray(files) ? files : [])
  }, [currentPage, totalPages])

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
      const fp = await window.electronAPI.openFileDialog()
      if (fp) loadPDF(fp)
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
    if (!window.electronAPI?.setApiKeys) return
    const saved = await window.electronAPI.setApiKeys(keys)
    applyApiKeys(saved)
    setKeyVaultOpen(false)
  }

  const saveApiModels = async (models) => {
    if (!window.electronAPI?.setApiModels) return
    const saved = await window.electronAPI.setApiModels(models)
    applyApiModels(saved)
    return saved
  }

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = (ev) => loadPDF(ev.target.result, file.name)
      reader.readAsArrayBuffer(file)
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
    Promise.all([
      window.electronAPI?.getApiKeys?.(),
      window.electronAPI?.getApiModels?.()
    ]).then(([keys, models]) => {
      if (!mounted) return
      applyApiKeys(keys || {})
      applyApiModels(models || {})
    })
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

  // Mouse wheel zoom (Ctrl + scroll)
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      changeZoom(z => +(z + delta).toFixed(2))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [changeZoom])

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
        onOpenFile={handleOpenFile} onPageChange={goToPage}
        onCreateDesktopShortcut={createDesktopShortcut}
        shortcutStatus={shortcutStatus}
        toolMode={toolMode} setToolMode={setToolMode}
        highlightColor={highlightColor} setHighlightColor={setHighlightColor}
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
          highlights={highlights}
          setHighlights={setHighlights}
          rotation={rotation}
          fitMode={fitMode}
          setZoom={setZoom}
          searchQuery={searchQuery}
          activeSearchPage={searchIndex >= 0 ? searchResults[searchIndex]?.page : null}
          recentFiles={recentFiles}
          onOpenRecentFile={handleOpenRecentFile}
        />
        <button
          className={`ai-toggle-tab ${aiPanelOpen ? 'open' : ''}`}
          type="button"
          style={{ right: aiPanelOpen ? `${aiPanelWidth}px` : 0 }}
          onClick={() => setAiPanelOpen(open => !open)}
          title={aiPanelOpen ? 'Collapse AI panel' : 'Ask AI'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a4 4 0 0 0 4 4h1" />
            <path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a4 4 0 0 1-4 4h-1" />
            <path d="M12 6v15" />
            <path d="M8 8h2" />
            <path d="M14 8h2" />
          </svg>
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
          onOpenKeyVault={() => setKeyVaultOpen(true)}
          chatFont={chatFont}
          fontSize={fontSize}
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
    </div>
  )
}