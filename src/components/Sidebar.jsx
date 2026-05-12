import { useState, useEffect, useRef } from 'react'

function ThumbCanvas({ pdfDoc, pageNum, isActive, onClick }) {
  const canvasRef = useRef(null)
  const itemRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return
    let cancelled = false
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled) return
        const vp = page.getViewport({ scale: 0.28 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = vp.width
        canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
      } catch {}
    }
    render()
    return () => { cancelled = true }
  }, [pdfDoc, pageNum])

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
      <canvas ref={canvasRef} className="thumb-canvas" />
      <span className="thumb-n">{pageNum}</span>
    </button>
  )
}

function TOCTree({ items, pdfDoc, onPageJump, depth = 0 }) {
  const jump = async (item) => {
    if (!item.dest || !pdfDoc) return
    try {
      let dest = typeof item.dest === 'string' ? await pdfDoc.getDestination(item.dest) : item.dest
      if (dest) {
        const idx = await pdfDoc.getPageIndex(dest[0])
        onPageJump(idx + 1)
      }
    } catch {}
  }
  return (
    <ul className="toc-list" style={{ paddingLeft: depth * 10 }}>
      {items.map((item, i) => (
        <li key={i}>
          <button className="toc-btn" onClick={() => jump(item)}>{item.title}</button>
          {item.items?.length > 0 && <TOCTree items={item.items} pdfDoc={pdfDoc} onPageJump={onPageJump} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function GeneratedContents({ items, onPageJump }) {
  return (
    <ul className="toc-list generated-toc">
      {items.map((item, index) => (
        <li key={`${item.page}-${index}`}>
          <button className="toc-btn generated" onClick={() => onPageJump(item.page)} title={`Go to page ${item.page}`}>
            <span>{item.title}</span>
            <small>{item.page}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function Sidebar({ open, outline, generatedOutline, currentPage, onPageJump, pdfDoc }) {
  const [tab, setTab] = useState('pages')
  const [pageCount, setPageCount] = useState(0)

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
        <button className={`sb-tab ${tab === 'toc' ? 'on' : ''}`} onClick={() => setTab('toc')}>Contents</button>
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
            ? <TOCTree items={outline} pdfDoc={pdfDoc} onPageJump={onPageJump} />
            : generatedOutline.length > 0
              ? <GeneratedContents items={generatedOutline} onPageJump={onPageJump} />
              : <p className="no-toc">No readable contents found</p>
        )}
      </div>
    </div>
  )
}
