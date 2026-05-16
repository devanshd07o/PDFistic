import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as pdfjsLib from 'pdfjs-dist'

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max)

const makeRect = (startX, startY, endX, endY) => ({
  x: Math.min(startX, endX),
  y: Math.min(startY, endY),
  w: Math.abs(endX - startX),
  h: Math.abs(endY - startY)
})

const formatLastOpened = (value) => {
  if (!value) return 'Unknown date'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return 'Unknown date'
  }
}

// ── Floating "Ask AI" button rendered via portal ──────────────────────────────
function AskAIFloat({ pos, onAsk, onDismiss }) {
  if (!pos) return null
  return createPortal(
    <div className="ask-ai-float" style={{ left: pos.x - 36, top: pos.y - 42 }}>
      <button
        className="ask-ai-float-btn"
        onMouseDown={(e) => { e.preventDefault(); onAsk() }}
      >
        ✦ Ask AI
      </button>
    </div>,
    document.body
  )
}

// ── PDF thumbnail cache ────────────────────────────────────────────────────────
const _thumbCache = new Map()

// ── PDF first-page thumbnail for home screen cards ────────────────────────────
function PdfThumbnail({ file }) {
  const wrapRef = useRef(null)
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    if (!file?.path) { setState('error'); return }
    const cached = _thumbCache.get(file.path)
    if (cached === 'error') { setState('error'); return }
    if (cached) { setDataUrl(cached); setState('done'); return }

    const el = wrapRef.current
    if (!el) return
    let cancelled = false

    const renderThumb = async () => {
      setState('loading')
      try {
        const raw = file.path
        let data

        // Use the same loading method as the main app
        if (window.electronAPI?.readFile) {
          data = await window.electronAPI.readFile(raw)
        } else {
          // Web fallback: fetch via file:// URL
          const url = raw.startsWith('file://') ? raw
            : raw.startsWith('/') ? `file://${raw}`
            : `file:///${raw.replace(/\\/g, '/')}`
          const res = await fetch(url)
          data = await res.arrayBuffer()
        }

        if (cancelled) return
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) { doc.destroy(); return }
        const page = await doc.getPage(1)
        if (cancelled) { doc.destroy(); return }
        const vp = page.getViewport({ scale: 0.4 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(vp.width)
        canvas.height = Math.floor(vp.height)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        doc.destroy()
        if (cancelled) return
        const thumb = canvas.toDataURL('image/jpeg', 0.82)
        _thumbCache.set(raw, thumb)
        setDataUrl(thumb)
        setState('done')
      } catch (err) {
        if (!cancelled) {
          console.warn('[PdfThumbnail] failed for', file.path, err?.message)
          _thumbCache.set(file.path, 'error')
          setState('error')
        }
      }
    }

    // Use IntersectionObserver but with a fallback: if already visible, render immediately
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      renderThumb()
    }, { rootMargin: '400px' })

    obs.observe(el)
    return () => { cancelled = true; obs.disconnect() }
  }, [file?.path])

  if (state === 'done' && dataUrl) {
    return (
      <div ref={wrapRef} className="recent-thumb recent-thumb--done">
        <img src={dataUrl} alt="" className="recent-thumb-img" draggable={false} />
      </div>
    )
  }

  return (
    <div ref={wrapRef} className={`recent-thumb${state === 'loading' ? ' recent-thumb--loading' : ''}`}>
      {state === 'loading'
        ? <div className="recent-thumb-shimmer" />
        : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        )
      }
    </div>
  )
}

