import { useEffect, useRef, useState } from 'react'
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
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return 'Unknown date'
  }
}

export default function PDFViewer({
  pdfDoc, currentPage, setCurrentPage, zoom, theme, isDragging,
  toolMode, highlightColor, highlights, setHighlights,
  rotation, fitMode, setZoom, searchQuery, activeSearchPage,
  recentFiles = [], onOpenRecentFile
}) {
  const containerRef = useRef(null)
  const canvasRefs = useRef([])
  const textLayerRefs = useRef([])
  const pageRefs = useRef([])
  const [pages, setPages] = useState([])
  const [draftHighlight, setDraftHighlight] = useState(null)
  const [searchHitRects, setSearchHitRects] = useState([])
  const renderTasksRef = useRef([])
  const visiblePageRef = useRef(1)
  const jumpTargetRef = useRef(null)
  const jumpTimerRef = useRef(null)
  const layoutKeyRef = useRef('')

  useEffect(() => {
    if (!pdfDoc) { setPages([]); return }
    canvasRefs.current = []
    textLayerRefs.current = []
    pageRefs.current = []
    visiblePageRef.current = 1
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

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) return
    renderTasksRef.current.forEach(t => { try { t.cancel() } catch {} })
    renderTasksRef.current = []
    let cancelled = false

    const renderAll = async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        try {
          const page = await pdfDoc.getPage(i)
          const canvas = canvasRefs.current[i - 1]
          if (!canvas || cancelled) continue
          const dpr = window.devicePixelRatio || 1
          const vp = page.getViewport({ scale: zoom * dpr, rotation })
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          canvas.style.width = `${vp.width / dpr}px`
          canvas.style.height = `${vp.height / dpr}px`
          const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
          renderTasksRef.current.push(task)
          await task.promise
        } catch {}
      }
    }

    const t = setTimeout(renderAll, 80)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [pdfDoc, pages, zoom, rotation])

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) {
      setSearchHitRects([])
      return
    }
    let cancelled = false
    const needle = searchQuery?.trim().toLowerCase()

    const buildTextLayers = async () => {
      const nextSearchRects = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        try {
          const page = await pdfDoc.getPage(i)
          const layer = textLayerRefs.current[i - 1]
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
                  page: i,
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

    const t = setTimeout(buildTextLayers, 60)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [pdfDoc, pages, zoom, rotation, searchQuery])

  useEffect(() => {
    const container = containerRef.current
    const el = pageRefs.current[currentPage - 1]
    if (!container || !el || pages.length === 0) return

    const layoutKey = `${pages.length}:${zoom}:${rotation}`
    if (visiblePageRef.current === currentPage && layoutKeyRef.current === layoutKey) return
    layoutKeyRef.current = layoutKey

    jumpTargetRef.current = currentPage
    window.clearTimeout(jumpTimerRef.current)
    container.scrollTo({ top: Math.max(el.offsetTop - 20, 0), behavior: 'smooth' })
    jumpTimerRef.current = window.setTimeout(() => {
      visiblePageRef.current = currentPage
      jumpTargetRef.current = null
    }, 700)
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
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          bestPage = i
        }
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
        jumpTargetRef.current = null
        return
      }

      const nextPage = getVisiblePage()
      if (nextPage !== visiblePageRef.current) {
        visiblePageRef.current = nextPage
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

  const startHighlight = (event, pageNum) => {
    if (toolMode !== 'highlight' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    setDraftHighlight({
      page: pageNum,
      color: highlightColor,
      startX: point.x,
      startY: point.y,
      ...makeRect(point.x, point.y, point.x, point.y)
    })
  }

  const updateHighlight = (event) => {
    if (!draftHighlight || toolMode !== 'highlight') return
    event.preventDefault()
    const point = pointFromEvent(event)
    setDraftHighlight(draft => ({
      ...draft,
      ...makeRect(draft.startX, draft.startY, point.x, point.y)
    }))
  }

  const finishHighlight = (event) => {
    if (!draftHighlight) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    const { startX, startY, ...rect } = draftHighlight
    if (rect.w > 0.008 && rect.h > 0.004) {
      setHighlights(items => [...items, { ...rect, id: `${Date.now()}-${items.length}` }])
    }
    setDraftHighlight(null)
  }

  const renderHighlight = (item, isDraft = false) => (
    <div
      key={item.id || 'draft'}
      className={`highlight-mark ${isDraft ? 'draft' : ''}`}
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.w * 100}%`,
        height: `${item.h * 100}%`,
        backgroundColor: item.color
      }}
    />
  )

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

  if (!pdfDoc) {
    return (
      <div className={`pdf-empty ${theme} ${isDragging ? 'dragging' : ''}`}>
        {isDragging
          ? <div className="drop-hint"><div className="drop-icon">↓</div><p>Drop PDF here</p></div>
          : <div className="empty-state">

              {/* ── Hero ── */}
              <div className="empty-hero">
                <div className="empty-logo-ring">
                  <img className="empty-logo" src="./icon.ico" alt="PDFistic" />
                </div>
                <div className="empty-brand">
                  <h1 className="empty-title">PDFistic</h1>
                </div>
              </div>

              <p className="empty-sub">Drop a PDF file or click Open</p>

              {recentFiles.length > 0 && (
                <div className="recent-section">
                  <div className="recent-head">
                    <span>Recent Files</span>
                    <small>Resume where you left off</small>
                  </div>
                  <div className="recent-grid">
                    {recentFiles.slice(0, 8).map(file => (
                      <button
                        key={file.path}
                        className="recent-card"
                        type="button"
                        onClick={() => onOpenRecentFile?.(file)}
                        title={file.path}
                      >
                        <span className="recent-icon">PDF</span>
                        <span className="recent-name">{file.name}</span>
                        <span className="recent-meta">
                          {file.pageCount ? `${file.pageCount} pages` : 'PDF document'}
                        </span>
                        <span className="recent-meta">Last opened {formatLastOpened(file.lastOpened)}</span>
                        <span className="recent-page">Resume page {file.lastPage || 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="feature-strip">
                <div className="feature-chip open-chip">
                  <kbd>Ctrl O</kbd>
                  <span>Open PDF</span>
                </div>
                <div className="feature-chip ai-chip">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Ask AI about your PDF</span>
                </div>
                <div className="feature-chip ai-chip">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>
                  <span>Highlight and annotate</span>
                </div>
                <div className="feature-chip ai-chip">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <span>Full-text search</span>
                </div>
              </div>

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

  return (
    <div className={`pdf-scroll ${theme} ${toolMode === 'highlight' ? 'highlighting' : ''}`} ref={containerRef}>
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
              <div
                className={`highlight-layer ${toolMode === 'highlight' ? 'active' : ''}`}
                onPointerDown={event => startHighlight(event, num)}
                onPointerMove={updateHighlight}
                onPointerUp={finishHighlight}
                onPointerCancel={() => setDraftHighlight(null)}
              >
                {highlights.filter(item => item.page === num).map(item => renderHighlight(item))}
                {draftHighlight?.page === num && renderHighlight(draftHighlight, true)}
              </div>
            </div>
            <span className="pg-label">Page {num}</span>
          </div>
        ))}
      </div>
    </div>
  )
}