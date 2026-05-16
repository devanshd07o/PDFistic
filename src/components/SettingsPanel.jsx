import { useEffect, useRef } from 'react'
import './SettingsPanel.css'

// ── Shared font list (also imported by App.jsx) ────────────────────────────────
export const PREMIUM_FONTS = [
  { id: 'system',       name: 'System UI',        value: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif" },
  { id: 'inter',        name: 'Inter',            value: "'Inter', sans-serif" },
  { id: 'jetbrains',    name: 'JetBrains Mono',   value: "'JetBrains Mono', monospace" },
  { id: 'merriweather', name: 'Merriweather',     value: "'Merriweather', Georgia, serif" },
  { id: 'lato',         name: 'Lato',             value: "'Lato', 'Helvetica Neue', sans-serif" },
  { id: 'playfair',     name: 'Playfair Display', value: "'Playfair Display', serif" },
  { id: 'nunito',       name: 'Nunito',           value: "'Nunito', sans-serif" },
  { id: 'dmsans',       name: 'DM Sans',          value: "'DM Sans', sans-serif" },
  { id: 'crimson',      name: 'Crimson Pro',      value: "'Crimson Pro', serif" },
]

const HIGHLIGHT_COLORS = [
  { value: '#facc15', label: 'Amber' },
  { value: '#fb7185', label: 'Rose' },
  { value: '#38bdf8', label: 'Sky' },
  { value: '#4ade80', label: 'Emerald' },
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#fb923c', label: 'Orange' },
]

const PEN_COLORS = [
  { value: 'rainbow', label: 'Rainbow 🌈' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f59e0b', label: 'Gold' },
  { value: '#10b981', label: 'Teal' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#0f766e', label: 'Deep Teal' },
]

// ── Tiny icon ──────────────────────────────────────────────────────────────────
const SI = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="sp-section">
      <div className="sp-section-title">{title}</div>
      {children}
    </div>
  )
}

// ── Label + control row ────────────────────────────────────────────────────────
function Row({ icon, label, children }) {
  return (
    <div className="sp-row">
      <div className="sp-row-label">
        {icon && <SI d={icon} size={12} />}
        {label}
      </div>
      <div className="sp-row-ctrl">{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SettingsPanel({
  open, onClose, theme, pdfDoc,
  zoom, setZoom, fitMode, setFitMode, rotation, setRotation,
  penColor, setPenColor,
  setTheme,
  highlightColor, setHighlightColor,
  fontId, setFontId, fontSize, setFontSize,
  setToolMode,
  penSize, setPenSize,
  onDownload, onOpenKeyVault,
  aiMessages, onExportChat, onClearChat, aiIsLoading,
}) {
  const panelRef = useRef(null)
  const dis = !pdfDoc
  const hasElectron = Boolean(window.electronAPI)

  // ── Close on Escape + click-outside ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    let timer = null
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    timer = setTimeout(() => window.addEventListener('mousedown', onDown), 80)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      clearTimeout(timer)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={`settings-panel ${theme}`} ref={panelRef} role="dialog" aria-label="Settings">
      <div className="sp-caret" />

      {/* ── VIEW ─────────────────────────────────────── */}
      <Section title="View">
        <Row icon="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" label="Zoom">
          <button className="sp-icon-btn" disabled={dis}
            onClick={() => { setFitMode('custom'); setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))) }}>
            −
          </button>
          <span className="sp-zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="sp-icon-btn" disabled={dis}
            onClick={() => { setFitMode('custom'); setZoom(z => Math.min(4, +(z + 0.25).toFixed(2))) }}>
            +
          </button>
        </Row>
        <Row label="">
          <button className="sp-pill" disabled={dis}
            onClick={() => { setFitMode('custom'); setZoom(1.0) }}>
            100%
          </button>
          <button className={`sp-pill ${fitMode === 'width' ? 'active' : ''}`} disabled={dis}
            onClick={() => setFitMode(fitMode === 'width' ? 'custom' : 'width')}>
            Fit Width
          </button>
          <button className="sp-pill sp-pill-icon" disabled={dis}
            onClick={() => setRotation(r => (r + 90) % 360)}
            title="Rotate 90°">
            <SI d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" size={12} />
            Rotate
          </button>
        </Row>
      </Section>

      <div className="sp-divider" />

      {/* ── APPEARANCE ───────────────────────────────── */}
      <Section title="Appearance">
        <Row icon="M12 3v1m0 16v1m8.66-13l-.87.5M4.21 17.5l-.87.5M20.66 17.5l-.87-.5M4.21 6.5l-.87-.5M21 12h-1M4 12H3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" label="Theme">
          <div className="sp-theme-seg">
            <button className={`sp-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              <SI d="M12 3v1m0 16v1m8.66-13l-.87.5M4.21 17.5l-.87.5M20.66 17.5l-.87-.5M4.21 6.5l-.87-.5M21 12h-1M4 12H3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" size={11} />
              Light
            </button>
            <button className={`sp-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              <SI d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" size={11} />
              Dark
            </button>
          </div>
        </Row>
        <Row icon="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" label="Highlights">
          <div className="sp-swatches">
            {HIGHLIGHT_COLORS.map(({ value, label }) => (
              <button
                key={value}
                className={`sp-swatch ${highlightColor === value ? 'active' : ''}`}
                style={{ '--c': value }}
                onClick={() => setHighlightColor(value)}
                disabled={dis}
                title={label}
              />
            ))}
          </div>
        </Row>
        <Row icon="M12 4.5V3a3 3 0 0 0-3-3 3 3 0 0 0-3 3v1.5M4 10.5v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M8 10.5V6a4 4 0 0 1 8 0v4.5" label="Pen Colors">
          <div className="sp-swatches">
            {PEN_COLORS.map(({ value, label }) => (
              <button
                key={value}
                className={`sp-swatch ${value === 'rainbow' ? 'sp-swatch-rainbow' : ''} ${penColor === value ? 'active' : ''}`}
                style={value === 'rainbow' ? {} : { '--c': value }}
                onClick={() => setPenColor(value)}
                disabled={dis}
                title={label}
              />
            ))}
          </div>
        </Row>
        <Row icon="M3 11h4l2 8 4-16 2 8h4" label={`Pen Size · ${penSize}px`}>
          <input type="range" min={0.4} max={4} step={0.1} value={penSize}
            className="sp-range"
            disabled={dis}
            onChange={e => setPenSize(Number(e.target.value))} />
        </Row>
      </Section>

      <div className="sp-divider" />

      {/* ── AI CHAT FONT ─────────────────────────────── */}
      <Section title="AI Chat Font">
        <Row icon="M4 7h16M4 12h10M4 17h6" label="Family">
          <select className="sp-select sp-font-sel" value={fontId}
            onChange={e => setFontId(e.target.value)}>
            {PREMIUM_FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Row>
        <Row icon="M3 8h2M5 8l12 0M7 13h2M9 13l7 0" label={`Size · ${fontSize}px`}>
          <div className="sp-size-track">
            <span className="sp-sz-a sm">A</span>
            <input type="range" min={11} max={18} step={1} value={fontSize}
              className="sp-range"
              onChange={e => setFontSize(Number(e.target.value))} />
            <span className="sp-sz-a lg">A</span>
          </div>
        </Row>
      </Section>

      <div className="sp-divider" />

      {/* ── TOOLS ────────────────────────────────────── */}
      <Section title="Tools">
        <div className="sp-grid">
          <button className="sp-tile" disabled={dis} onClick={() => window.print()}>
            <SI d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" size={15} />
            <span>Print</span>
          </button>
          <button className="sp-tile" disabled={dis} onClick={onDownload}>
            <SI d="M12 3v12M7 10l5 5 5-5M5 21h14" size={15} />
            <span>Download PDF</span>
          </button>
        </div>
      </Section>

      {/* ── AI CHAT ACTIONS ──────────────────────────── */}
      {aiMessages?.length > 0 && (
        <>
          <div className="sp-divider" />
          <Section title="AI Chat">
            <div className="sp-grid sp-grid-2">
              <button className="sp-tile" onClick={onExportChat}>
                <SI d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" size={15} />
                <span>Export Chat</span>
              </button>
              <button className="sp-tile sp-tile-danger" disabled={aiIsLoading} onClick={onClearChat}>
                <SI d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" size={15} />
                <span>Clear Chat</span>
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}