export default function PDFViewer({
  pdfDoc, currentPage, setCurrentPage, zoom, theme, isDragging,
  toolMode, highlightColor, penColor, penSize, highlights, setHighlights,
  rotation, fitMode, setZoom, setFitMode, searchQuery, activeSearchPage,
  recentFiles = [], onOpenRecentFile, onRemoveRecentFile,
  pinnedFiles = [], onOpenAndPinFile, onRemovePinnedFile,
  getPageImageRef,
  bboxHighlight,
  onTextSelect,
  onOpenFile,
}) {
  const containerRef = useRef(null)
  const canvasRefs = useRef([])
  const textLayerRefs = useRef([])
  const pageRefs = useRef([])
  const [pages, setPages] = useState([])
  const [draftHighlight, setDraftHighlight] = useState(null)
  const [draftPen, setDraftPen] = useState(null)
  const [draftEraser, setDraftEraser] = useState(null)
  const [penStrokes, setPenStrokes] = useState([])
  const [searchHitRects, setSearchHitRects] = useState([])
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const renderTasksRef = useRef([])
  const renderedSignatureRef = useRef(new Map())
  const visiblePageRef = useRef(1)
  const prevCurrentPageRef = useRef(currentPage)
  const jumpTargetRef = useRef(null)
  const jumpTimerRef = useRef(null)
  const layoutKeyRef = useRef('')
  const [renderCenter, setRenderCenter] = useState(1)

  // ── Selection → Ask AI ────────────────────────────────────────────────────
  const [selectionPos, setSelectionPos] = useState(null)
  const selectionTextRef = useRef('')

  // ── Populate getPageImageRef ──────────────────────────────────────────────
  useEffect(() => {
    if (!getPageImageRef) return
    getPageImageRef.current = (pageNum) => {
      const canvas = canvasRefs.current[(pageNum || 1) - 1]
      if (!canvas) return null
      try { return canvas.toDataURL('image/jpeg', 0.85) } catch { return null }
    }
  })

  // ── Text-selection → Ask AI ───────────────────────────────────────────────
  const handleDocMouseUp = useCallback((e) => {
    window.setTimeout(() => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      if (text && text.length > 3) {
        selectionTextRef.current = text
        try {
          const rect = sel.getRangeAt(0).getBoundingClientRect()
          setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top })
        } catch {
          setSelectionPos({ x: e.clientX, y: e.clientY })
        }
      } else {
        setSelectionPos(null)
        selectionTextRef.current = ''
      }
    }, 30)
  }, [])

  useEffect(() => {
    const hide = () => setSelectionPos(null)
    const onKey = (e) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', onKey)
    containerRef.current?.addEventListener('scroll', hide, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      containerRef.current?.removeEventListener('scroll', hide)
    }
  }, [])

  useEffect(() => {
    if (!pdfDoc) { setPages([]); return }
    canvasRefs.current = []
    textLayerRefs.current = []
    pageRefs.current = []
    renderedSignatureRef.current.clear()
    visiblePageRef.current = 1
    setRenderCenter(1)
    setPages(Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1))
  }, [pdfDoc])

  useEffect(() => {
    if (fitMode !== 'width' || !pdfDoc) return
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let frameId = 0

    const fitWidth = async () => {
      try {
        const page = await pdfDoc.getPage(1)
        if (cancelled) return
        const viewport = page.getViewport({ scale: 1, rotation })
        const available = Math.max(container.clientWidth - 72, 320)
        setZoom(+clamp(available / viewport.width, 0.5, 4).toFixed(2))
      } catch {}
    }
    const scheduleFit = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(fitWidth)
    }
    fitWidth()
    const resizeObserver = new ResizeObserver(scheduleFit)
    resizeObserver.observe(container)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
    }
  }, [pdfDoc, fitMode, rotation, setZoom])

  const getRenderTargets = useCallback((centerPage, buffer = 2) => {
    const center = Math.min(Math.max(Number(centerPage) || 1, 1), Math.max(pdfDoc?.numPages || 1, 1))
    const start = Math.max(1, center - buffer)
    const end = Math.min(pdfDoc?.numPages || 1, center + buffer)
    const targets = []
    for (let i = center; i <= end; i++) targets.push(i)
    for (let i = center - 1; i >= start; i--) targets.push(i)
    if (!targets.includes(currentPage)) targets.unshift(currentPage)
    return targets
  }, [pdfDoc, currentPage])

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) return
    renderTasksRef.current.forEach(t => { try { t.cancel() } catch {} })
    renderTasksRef.current = []
    let cancelled = false

    const signature = `${zoom}:${rotation}`
    const targets = getRenderTargets(renderCenter, 2)

    const renderTargets = async () => {
      for (const pageNum of targets) {
        try {
          const canvas = canvasRefs.current[pageNum - 1]
          if (!canvas || cancelled) continue
          if (renderedSignatureRef.current.get(pageNum) === signature) continue

          const page = await pdfDoc.getPage(pageNum)
          if (cancelled) continue
          const dpr = window.devicePixelRatio || 1
          const vp = page.getViewport({ scale: zoom * dpr, rotation })
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          canvas.style.width = `${vp.width / dpr}px`
          canvas.style.height = `${vp.height / dpr}px`
          const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
          renderTasksRef.current.push(task)
          await task.promise
          renderedSignatureRef.current.set(pageNum, signature)
        } catch {}
      }
    }

    const t = setTimeout(renderTargets, 24)
    return () => { cancelled = true; clearTimeout(t) }
  }, [pdfDoc, pages, zoom, rotation, renderCenter, getRenderTargets])

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) { setSearchHitRects([]); return }
    let cancelled = false
    const needle = searchQuery?.trim().toLowerCase()
    const targets = getRenderTargets(renderCenter, 2)

    const buildTextLayers = async () => {
      const nextSearchRects = []
      for (const pageNum of targets) {
        try {
          const page = await pdfDoc.getPage(pageNum)
          const layer = textLayerRefs.current[pageNum - 1]
          if (!layer || cancelled) continue
          const viewport = page.getViewport({ scale: zoom, rotation })
          const content = await page.getTextContent()
          layer.replaceChildren()
          layer.style.width = `${viewport.width}px`
          layer.style.height = `${viewport.height}px`

          for (const item of content.items) {
            const text = item.str || ''
            if (!text.trim()) continue
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
            const fontHeight = Math.max(Math.hypot(tx[2], tx[3]), Math.abs(tx[3]), 8)
            const width = Math.max(item.width * zoom, fontHeight * text.length * 0.35)
            const left = tx[4]
            const top = tx[5] - fontHeight

            const span = document.createElement('span')
            span.textContent = text
            span.style.left = `${left}px`
            span.style.top = `${top}px`
            span.style.fontSize = `${fontHeight}px`
            span.style.width = `${width}px`
            span.style.height = `${fontHeight * 1.18}px`
            layer.appendChild(span)

            if (needle && text.toLowerCase().includes(needle)) {
              let index = text.toLowerCase().indexOf(needle)
              while (index !== -1) {
                const charWidth = width / Math.max(text.length, 1)
                nextSearchRects.push({
                  page: pageNum,
                  x: (left + charWidth * index) / viewport.width,
                  y: top / viewport.height,
                  w: (charWidth * needle.length) / viewport.width,
                  h: (fontHeight * 1.18) / viewport.height
                })
                index = text.toLowerCase().indexOf(needle, index + needle.length)
              }
            }
          }
        } catch {}
      }
      if (!cancelled) setSearchHitRects(nextSearchRects)
    }
    const t = setTimeout(buildTextLayers, 40)
    return () => { cancelled = true; clearTimeout(t) }
  }, [pdfDoc, pages, zoom, rotation, searchQuery, renderCenter, getRenderTargets])

  useEffect(() => {
    const container = containerRef.current
    const el = pageRefs.current[currentPage - 1]
    if (!container || !el || pages.length === 0) return

    const layoutKey = `${pages.length}:${zoom}:${rotation}`
    const pageChanged = prevCurrentPageRef.current !== currentPage
    prevCurrentPageRef.current = currentPage
    if (visiblePageRef.current === currentPage && layoutKeyRef.current === layoutKey) return
    layoutKeyRef.current = layoutKey

    window.clearTimeout(jumpTimerRef.current)
    const targetTop = Math.max(el.offsetTop - 20, 0)

    if (pageChanged) {
      jumpTargetRef.current = currentPage
      setRenderCenter(currentPage)
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
      jumpTimerRef.current = window.setTimeout(() => {
        visiblePageRef.current = currentPage
        jumpTargetRef.current = null
      }, 700)
      return
    }

    // Zoom/rotation/layout updates should never scroll the container.
    // This keeps Ctrl/Cmd+wheel as pure zoom with zero scroll movement.
    jumpTargetRef.current = null
    visiblePageRef.current = currentPage
    setRenderCenter(currentPage)
  }, [currentPage, pages.length, zoom, rotation])

  useEffect(() => {
    const container = containerRef.current
    if (!container || pages.length === 0) return

    const getVisiblePage = () => {
      const cr = container.getBoundingClientRect()
      let bestPage = visiblePageRef.current
      let bestOverlap = 0
      for (let i = 1; i <= pages.length; i++) {
        const el = pageRefs.current[i - 1]
        if (!el) continue
        const r = el.getBoundingClientRect()
        const overlap = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top))
        if (overlap > bestOverlap) { bestOverlap = overlap; bestPage = i }
      }
      return bestPage
    }

    const onScroll = () => {
      if (jumpTargetRef.current) {
        const targetEl = pageRefs.current[jumpTargetRef.current - 1]
        if (!targetEl) return
        const cr = container.getBoundingClientRect()
        const r = targetEl.getBoundingClientRect()
        const targetIsVisible = r.top <= cr.top + cr.height * 0.35 && r.bottom >= cr.top + cr.height * 0.35
        if (!targetIsVisible) return
        visiblePageRef.current = jumpTargetRef.current
        setRenderCenter(jumpTargetRef.current)
        jumpTargetRef.current = null
        return
      }
      const nextPage = getVisiblePage()
      if (nextPage !== visiblePageRef.current) {
        visiblePageRef.current = nextPage
        setRenderCenter(nextPage)
        setCurrentPage(nextPage)
      }
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(jumpTimerRef.current)
      container.removeEventListener('scroll', onScroll)
    }
  }, [pages, setCurrentPage])

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height)
    }
  }

  const cloneState = (highlightsArray, penStrokesArray) => ({
    highlights: highlightsArray.map(item => ({ ...item })),
    penStrokes: penStrokesArray.map(stroke => ({
      ...stroke,
      points: stroke.points.map(point => ({ ...point }))
    }))
  })

  const pushHistory = (nextHighlights, nextPenStrokes) => {
    setUndoStack(prev => [...prev, cloneState(nextHighlights, nextPenStrokes)])
    setRedoStack([])
  }

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (!prev.length) return prev
      const nextUndo = prev.slice(0, -1)
      const snapshot = prev[prev.length - 1]
      setRedoStack((redoPrev) => [...redoPrev, cloneState(highlights, penStrokes)])
      setHighlights(snapshot.highlights)
      setPenStrokes(snapshot.penStrokes)
      return nextUndo
    })
  }, [highlights, penStrokes, setHighlights])

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (!prev.length) return prev
      const nextRedo = prev.slice(0, -1)
      const snapshot = prev[prev.length - 1]
      setUndoStack((undoPrev) => [...undoPrev, cloneState(highlights, penStrokes)])
      setHighlights(snapshot.highlights)
      setPenStrokes(snapshot.penStrokes)
      return nextRedo
    })
  }, [highlights, penStrokes, setHighlights])

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable)) return
      if (!pdfDoc) return
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pdfDoc, redo, undo])

  const startHighlight = (event, pageNum) => {
    if (toolMode !== 'highlight' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    setDraftHighlight({
      page: pageNum, color: highlightColor,
      startX: point.x, startY: point.y,
      ...makeRect(point.x, point.y, point.x, point.y)
    })
  }

  const startPen = (event, pageNum) => {
    if (toolMode !== 'pen' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    setDraftPen({ page: pageNum, color: penColor, width: penSize, points: [point], id: `pen-${Date.now()}-${pageNum}` })
  }

  const startEraser = (event, pageNum) => {
    if (toolMode !== 'eraser' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    setDraftEraser({ page: pageNum, points: [point] })
  }

  const updateHighlight = (event) => {
    if (draftHighlight && toolMode === 'highlight') {
      event.preventDefault()
      const point = pointFromEvent(event)
      setDraftHighlight(draft => ({ ...draft, ...makeRect(draft.startX, draft.startY, point.x, point.y) }))
      return
    }
    if (draftPen && toolMode === 'pen') {
      event.preventDefault()
      const point = pointFromEvent(event)
      setDraftPen(draft => ({ ...draft, points: [...draft.points, point] }))
      return
    }
    if (draftEraser && toolMode === 'eraser') {
      event.preventDefault()
      const point = pointFromEvent(event)
      setDraftEraser(draft => ({ ...draft, points: [...draft.points, point] }))
    }
  }

  const finishHighlight = (event) => {
    if (draftHighlight && toolMode === 'highlight') {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
      const { startX, startY, ...rect } = draftHighlight
      if (rect.w > 0.008 && rect.h > 0.004) {
        setHighlights(items => [...items, { ...rect, id: `${Date.now()}-${items.length}` }])
      }
      setDraftHighlight(null)
      return
    }
    if (draftPen && toolMode === 'pen') {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
      if (draftPen.points.length > 1) {
        pushHistory(highlights, penStrokes)
        setPenStrokes(items => [...items, draftPen])
      }
      setDraftPen(null)
      return
    }
    if (draftEraser && toolMode === 'eraser') {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
      const erasePoints = draftEraser.points
      pushHistory(highlights, penStrokes)
      setPenStrokes(items => items.filter(stroke => {
        if (stroke.page !== draftEraser.page) return true
        return !stroke.points.some(point => erasePoints.some(ep => distance(point, ep) <= 0.03))
      }))
      setDraftEraser(null)
    }
  }

  const renderHighlight = (item, isDraft = false) => (
    <div
      key={item.id || 'draft'}
      className={`highlight-mark ${isDraft ? 'draft' : ''}`}
      style={{
        left: `${item.x * 100}%`, top: `${item.y * 100}%`,
        width: `${item.w * 100}%`, height: `${item.h * 100}%`,
        backgroundColor: item.color
      }}
    />
  )

  const renderPenStroke = (stroke, isDraft = false) => {
    const pts = stroke.points
    if (!pts || pts.length === 0) return null

    // ── Rainbow mode: each segment gets its own hue ──────────────────────────
    if (stroke.color === 'rainbow') {
      if (pts.length < 2) return null
      return pts.slice(1).map((pt, i) => {
        const prev = pts[i]
        const hue = (i / Math.max(pts.length - 1, 1)) * 360
        return (
          <path
            key={`${stroke.id}-${i}`}
            d={`M ${prev.x * 100} ${prev.y * 100} L ${pt.x * 100} ${pt.y * 100}`}
            fill="none"
            stroke={`hsl(${hue}, 100%, 55%)`}
            strokeWidth={stroke.width || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={isDraft ? 0.85 : 1}
          />
        )
      })
    }

    // ── Normal single-color stroke ────────────────────────────────────────────
    const pathData = pts.map((point, idx) =>
      `${idx === 0 ? 'M' : 'L'} ${point.x * 100} ${point.y * 100}`
    ).join(' ')
    return (
      <path
        key={stroke.id}
        d={pathData}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width || 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isDraft ? 0.85 : 1}
      />
    )
  }

  const renderEraserPath = (stroke) => {
    const pathData = stroke.points.map((point, idx) =>
      `${idx === 0 ? 'M' : 'L'} ${point.x * 100} ${point.y * 100}`
    ).join(' ')
    return (
      <path
        key="eraser-draft"
        d={pathData}
        fill="none"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={penSize * 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
    )
  }

  const renderSearchHit = (item, index) => (
    <div
      key={`${item.page}-${index}-${item.x}`}
      className={`search-hit ${item.page === activeSearchPage ? 'active-page' : ''}`}
      style={{
        left: `${clamp(item.x) * 100}%`,
        top: `${clamp(item.y) * 100}%`,
        width: `${clamp(item.w, 0.002, 1) * 100}%`,
        height: `${clamp(item.h, 0.004, 1) * 100}%`
      }}
    />
  )

  // ── Home Screen ──────────────────────────────────────────────────────────────
  if (!pdfDoc) {
    return (
      <div className={`pdf-empty ${theme} ${isDragging ? 'dragging' : ''}`}>
        {isDragging
          ? <div className="drop-hint">
              <div className="drop-icon">↓</div>
              <p>Drop PDF files here</p>
              <p className="drop-sub">You can drop multiple files at once</p>
            </div>
          : <div className="empty-state">

              {/* ── Hero ── */}
              <div className="empty-hero">
                <div className="empty-logo-ring">
                  <img className="empty-logo" src="./icon.png" alt="PDFistic" />
                </div>
                <h1 className="empty-title">PDFistic</h1>
              </div>

              {/* ── Drop zone hint ── */}
              <div className={`home-drop-zone ${theme}`} onClick={onOpenFile}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Drop PDF files here or <strong>click to browse</strong></span>
                <span className="home-drop-multi"> | Multiple files supported — open several PDFs at once</span>
              </div>

              {/* ── Recent Files (merged with pinned, pinned shown first) ── */}
              {(pinnedFiles.length > 0 || recentFiles.length > 0) && (() => {
                const pinnedPaths = new Set(pinnedFiles.map(f => f.path))
                const merged = [
                  ...pinnedFiles,
                  ...recentFiles.filter(f => !pinnedPaths.has(f.path))
                ]
                return (
                  <div className="recent-section">
                    <div className="recent-head">
                      <span>Recent Files</span>
                      <small>Resume where you left off</small>
                    </div>
                    <div className="recent-grid">
                      {merged.map(file => {
                        const isPinned = pinnedPaths.has(file.path)
                        return (
                          <div key={file.path} className="recent-card-wrap">
                            <button
                              className="recent-card"
                              type="button"
                              onClick={() => onOpenRecentFile?.(file)}
                              title={file.path}
                            >
                              <PdfThumbnail file={file} />
                              <div className="recent-card-body">
                                <span className="recent-name">{file.name}</span>
                                <span className="recent-meta">
                                  {file.pageCount ? `${file.pageCount} pages` : 'PDF document'}
                                </span>
                                {file.lastOpened && (
                                  <span className="recent-meta">Last opened {formatLastOpened(file.lastOpened)}</span>
                                )}
                                <span className="recent-page">
                                  {isPinned ? '📌 ' : ''}Resume p.{file.lastPage || 1}
                                </span>
                              </div>
                            </button>
                            <button
                              className="card-delete-btn"
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                if (isPinned) onRemovePinnedFile?.(file.path)
                                else onRemoveRecentFile?.(file.path)
                              }}
                              title="Remove"
                            >×</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ── Copyright ── */}
              <div className="empty-credit">
                <span className="empty-credit-divider" />
                <span className="empty-credit-text">
                  Crafted by <strong>Devansh Dubey</strong>
                </span>
                <span className="empty-credit-dot">·</span>
                <span className="empty-credit-text">© 2026 PDFistic</span>
                <span className="empty-credit-divider" />
              </div>

            </div>
        }
      </div>
    )
  }

  // ── PDF Viewer ───────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className={`pdf-scroll ${theme} ${toolMode === 'highlight' ? 'highlighting' : ''}`}
        ref={containerRef}
        onMouseUp={toolMode === 'select' ? handleDocMouseUp : undefined}
      >
        <div className="pages-col">
          {pages.map(num => (
            <div
              key={num}
              id={`pg-${num}`}
              ref={el => { pageRefs.current[num - 1] = el }}
              className="page-wrap"
            >
              <div className="page-surface">
                <canvas ref={el => { canvasRefs.current[num - 1] = el }} className="pdf-canvas" />
                <div ref={el => { textLayerRefs.current[num - 1] = el }} className="text-layer" />
                <div className="search-layer">
                  {searchHitRects.filter(item => item.page === num).map((item, index) => renderSearchHit(item, index))}
                </div>
                <div className="pen-layer-wrap">
                  <svg className="pen-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {penStrokes.filter(item => item.page === num).map(item => renderPenStroke(item))}
                    {draftPen?.page === num && renderPenStroke(draftPen, true)}
                    {draftEraser?.page === num && renderEraserPath(draftEraser)}
                  </svg>
                </div>
                <div
                  className={`highlight-layer ${toolMode === 'highlight' || toolMode === 'pen' || toolMode === 'eraser' ? 'active' : ''}`}
                  onPointerDown={event => {
                    if (toolMode === 'highlight') startHighlight(event, num)
                    else if (toolMode === 'pen') startPen(event, num)
                    else if (toolMode === 'eraser') startEraser(event, num)
                  }}
                  onPointerMove={updateHighlight}
                  onPointerUp={finishHighlight}
                  onPointerCancel={() => {
                    if (toolMode === 'highlight') setDraftHighlight(null)
                    if (toolMode === 'pen') setDraftPen(null)
                    if (toolMode === 'eraser') setDraftEraser(null)
                  }}
                >
                  {highlights.filter(item => item.page === num).map(item => renderHighlight(item))}
                  {draftHighlight?.page === num && renderHighlight(draftHighlight, true)}
                </div>
                {bboxHighlight?.page === num && (
                  <div className="bbox-layer active">
                    <div
                      className="bbox-highlight"
                      style={{
                        left: `${clamp(bboxHighlight.x) * 100}%`,
                        top: `${clamp(bboxHighlight.y) * 100}%`,
                        width: `${clamp(bboxHighlight.w, 0.002, 1) * 100}%`,
                        height: `${clamp(bboxHighlight.h, 0.004, 1) * 100}%`
                      }}
                    />
                  </div>
                )}
              </div>
              <span className="pg-label">Page {num}</span>
            </div>
          ))}
        </div>
      </div>

      <AskAIFloat
        pos={selectionPos}
        onAsk={() => {
          const text = selectionTextRef.current
          setSelectionPos(null)
          selectionTextRef.current = ''
          window.getSelection()?.removeAllRanges()
          if (text && onTextSelect) onTextSelect(text)
        }}
        onDismiss={() => setSelectionPos(null)}
      />
    </>
  )
}