import { useEffect, useRef, useState } from 'react'
const ZOOMS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0]
const HIGHLIGHT_COLORS = ['#facc15', '#fb7185', '#38bdf8', '#4ade80']

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

export default function Toolbar({
  currentPage, totalPages, zoom, setZoom, theme, setTheme, setSidebarOpen,
  onOpenFile, onPageChange, onCreateDesktopShortcut, shortcutStatus,
  toolMode, setToolMode, highlightColor, setHighlightColor, onClearHighlights, highlightsOnPage,
  rotation, setRotation, fitMode, setFitMode, pdfDoc,
  searchQuery, setSearchQuery, searchResults, searchIndex, isSearching, onRunSearch, onStepSearchResult,
  onDownload, onOpenKeyVault
}) {
  const [pageInput, setPageInput] = useState('')
  const searchInputRef = useRef(null)
  const dis = !pdfDoc
  const zoomOptions = ZOOMS.some(level => Math.abs(level - zoom) < 0.001)
    ? ZOOMS
    : [...ZOOMS, zoom].sort((a, b) => a - b)
  const searchLabel = isSearching
    ? '...'
    : searchResults.length > 0
      ? `${searchIndex + 1}/${searchResults.length}`
      : searchQuery
        ? '0/0'
        : ''

  useEffect(() => {
    const focusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener('pdfistic-focus-search', focusSearch)
    return () => window.removeEventListener('pdfistic-focus-search', focusSearch)
  }, [])

  const handlePageKey = (e) => {
    if (e.key === 'Enter') {
      const p = parseInt(pageInput, 10)
      if (Number.isFinite(p)) onPageChange(p)
      setPageInput('')
      e.target.blur()
    }
    if (e.key === 'Escape') { setPageInput(''); e.target.blur() }
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') onRunSearch(searchQuery)
    if (e.key === 'Escape') {
      setSearchQuery('')
      onRunSearch('')
      e.target.blur()
    }
  }

  return (
    <div className={`toolbar ${theme}`}>
      <div className="tb-left">
        <button className="tb-btn icon-btn" type="button" onClick={() => setSidebarOpen(s => !s)} title="Toggle Sidebar (Ctrl+B)">
          <Icon d="M3 12h18M3 6h18M3 18h18" />
        </button>
        <button className="tb-btn open-btn" type="button" onClick={onOpenFile} title="Open PDF (Ctrl+O)">
          <Icon d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1" size={14} />
          Open
        </button>
        {window.electronAPI && (
          <button className="tb-btn icon-btn desktop-btn" type="button" onClick={onCreateDesktopShortcut} title="Add PDFistic to Desktop">
            <Icon d="M4 5h16v11H4zM9 20h6M12 16v4" />
          </button>
        )}
        {shortcutStatus && <span className="shortcut-status">{shortcutStatus}</span>}
      </div>

      <div className="tb-center">
        <button className="tb-btn icon-btn" type="button" onClick={() => onPageChange(1)} disabled={dis || currentPage <= 1} title="First Page (Home)">
          <Icon d="M11 18l-6-6 6-6M19 18l-6-6 6-6" />
        </button>
        <button className="tb-btn icon-btn" type="button" onClick={() => onPageChange(currentPage - 1)} disabled={dis || currentPage <= 1} title="Previous Page (←)">
          <Icon d="M15 18l-6-6 6-6" />
        </button>
        <div className="page-info">
          <input
            className="page-input"
            type="number"
            value={pageInput !== '' ? pageInput : (pdfDoc ? currentPage : '')}
            min={1} max={totalPages}
            onChange={e => setPageInput(e.target.value)}
            onKeyDown={handlePageKey}
            onFocus={e => e.target.select()}
            onBlur={() => setPageInput('')}
            disabled={dis}
            placeholder="—"
          />
          <span className="page-sep">/ {totalPages || '—'}</span>
        </div>
        <button className="tb-btn icon-btn" type="button" onClick={() => onPageChange(currentPage + 1)} disabled={dis || currentPage >= totalPages} title="Next Page (→)">
          <Icon d="M9 18l6-6-6-6" />
        </button>
        <button className="tb-btn icon-btn" type="button" onClick={() => onPageChange(totalPages)} disabled={dis || currentPage >= totalPages} title="Last Page (End)">
          <Icon d="M5 18l6-6-6-6M13 18l6-6-6-6" />
        </button>
      </div>

      <div className="tb-right">
        <button className="tb-btn icon-btn" type="button" onClick={() => setZoom(z => +(z - 0.25).toFixed(2))} disabled={dis} title="Zoom Out (Ctrl+-)">
          <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zM8 11h6" />
        </button>
        <select className="zoom-sel" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} disabled={dis} title="Zoom">
          {zoomOptions.map(l => <option key={l} value={l}>{Math.round(l * 100)}%</option>)}
        </select>
        <button className="tb-btn icon-btn" type="button" onClick={() => setZoom(z => +(z + 0.25).toFixed(2))} disabled={dis} title="Zoom In (Ctrl+=)">
          <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zM11 8v6M8 11h6" />
        </button>
        <button className="tb-btn txt-btn" type="button" onClick={() => setZoom(1.0)} disabled={dis} title="Actual Size (Ctrl+0)">100%</button>
        <button className={`tb-btn txt-btn ${fitMode === 'width' ? 'active' : ''}`} type="button" onClick={() => setFitMode('width')} disabled={dis} title="Fit Width">Fit</button>
        <button className="tb-btn icon-btn" type="button" onClick={() => setRotation((rotation + 90) % 360)} disabled={dis} title="Rotate Clockwise (R)">
          <Icon d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </button>

        <div className="tb-sep" />

        <div className="search-box">
          <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" size={14} />
          <input
            ref={searchInputRef}
            className="search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            disabled={dis}
            placeholder="Find"
            title="Find Text (Ctrl+F)"
          />
          {searchLabel && <span className="search-count">{searchLabel}</span>}
          <button className="mini-btn" type="button" onClick={() => onStepSearchResult(-1)} disabled={dis || searchResults.length === 0} title="Previous Match">
            <Icon d="M18 15l-6-6-6 6" size={13} />
          </button>
          <button className="mini-btn" type="button" onClick={() => onStepSearchResult(1)} disabled={dis || searchResults.length === 0} title="Next Match">
            <Icon d="M6 9l6 6 6-6" size={13} />
          </button>
        </div>

        <div className="tb-sep" />

        <button className={`tb-btn tool-btn ${toolMode === 'select' ? 'active' : ''}`} type="button" onClick={() => setToolMode('select')} disabled={dis} title="Select / Scroll">
          <Icon d="M4 3l7 17 2-7 7-2z" />
        </button>
        <button className={`tb-btn tool-btn ${toolMode === 'highlight' ? 'active' : ''}`} type="button" onClick={() => setToolMode(toolMode === 'highlight' ? 'select' : 'highlight')} disabled={dis} title="Highlight (H)">
          <Icon d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
        </button>
        <div className="swatches" aria-label="Highlight colors">
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color}
              className={`swatch ${highlightColor === color ? 'active' : ''}`}
              type="button"
              style={{ '--swatch': color }}
              onClick={() => setHighlightColor(color)}
              disabled={dis}
              title="Highlight Color"
            />
          ))}
        </div>
        <button className="tb-btn icon-btn" type="button" onClick={onClearHighlights} disabled={dis || highlightsOnPage === 0} title="Clear Highlights on Current Page">
          <Icon d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
        </button>

        <div className="tb-sep" />

        <button className="tb-btn icon-btn" type="button" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
          {theme === 'dark'
            ? <Icon d="M12 3v1m0 16v1m8.66-13l-.87.5M4.21 17.5l-.87.5M20.66 17.5l-.87-.5M4.21 6.5l-.87-.5M21 12h-1M4 12H3m15.36-5.64l-.7.7M6.34 17.66l-.7.7M17.66 17.66l.7.7M6.34 6.34l.7.7M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            : <Icon d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          }
        </button>
        <button className="tb-btn icon-btn" type="button" onClick={() => window.print()} disabled={dis} title="Print (Ctrl+P)">
          <Icon d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
        </button>
        <button className="tb-btn icon-btn" type="button" onClick={onDownload} disabled={dis} title="Download / Save Copy">
          <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </button>
        <button className="tb-btn icon-btn" type="button" onClick={onOpenKeyVault} title="API Keys">
          <Icon d="M21 2l-2 2M7.5 11.5a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM12 12l8-8 2 2-8 8M16 6l2 2" />
        </button>
      </div>
    </div>
  )
}
