import { useState, useEffect, useRef, useCallback } from 'react'

// ── Lazy thumbnail ─────────────────────────────────────────────────────────────
function ThumbCanvas({ pdfDoc, pageNum, isActive, onClick }) {
  const canvasRef  = useRef(null)
  const itemRef    = useRef(null)
  const [visible,  setVisible]  = useState(false)
  const [rendered, setRendered] = useState(false)

  // Intersection Observer — only render when scrolled into view (+200px buffer)
  useEffect(() => {
    const el = itemRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Render canvas only after visible
  useEffect(() => {
    if (!visible || !canvasRef.current || !pdfDoc || rendered) return
    let cancelled = false
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled) return
        const vp = page.getViewport({ scale: 0.28 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width  = vp.width
        canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        if (!cancelled) setRendered(true)
      } catch {}
    }
    render()
    return () => { cancelled = true }
  }, [visible, pdfDoc, pageNum, rendered])

  useEffect(() => {
    if (isActive) itemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [isActive])

  return (
    <button
      ref={itemRef}
      className={`thumb-item ${isActive ? 'active' : ''}`}
      type="button"
      onClick={onClick}
      title={`Go to page ${pageNum}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {visible
        ? <canvas ref={canvasRef} className="thumb-canvas" />
        : <div className="thumb-placeholder" />
      }
      <span className="thumb-n">{pageNum}</span>
    </button>
  )
}

// ── Resolve all TOC item page numbers once ─────────────────────────────────────
function useTOCPageMap(outline, pdfDoc) {
  const [pageMap, setPageMap] = useState(new Map())

  useEffect(() => {
    if (!pdfDoc || !outline.length) { setPageMap(new Map()); return }
    let cancelled = false

    const resolve = async (items) => {
      for (const item of items) {
        try {
          if (item.dest) {
            const dest = typeof item.dest === 'string'
              ? await pdfDoc.getDestination(item.dest)
              : item.dest
            if (dest) {
              const idx = await pdfDoc.getPageIndex(dest[0])
              item._page = idx + 1
            }
          }
        } catch {}
        if (item.items?.length) await resolve(item.items)
      }
    }

    resolve(outline).then(() => {
      if (!cancelled) setPageMap(new Map()) // trigger re-render with resolved _page values
    })

    return () => { cancelled = true }
  }, [outline, pdfDoc])

  return pageMap
}

// ── Find which TOC item corresponds to currentPage ─────────────────────────────
function findActiveItem(items, currentPage) {
  let best = null
  let bestPage = 0

  const walk = (list) => {
    for (const item of list) {
      const p = item._page
      if (p && p <= currentPage && p > bestPage) {
        best = item
        bestPage = p
      }
      if (item.items?.length) walk(item.items)
    }
  }
  walk(items)
  return best
}

// ── TOC Tree with collapse + active highlight + page numbers ───────────────────
function TOCTree({ items, pdfDoc, onPageJump, depth = 0, currentPage, activeItem }) {
  const [collapsed, setCollapsed] = useState({})
  const activeRef = useRef(null)

  // Auto-scroll active item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeItem])

  const jump = useCallback(async (item) => {
    if (!item.dest || !pdfDoc) return
    try {
      const dest = typeof item.dest === 'string'
        ? await pdfDoc.getDestination(item.dest)
        : item.dest
      if (dest) {
        const idx = await pdfDoc.getPageIndex(dest[0])
        onPageJump(idx + 1)
      }
    } catch {}
  }, [pdfDoc, onPageJump])

  return (
    <ul className="toc-list" style={{ paddingLeft: depth ? depth * 10 : 0 }}>
      {items.map((item, i) => {
        const isActive    = item === activeItem
        const hasChildren = item.items?.length > 0
        const isCollapsed = collapsed[i]

        return (
          <li key={i} className={`toc-item${isActive ? ' toc-item-active' : ''}`}>
            <div className="toc-row" ref={isActive ? activeRef : null}>
              {hasChildren ? (
                <button
                  className={`toc-chevron${isCollapsed ? ' collapsed' : ''}`}
                  onClick={() => setCollapsed(c => ({ ...c, [i]: !c[i] }))}
                  aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3l3 3 3-3" />
                  </svg>
                </button>
              ) : (
                <span className="toc-chevron-gap" />
              )}
              <button
                className={`toc-btn${isActive ? ' active' : ''}${depth > 0 ? ' toc-sub' : ''}`}
                onClick={() => jump(item)}
                title={item.title}
              >
                <span className="toc-label">{item.title}</span>
                {item._page && <span className="toc-pg">{item._page}</span>}
              </button>
            </div>

            {hasChildren && !isCollapsed && (
              <TOCTree
                items={item.items}
                pdfDoc={pdfDoc}
                onPageJump={onPageJump}
                depth={depth + 1}
                currentPage={currentPage}
                activeItem={activeItem}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── Generated TOC (AI-extracted) ───────────────────────────────────────────────
function GeneratedContents({ items, onPageJump, currentPage }) {
  return (
    <ul className="toc-list generated-toc">
      {items.map((item, index) => {
        const isActive = item.page === currentPage
        return (
          <li key={`${item.page}-${index}`} className={`toc-item${isActive ? ' toc-item-active' : ''}`}>
            <div className="toc-row">
              <span className="toc-chevron-gap" />
              <button
                className={`toc-btn generated${isActive ? ' active' : ''}`}
                onClick={() => onPageJump(item.page)}
                title={`Go to page ${item.page}`}
              >
                <span className="toc-label">{item.title}</span>
                <span className="toc-pg">{item.page}</span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────
export default function Sidebar({ open, outline, generatedOutline, currentPage, onPageJump, pdfDoc }) {
  const [tab, setTab] = useState('pages')
  const [pageCount, setPageCount] = useState(0)

  useTOCPageMap(outline, pdfDoc) // resolves _page on each item in-place
  const activeItem = outline.length ? findActiveItem(outline, currentPage) : null

  useEffect(() => {
    if (pdfDoc) setPageCount(pdfDoc.numPages)
    else setPageCount(0)
  }, [pdfDoc])

  useEffect(() => {
    if (outline.length || generatedOutline.length) setTab('toc')
  }, [outline.length, generatedOutline.length])

  if (!open) return null

  return (
    <div className="sidebar">
      <div className="sb-tabs">
        <button className={`sb-tab ${tab === 'pages' ? 'on' : ''}`} onClick={() => setTab('pages')}>Pages</button>
        <button className={`sb-tab ${tab === 'toc'   ? 'on' : ''}`} onClick={() => setTab('toc')}>Contents</button>
      </div>
      <div className="sb-body">
        {tab === 'pages' && (
          <div className="thumb-list">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
              <ThumbCanvas
                key={n} pdfDoc={pdfDoc} pageNum={n}
                isActive={currentPage === n}
                onClick={() => onPageJump(n)}
              />
            ))}
            {!pdfDoc && <p className="no-toc">Open a PDF to see pages</p>}
          </div>
        )}
        {tab === 'toc' && (
          outline.length > 0
            ? <TOCTree
                items={outline}
                pdfDoc={pdfDoc}
                onPageJump={onPageJump}
                currentPage={currentPage}
                activeItem={activeItem}
              />
            : generatedOutline.length > 0
              ? <GeneratedContents items={generatedOutline} onPageJump={onPageJump} currentPage={currentPage} />
              : <p className="no-toc">No readable contents found</p>
        )}
      </div>
    </div>
  )
}