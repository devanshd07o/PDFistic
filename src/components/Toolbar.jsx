import { useEffect, useRef, useState } from 'react'
import SettingsPanel from './SettingsPanel'

const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

export default function Toolbar({
  // Page nav
  currentPage, totalPages, onPageChange, pdfDoc,
  // Sidebar
  setSidebarOpen,
  // File
  onOpenFile,
  // Highlight
  toolMode, setToolMode, highlightColor,
  onClearHighlights, highlightsOnPage,
  // Search
  searchQuery, setSearchQuery, searchResults, searchIndex,
  isSearching, onRunSearch, onStepSearchResult,
  // Theme (passed through to settings)
  theme,
  // Settings panel props ─────────────────────────────────────────────────────
  zoom, setZoom, fitMode, setFitMode, rotation, setRotation,
  setTheme,
  setHighlightColor,
  fontId, setFontId, fontSize, setFontSize,
  onCreateDesktopShortcut, shortcutStatus,
  onDownload, onOpenKeyVault,
  aiMessages, onExportChat, onClearChat, aiIsLoading,
}) {
  const [pageInput, setPageInput]     = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const searchInputRef = useRef(null)
  const settingsBtnRef = useRef(null)
  const dis = !pdfDoc

  const searchLabel = isSearching
    ? '…'
    : searchResults.length > 0
      ? `${searchIndex + 1}/${searchResults.length}`
      : searchQuery ? '0/0' : ''

  // Focus search shortcut
  useEffect(() => {
    const focus = () => { searchInputRef.current?.focus(); searchInputRef.current?.select() }
    window.addEventListener('pdfistic-focus-search', focus)
    return () => window.removeEventListener('pdfistic-focus-search', focus)
  }, [])

  const handlePageKey = (e) => {
    if (e.key === 'Enter') {
      const p = parseInt(pageInput, 10)
      if (Number.isFinite(p)) onPageChange(p)
      setPageInput(''); e.target.blur()
    }
    if (e.key === 'Escape') { setPageInput(''); e.target.blur() }
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') onRunSearch(searchQuery)
    if (e.key === 'Escape') { setSearchQuery(''); onRunSearch(''); e.target.blur() }
  }

  // Close settings when clicking the settings button while open
  const toggleSettings = () => setSettingsOpen(o => !o)

  return (
    <>
      <div className={`toolbar ${theme}`}>

        {/* ── LEFT ── sidebar + open ── */}
        <div className="tb-left">
          <div className="tb-group">
            <button className="tb-btn icon-btn" type="button"
              onClick={() => setSidebarOpen(s => !s)} title="Sidebar (Ctrl+B)">
              <Icon d="M3 12h18M3 6h18M3 18h18" />
            </button>
            <div className="tb-group-divider" />
            <button className="tb-btn open-btn" type="button"
              onClick={onOpenFile} title="Open PDF (Ctrl+O)">
              <Icon d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1" size={13} />
              Open
            </button>
          </div>
        </div>

        {/* ── CENTER ── page nav + find ── */}
        <div className="tb-center">
          <div className="tb-group tb-group-nav">
            <button className="tb-btn icon-btn" type="button"
              onClick={() => onPageChange(1)} disabled={dis || currentPage <= 1} title="First Page">
              <Icon d="M11 18l-6-6 6-6M19 18l-6-6 6-6" />
            </button>
            <button className="tb-btn icon-btn" type="button"
              onClick={() => onPageChange(currentPage - 1)} disabled={dis || currentPage <= 1} title="Prev (←)">
              <Icon d="M15 18l-6-6 6-6" />
            </button>
            <div className="page-info">
              <input
                className="page-input" type="number"
                value={pageInput !== '' ? pageInput : (pdfDoc ? currentPage : '')}
                min={1} max={totalPages}
                onChange={e => setPageInput(e.target.value)}
                onKeyDown={handlePageKey}
                onFocus={e => e.target.select()}
                onBlur={() => setPageInput('')}
                disabled={dis} placeholder="—"
              />
              <span className="page-sep">/ {totalPages || '—'}</span>
            </div>
            <button className="tb-btn icon-btn" type="button"
              onClick={() => onPageChange(currentPage + 1)} disabled={dis || currentPage >= totalPages} title="Next (→)">
              <Icon d="M9 18l6-6-6-6" />
            </button>
            <button className="tb-btn icon-btn" type="button"
              onClick={() => onPageChange(totalPages)} disabled={dis || currentPage >= totalPages} title="Last Page">
              <Icon d="M5 18l6-6-6-6M13 18l6-6-6-6" />
            </button>
          </div>

          <div className="tb-group tb-group-search">
            <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" size={13} />
            <input
              ref={searchInputRef}
              className="search-input" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              disabled={dis}
              placeholder="Find…"
              title="Find Text (Ctrl+F)"
            />
            {searchLabel && <span className="search-count">{searchLabel}</span>}
            <button className="mini-btn" type="button"
              onClick={() => onStepSearchResult(-1)} disabled={dis || searchResults.length === 0} title="Prev match">
              <Icon d="M18 15l-6-6-6 6" size={12} />
            </button>
            <button className="mini-btn" type="button"
              onClick={() => onStepSearchResult(1)} disabled={dis || searchResults.length === 0} title="Next match">
              <Icon d="M6 9l6 6 6-6" size={12} />
            </button>
          </div>
        </div>

        {/* ── RIGHT ── highlight tools + settings ── */}
        <div className="tb-right">
          <div className="tb-group">
            <button
              className={`tb-btn icon-btn ${toolMode === 'highlight' ? 'active' : ''}`}
              type="button"
              onClick={() => setToolMode(toolMode === 'highlight' ? 'select' : 'highlight')}
              disabled={dis} title="Highlight Tool (H)">
              <Icon d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
              {toolMode === 'highlight' && (
                <span className="tb-color-pip" style={{ background: highlightColor }} />
              )}
            </button>
            <button
              className="tb-btn icon-btn"
              type="button"
              onClick={onClearHighlights}
              disabled={dis || highlightsOnPage === 0}
              title="Clear Highlights on Page">
              <Icon d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
            </button>
          </div>

          <button
            ref={settingsBtnRef}
            className={`tb-btn icon-btn settings-btn ${settingsOpen ? 'active' : ''}`}
            type="button"
            onClick={toggleSettings}
            title="Settings">
            <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </button>
        </div>
      </div>

      {/* ── Settings Panel ── */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme} pdfDoc={pdfDoc}
        zoom={zoom} setZoom={setZoom} fitMode={fitMode} setFitMode={setFitMode}
        rotation={rotation} setRotation={setRotation}
        setTheme={setTheme}
        highlightColor={highlightColor} setHighlightColor={setHighlightColor}
        fontId={fontId} setFontId={setFontId}
        fontSize={fontSize} setFontSize={setFontSize}
        onCreateDesktopShortcut={onCreateDesktopShortcut}
        shortcutStatus={shortcutStatus}
        onDownload={onDownload}
        onOpenKeyVault={onOpenKeyVault}
        aiMessages={aiMessages}
        onExportChat={onExportChat}
        onClearChat={onClearChat}
        aiIsLoading={aiIsLoading}
      />
    </>
  )
}