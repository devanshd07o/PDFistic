import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { buildMessages, streamAI, getProvider, PROVIDERS } from '../utils/aiCall'
import hljs from 'highlight.js'
import ReactECharts from 'echarts-for-react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import ReactDiffViewer from 'react-diff-viewer-continued'
import './AIPanel.css'

// ── Pyodide loader (lazy, singleton) ──────────────────────────────────────────
let _pyodidePromise = null
function loadPyodide() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.pyodide) return Promise.resolve(window.pyodide)
  if (_pyodidePromise) return _pyodidePromise
  _pyodidePromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js'
    script.onload = () => {
      window.loadPyodide().then(py => {
        window.pyodide = py
        resolve(py)
      }).catch(() => resolve(null))
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return _pyodidePromise
}

// ── KaTeX loader (lazy, singleton) ────────────────────────────────────────────
let _katexPromise = null
function loadKatex() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.katex && window.katex.mhchem) return Promise.resolve(window.katex)
  if (_katexPromise) return _katexPromise
  _katexPromise = new Promise((resolve) => {
    const loadScript = (src) => new Promise((res, rej) => {
      const script = document.createElement('script')
      script.src = src
      script.crossOrigin = 'anonymous'
      script.onload = res
      script.onerror = rej
      document.head.appendChild(script)
    })
    loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js')
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js'))
      .then(() => {
        window.katex.mhchem = true
        resolve(window.katex)
      })
      .catch(() => { _katexPromise = null; resolve(null) })
  })
  return _katexPromise
}

// ── Inline math component ($...$) ─────────────────────────────────────────────
function MathInline({ tex }) {
  const [html, setHtml]     = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    loadKatex().then(katex => {
      if (!katex) { setFailed(true); return }
      try {
        setHtml(katex.renderToString(tex, {
          throwOnError: false,
          displayMode: false,
          output: 'html',
          strict: 'ignore',
        }))
      } catch { setFailed(true) }
    })
  }, [tex])
  if (failed) return <code className="ai-math-error">{tex}</code>
  if (!html)  return <code className="ai-inline-code">{tex}</code>
  return <span className="ai-math-inline" dangerouslySetInnerHTML={{ __html: html }} />
}

// ── Display math component ($$...$$) ──────────────────────────────────────────
function MathDisplay({ tex }) {
  const [html, setHtml]     = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    loadKatex().then(katex => {
      if (!katex) { setFailed(true); return }
      try {
        setHtml(katex.renderToString(tex, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
          strict: 'ignore',
        }))
      } catch { setFailed(true) }
    })
  }, [tex])
  if (failed) return <pre className="ai-code-block" style={{ margin: '8px 0' }}><code>{tex}</code></pre>
  if (!html)  return null
  return <div className="ai-math-display" dangerouslySetInnerHTML={{ __html: html }} />
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MIC_PAUSE_MS = 2000

const PROMPT_TEMPLATES = [
  { label: 'Summarize',  emoji: '📝', text: 'Summarize this page in bullet points.',              desc: 'Key points, fast' },
  { label: 'Quiz me',    emoji: '❓', text: 'Generate 3 quiz questions from this page.',           desc: 'Test yourself' },
  { label: 'Explain',    emoji: '📖', text: 'Explain the key concepts on this page simply.',       desc: 'Plain language' },
  { label: 'Key terms',  emoji: '🔑', text: 'List the key terms and their definitions from this page.', desc: 'Glossary view' },
]

// ── Icons ─────────────────────────────────────────────────────────────────────
const BrainIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a4 4 0 0 0 4 4h1" />
    <path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a4 4 0 0 1-4 4h-1" />
    <path d="M12 6v15" />
    <path d="M8 8h2" /><path d="M14 8h2" />
  </svg>
)
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
  </svg>
)
const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 15l6-6 6 6" />
  </svg>
)
const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)
const RegenIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>
  </svg>
)
const MicIcon = ({ active }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/>
  </svg>
)
const SparkleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/>
  </svg>
)
const ExpandIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
  </svg>
)
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
)

// ── Clipboard ─────────────────────────────────────────────────────────────────
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text).catch(() => execCopy(text))
  return execCopy(text)
}
function execCopy(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none'
    document.body.appendChild(ta); ta.focus(); ta.select()
    try { document.execCommand('copy') ? resolve() : reject() }
    catch(e) { reject(e) } finally { document.body.removeChild(ta) }
  })
}

// ── Language → accent colour ──────────────────────────────────────────────────
const LANG_COLORS = {
  js: '#f7df1e', javascript: '#f7df1e', ts: '#3178c6', typescript: '#3178c6',
  jsx: '#61dafb', tsx: '#61dafb', react: '#61dafb',
  py: '#3572a5', python: '#3572a5',
  rs: '#dea584', rust: '#dea584',
  go: '#00acd7', golang: '#00acd7',
  css: '#563d7c', html: '#e34c26', xml: '#e34c26',
  json: '#cbcb41', yaml: '#cb171e', yml: '#cb171e',
  sh: '#89e051', bash: '#89e051', shell: '#89e051', zsh: '#89e051',
  sql: '#e38c00', java: '#b07219', kt: '#A97BFF', kotlin: '#A97BFF',
  cpp: '#f34b7d', c: '#555555', cs: '#178600',
  rb: '#701516', ruby: '#701516', php: '#4f5d95',
  swift: '#ffac45', dart: '#00b4ab',
  md: '#083fa1', markdown: '#083fa1',
}

let mermaidInitialized = false

function normalizeMermaidCode(code) {
  return code
    .replace(/[–—−―]/g, '-')
    .replace(/→|⇒|⟶|⟹/g, '-->')
    .replace(/←|⇐|⟵|⟸/g, '<--')
    .replace(/↔|⇔|⟷|⟺/g, '<-->')
    .replace(/\|\s+([^|]+?)\s+\|/g, '|$1|')
}

function MermaidBlock({ code }) {
  const [svg, setSvg] = useState(null)
  const sanitizedCode = normalizeMermaidCode(code)
  const id = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`)

  useEffect(() => {
    let mounted = true
    const renderChart = async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, theme: 'default' })
          mermaidInitialized = true
        }
        const { svg: renderedSvg } = await mermaid.render(id.current, sanitizedCode)
        if (mounted) setSvg(renderedSvg)
      } catch (err) {
        if (mounted) setSvg(`<pre class="ai-math-error" style="color:red;padding:10px">${err.message}</pre>`)
      }
    }
    renderChart()
    return () => { mounted = false }
  }, [sanitizedCode])

  if (!svg) return <div className="ai-mermaid-loading">Rendering diagram…</div>
  return <div className="ai-mermaid-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
}

// ── Advanced Blocks ─────────────────────────────────────────────────────────────
function ChartBlock({ code }) {
  const [options, setOptions] = useState(null)
  useEffect(() => {
    try { setOptions(JSON.parse(code)) } catch { setOptions(null) }
  }, [code])
  if (!options) return <div className="ai-math-error">Invalid chart JSON</div>
  return <ReactECharts option={options} style={{ height: 350, marginTop: 10, marginBottom: 10 }} />
}

function MapBlock({ code }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    try { setData(JSON.parse(code)) } catch { setData(null) }
  }, [code])
  if (!data) return <div className="ai-math-error">Invalid map JSON</div>
  const position = [data.lat || 0, data.lng || 0]
  return (
    <div style={{ height: 300, width: '100%', marginTop: 10, marginBottom: 10, borderRadius: 8, overflow: 'hidden', zIndex: 1 }}>
      <MapContainer center={position} zoom={data.zoom || 13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
        {data.marker && <Marker position={position}><Popup>{data.marker}</Popup></Marker>}
      </MapContainer>
    </div>
  )
}

function SandboxBlock({ lang, code }) {
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  
  const runCode = async () => {
    setRunning(true); setOutput('Running...')
    if (lang.includes('py')) {
      const pyodide = await loadPyodide()
      if (!pyodide) { setOutput('Failed to load Pyodide'); setRunning(false); return }
      try {
        let stdout = ''
        pyodide.setStdout({ batched: (str) => stdout += str + '\n' })
        await pyodide.runPythonAsync(code)
        setOutput(stdout || 'Success (no output)')
      } catch (e) { setOutput(e.toString()) }
    } else if (lang.includes('js') || lang.includes('javascript')) {
      let stdout = ''
      const ogLog = console.log
      console.log = (...args) => stdout += args.map(a=>typeof a==='object'?JSON.stringify(a):a).join(' ') + '\n'
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code)
        fn()
        setOutput(stdout || 'Success (no output)')
      } catch (e) { setOutput(stdout + '\nError: ' + e.toString()) }
      finally { console.log = ogLog }
    } else { setOutput('Sandboxing not supported for this language.') }
    setRunning(false)
  }

  return (
    <div className="ai-sandbox">
      <CodeBlock lang={lang} code={code} />
      <div className="ai-sandbox-actions">
        <button onClick={runCode} disabled={running} className="ai-sandbox-run">
          {running ? 'Running...' : '▶ Run Code'}
        </button>
      </div>
      {output && <pre className="ai-sandbox-output">{output}</pre>}
    </div>
  )
}

function RichDiffBlock({ code }) {
  const oldCode = code.split('\n').filter(l => !l.startsWith('+') || l.startsWith('+++')).map(l => l.replace(/^-/, '')).join('\n')
  const newCode = code.split('\n').filter(l => !l.startsWith('-') || l.startsWith('---')).map(l => l.replace(/^\+/, '')).join('\n')
  return (
    <div className="ai-diff-viewer">
      <ReactDiffViewer oldValue={oldCode} newValue={newCode} splitView={false} useDarkTheme={true} hideLineNumbers={false} />
    </div>
  )
}

function TimelineBlock({ code, onPageJump }) {
  const lines = code.split('\n').filter(l => l.trim())
  return (
    <div className="ai-timeline">
      {lines.map((line, i) => {
        const [title, ...desc] = line.split(':')
        return (
          <div key={i} className="ai-timeline-node">
            <div className="ai-timeline-title">{parseInline(title.trim(), onPageJump)}</div>
            <div className="ai-timeline-desc">{parseInline(desc.join(':').trim(), onPageJump)}</div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanBlock({ code, onPageJump }) {
  const lines = code.split('\n')
  const columns = []
  let currentCol = null
  for (const line of lines) {
    if (line.match(/^#{1,6}\s+(.*)/)) {
      currentCol = { title: line.replace(/^#{1,6}\s+/, ''), tasks: [] }
      columns.push(currentCol)
    } else if (line.match(/^[-*]\s+(.*)/) && currentCol) {
      currentCol.tasks.push(line.replace(/^[-*]\s+/, ''))
    }
  }
  return (
    <div className="ai-kanban-board">
      {columns.map((col, i) => (
        <div key={i} className="ai-kanban-col">
          <div className="ai-kanban-title">{parseInline(col.title, onPageJump)}</div>
          <div className="ai-kanban-tasks">
            {col.tasks.map((task, j) => (
              <div key={j} className="ai-kanban-card">{parseInline(task, onPageJump)}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AdvancedTable({ children, headers, rows, aligns = [], caption, onPageJump }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)

  const handleSort = (idx) => {
    if (sortCol === idx) setSortAsc(!sortAsc)
    else { setSortCol(idx); setSortAsc(true) }
  }

  let sortedRows = [...rows]
  if (sortCol !== null) {
    sortedRows.sort((a, b) => {
      const aVal = a[sortCol]?.text || ''
      const bVal = b[sortCol]?.text || ''
      const numA = parseFloat(aVal)
      const numB = parseFloat(bVal)
      if (!isNaN(numA) && !isNaN(numB)) return sortAsc ? numA - numB : numB - numA
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }

  const exportCsv = () => {
    const csvContent = [
      headers.map(h => `"${h.text.replace(/"/g, '""')}"`).join(','),
      ...sortedRows.map(row => row.map(cell => `"${cell.text.replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = 'table.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="ai-table-wrap">
      <div className="ai-table-actions"><button className="ai-table-export" onClick={exportCsv}>⬇ CSV</button></div>
      <table className="ai-table">
        {caption && <caption className="ai-table-caption">{caption}</caption>}
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: aligns[i] || 'left', cursor: 'pointer' }} onClick={() => handleSort(i)}>
                {parseInline(h.text, onPageJump)} {sortCol === i ? (sortAsc ? '▲' : '▼') : '↕'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{ textAlign: aligns[j] || 'left' }}>
                  {parseInline(c.text, onPageJump)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  let normalLang = lang?.toLowerCase().trim() || ''
  let filename = ''
  let highlightRanges = []

  const braceMatch = normalLang.match(/\{([^}]+)\}/)
  if (braceMatch) {
    normalLang = normalLang.replace(braceMatch[0], '').trim()
    highlightRanges = braceMatch[1].split(',').map(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-')
        return { start: parseInt(start), end: parseInt(end) }
      }
      return { start: parseInt(part), end: parseInt(part) }
    })
  }

  const colonMatch = normalLang.match(/^([^:]+):(.+)$/)
  if (colonMatch) {
    normalLang = colonMatch[1]
    filename = colonMatch[2]
  }

  const langColor = LANG_COLORS[normalLang] || 'rgba(160,157,245,0.65)'
  const lines = code.split('\n')
  const displayLines = lines[lines.length - 1].trim() === '' ? lines.slice(0, -1) : lines

  const copy = () => {
    copyToClipboard(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  const isHighlighted = (idx) => {
    const num = idx + 1
    return highlightRanges.some(r => num >= r.start && num <= r.end)
  }

  const renderCodeLines = () => {
    return displayLines.map((line, i) => {
      const hlClass = isHighlighted(i) ? ' ai-line-hl' : ''
      let renderedLine = line
      let diffClass = ''
      if (normalLang === 'diff') {
        if (line.startsWith('+')) diffClass = ' ai-line-diff-add'
        else if (line.startsWith('-')) diffClass = ' ai-line-diff-remove'
      } else if (normalLang && hljs.getLanguage(normalLang)) {
        try { renderedLine = hljs.highlight(line, { language: normalLang }).value } catch {}
      }
      return (
        <div key={i} className={`ai-code-line${hlClass}${diffClass}`} dangerouslySetInnerHTML={{ __html: renderedLine || ' ' }} />
      )
    })
  }

  return (
    <div className={`ai-code-wrap ${normalLang === 'terminal' || normalLang === 'sh' || normalLang === 'bash' ? 'ai-terminal' : ''}`}>
      <div className="ai-code-header">
        <span className="ai-code-dots" aria-hidden="true">
          <span className="ai-code-dot red" /><span className="ai-code-dot yellow" /><span className="ai-code-dot green" />
        </span>
        <span className="ai-code-lang-label" style={{ color: langColor }}>{filename || normalLang || 'code'}</span>
        <button className={`ai-code-copy-btn${copied ? ' copied' : ''}`} type="button" onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="ai-code-body">
        <div className="ai-code-gutter" aria-hidden="true">
          {displayLines.map((_, i) => <div key={i} className={isHighlighted(i) ? 'ai-line-hl-gutter' : ''}>{i + 1}</div>)}
        </div>
        <pre className="ai-code-block"><code>{renderCodeLines()}</code></pre>
      </div>
    </div>
  )
}

// ── File Tree ─────────────────────────────────────────────────────────────────
function FileTree({ code }) {
  const lines = code.split('\n').filter(l => l.trim())
  return (
    <div className="ai-filetree">
      {lines.map((l, i) => <div key={i} className="ai-filetree-line">{l}</div>)}
    </div>
  )
}

// ── Callout ───────────────────────────────────────────────────────────────────
const CALLOUT_META = {
  note:      { icon: 'ℹ️', label: 'Note' },
  info:      { icon: 'ℹ️', label: 'Info' },
  tip:       { icon: '💡', label: 'Tip' },
  success:   { icon: '✅', label: 'Success' },
  warning:   { icon: '⚠️', label: 'Warning' },
  danger:    { icon: '🚨', label: 'Danger' },
  caution:   { icon: '🔥', label: 'Caution' },
  important: { icon: '❗', label: 'Important' },
  question:  { icon: '❓', label: 'Question' },
  bug:       { icon: '🐛', label: 'Bug' },
}
function Callout({ type, lines, onPageJump }) {
  const meta = CALLOUT_META[type] || CALLOUT_META.note
  return (
    <div className={`ai-callout ai-callout-${type}`}>
      <div className="ai-callout-header">
        <span className="ai-callout-icon">{meta.icon}</span>
        <span className="ai-callout-label">{meta.label}</span>
      </div>
      <div className="ai-callout-body">
        {lines.filter(Boolean).map((line, i) => (
          <p key={i} className="ai-p">{parseInline(line, onPageJump)}</p>
        ))}
      </div>
    </div>
  )
}

// ── Image Modal ───────────────────────────────────────────────────────────────
function ImageModal({ src, alt, credit, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div className="ai-img-modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Image viewer">
      <div className="ai-img-modal-inner" onClick={e => e.stopPropagation()}>
        <button className="ai-img-modal-close" onClick={onClose} aria-label="Close image viewer">
          <CloseIcon />
        </button>
        <img src={src} alt={alt} className="ai-img-modal-img" draggable={false} />
        {(alt || credit) && (
          <div className="ai-img-modal-caption">
            {alt && <span className="ai-img-modal-alt">{alt}</span>}
            {credit && <span className="ai-img-modal-credit">via {credit}</span>}
          </div>
        )}
      </div>
      <p className="ai-img-modal-hint">Click outside · Esc to close</p>
    </div>,
    document.body
  )
}

// ── Wikipedia image fetcher ───────────────────────────────────────────────────
const _imgCache = new Map()

async function fetchSearchImage(query) {
  const key = query.toLowerCase().trim()
  if (_imgCache.has(key)) return _imgCache.get(key)

  const signal = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined

  const tryWikiThumb = async (title) => {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=700&origin=*`,
      { signal }
    )
    const data = await res.json()
    const page = Object.values(data?.query?.pages || {})[0]
    if (page?.thumbnail?.source && page.pageid !== -1)
      return { url: page.thumbnail.source, credit: 'Wikipedia', title: page.title }
    return null
  }

  const tryCommons = async (q) => {
    const searchRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=6&format=json&origin=*`,
      { signal }
    )
    const hits = (await searchRes.json())?.query?.search || []
    for (const hit of hits) {
      const infoRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(hit.title)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=700&format=json&origin=*`,
        { signal }
      )
      const page = Object.values((await infoRes.json())?.query?.pages || {})[0]
      const info = page?.imageinfo?.[0]
      if (info?.thumburl && /^image\//i.test(info.mime || ''))
        return { url: info.thumburl, credit: 'Wikimedia Commons', title: hit.title.replace('File:', '') }
    }
    return null
  }

  try {
    const exact = await tryWikiThumb(query)
    if (exact) { _imgCache.set(key, exact); return exact }

    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      { signal }
    )
    for (const hit of (await searchRes.json())?.query?.search || []) {
      const r = await tryWikiThumb(hit.title)
      if (r) { _imgCache.set(key, r); return r }
    }

    const commons = await tryCommons(query)
    if (commons) { _imgCache.set(key, commons); return commons }

  } catch { /* timeout / network */ }

  _imgCache.set(key, null)
  return null
}

// ── Inline Image ──────────────────────────────────────────────────────────────
function InlineImage({ src, alt, searchQuery }) {
  const [imgSrc,    setImgSrc]    = useState(src || null)
  const [credit,    setCredit]    = useState(null)
  const [imgTitle,  setImgTitle]  = useState(alt || searchQuery || '')
  const [loading,   setLoading]   = useState(!src && !!searchQuery)
  const [errored,   setErrored]   = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [modal,     setModal]     = useState(false)

  useEffect(() => {
    if (searchQuery && !src) {
      setLoading(true)
      fetchSearchImage(searchQuery).then(result => {
        if (result) {
          setImgSrc(result.url)
          setCredit(result.credit)
          setImgTitle(result.title || searchQuery)
        } else setErrored(true)
        setLoading(false)
      }).catch(() => { setErrored(true); setLoading(false) })
    }
  }, [searchQuery, src])

  if (errored) return null

  if (loading) return (
    <figure className="ai-img-figure ai-img-figure--loading">
      <div className="ai-img-skeleton">
        <span className="ai-img-skeleton-icon">🔍</span>
        <span>Searching <em>{searchQuery}</em>…</span>
      </div>
      <figcaption className="ai-img-caption">{searchQuery}</figcaption>
    </figure>
  )

  return (
    <>
      <figure
        className={`ai-img-figure${imgLoaded ? ' ai-img-figure--loaded' : ''}`}
        onDoubleClick={() => imgSrc && setModal(true)}
        title="Double-click to expand"
      >
        <div className="ai-img-frame">
          {!imgLoaded && <div className="ai-img-placeholder" />}
          <img
            src={imgSrc} alt={imgTitle}
            className="ai-inline-img"
            onLoad={() => setImgLoaded(true)}
            onError={() => setErrored(true)}
            draggable={false}
          />
          <div className="ai-img-expand-hint" aria-hidden="true">
            <ExpandIcon /><span>Double-click to expand</span>
          </div>
        </div>
        <figcaption className="ai-img-caption">
          <span className="ai-img-caption-text">{imgTitle}</span>
          {credit && <span className="ai-img-credit-badge">{credit}</span>}
        </figcaption>
      </figure>

      {modal && (
        <ImageModal
          src={imgSrc} alt={imgTitle} credit={credit}
          onClose={() => setModal(false)}
        />
      )}
    </>
  )
}

// ── Citation Chip ──────────────────────────────────────────────────────────────
function CitationChip({ page, onPageJump }) {
  return (
    <button
      className="ai-cite-chip"
      type="button"
      onClick={() => onPageJump?.(page)}
      title={`Jump to page ${page}`}
      aria-label={`Go to page ${page}`}
    >
      p.{page}
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const modelLabel = (modelId) => {
  if (!modelId) return 'No model'
  const byProvider = getProvider(modelId)
  if (byProvider) return byProvider.name
  // search by model id across all providers (modelId might be a model string not a provider id)
  for (const p of PROVIDERS) {
    if (p.models?.some(m => m.id === modelId)) return p.name
    if (p.model === modelId) return p.name
  }
  return modelId
}
const formatTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// ── Smart Typography ──────────────────────────────────────────────────────────
function applyTypography(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/---/g, '—')
    .replace(/--/g, '—')
    .replace(/\.\.\./g, '…')
    .replace(/\(c\)/gi, '©')
    .replace(/\(r\)/gi, '®')
    .replace(/\(tm\)/gi, '™')
    .replace(/\b1\/2\b/g, '½')
    .replace(/\b3\/4\b/g, '¾')
    .replace(/(^|\s)"([^"]+)"(?=\s|$|[.,!?])/g, '$1“$2”')
}

// ── Inline parser ─────────────────────────────────────────────────────────────
function parseInline(rawText, onPageJump = null) {
  if (typeof rawText !== 'string') return rawText
  const text = applyTypography(rawText)
  const parts = []
  
  const regex = /(?<progress>\[progress:(?<progVal>\d+)\])|(?<cite>\[p\.(?<citeVal>\d+)\])|(?<bbox>\[bbox:(?<bbPage>\d+):(?<bbX>[0-9.]+),(?<bbY>[0-9.]+),(?<bbW>[0-9.]+),(?<bbH>[0-9.]+)\])|(?<mathDisp>\$\$(?<mathDispVal>[^$]+?)\$\$)|(?<mathTooltip>\$(?<mathTtVal>[^$\n]+?)\|(?<mathTtTxt>[^$]+?)\$)|(?<mathIn>\$(?<mathInVal>[^$\n]+?)\$)|(?<link>\[(?<linkText>[^\]]+?)\]\((?<linkUrl>[^)]+?)\))|(?<badge>\[badge:(?<badgeCol>[a-zA-Z0-9_-]+):(?<badgeLbl>.+?)\])|(?<fn>\[\^(?<fnId>\d+)\])|(?<colortext>\{(?<colorName>[a-zA-Z]+)\}(?<colorVal>.*?)\{\/[a-zA-Z]+\})|(?<colorSwatch>#[A-Fa-f0-9]{3,8}|rgb\([^)]+\))|(?<boldItalic>\*\*\*(?<biVal>.+?)\*\*\*)|(?<bold>\*\*(?<bVal>.+?)\*\*)|(?<italic>\*(?<iVal>.+?)\*)|(?<code>`(?<codeVal>[^`]+)`)|(?<del>~~(?<delVal>.+?)~~)|(?<mark>==(?<markVal>.+?)==)|(?<kbdBracket>\[\[(?<kbdBVal>.+?)\]\])|(?<kbd>\^(?<kbdVal>[^\^]+)\^)|(?<sub>~(?<subVal>[^~]+)~)|(?<u>\+\+(?<uVal>[^\+]+)\+\+)|(?<bareUrl>https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g

  let lastIndex = 0, ki = 0, match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push(<span key={ki++}>{text.slice(lastIndex, match.index)}</span>)

    const g = match.groups
    if (g.progress) parts.push(<progress key={ki++} className="ai-progress" value={g.progVal} max="100" title={`${g.progVal}%`} />)
    else if (g.cite) {
      const pageNum = parseInt(g.citeVal, 10)
      parts.push(onPageJump ? <CitationChip key={ki++} page={pageNum} onPageJump={onPageJump} /> : <span key={ki++} className="ai-cite-chip-static">p.{pageNum}</span>)
    }
    else if (g.bbox) parts.push(<button key={ki++} className="ai-bbox-chip" onClick={() => onPageJump?.({page: parseInt(g.bbPage,10), x: parseFloat(g.bbX), y: parseFloat(g.bbY), w: parseFloat(g.bbW), h: parseFloat(g.bbH)})}>[Box p.{g.bbPage}]</button>)
    else if (g.mathDisp) parts.push(<MathDisplay key={ki++} tex={g.mathDispVal} />)
    else if (g.mathTooltip) parts.push(<span key={ki++} className="ai-math-tooltip" title={g.mathTtTxt}><MathInline tex={g.mathTtVal} /></span>)
    else if (g.mathIn) parts.push(<MathInline key={ki++} tex={g.mathInVal} />)
    else if (g.link) parts.push(<a key={ki++} href={g.linkUrl} target="_blank" rel="noreferrer" className="ai-link">{parseInline(g.linkText, onPageJump)}</a>)
    else if (g.badge) parts.push(<span key={ki++} className={`ai-badge ai-badge-${g.badgeCol.toLowerCase()}`}>{g.badgeLbl}</span>)
    else if (g.fn) parts.push(<sup key={ki++} className="ai-footnote-ref" id={`fnref-${g.fnId}`}><a href={`#fn-${g.fnId}`}>{g.fnId}</a></sup>)
    else if (g.colortext) parts.push(<span key={ki++} style={{ color: g.colorName }}>{parseInline(g.colorVal, onPageJump)}</span>)
    else if (g.colorSwatch) parts.push(<span key={ki++} className="ai-color-swatch-wrap"><span className="ai-color-swatch" style={{backgroundColor: g.colorSwatch}}/>{g.colorSwatch}</span>)
    else if (g.boldItalic) parts.push(<strong key={ki++}><em>{parseInline(g.biVal, onPageJump)}</em></strong>)
    else if (g.bold) parts.push(<strong key={ki++}>{parseInline(g.bVal, onPageJump)}</strong>)
    else if (g.italic) parts.push(<em key={ki++}>{parseInline(g.iVal, onPageJump)}</em>)
    else if (g.code) parts.push(<code key={ki++} className="ai-inline-code">{g.codeVal}</code>)
    else if (g.del) parts.push(<del key={ki++} className="ai-del">{parseInline(g.delVal, onPageJump)}</del>)
    else if (g.mark) parts.push(<mark key={ki++} className="ai-mark">{parseInline(g.markVal, onPageJump)}</mark>)
    else if (g.kbdBracket) parts.push(<kbd key={ki++} className="ai-kbd">{parseInline(g.kbdBVal, onPageJump)}</kbd>)
    else if (g.kbd) parts.push(<kbd key={ki++} className="ai-kbd">{parseInline(g.kbdVal, onPageJump)}</kbd>)
    else if (g.sub) parts.push(<sub key={ki++}>{parseInline(g.subVal, onPageJump)}</sub>)
    else if (g.u) parts.push(<u key={ki++}>{parseInline(g.uVal, onPageJump)}</u>)
    else if (g.bareUrl) parts.push(<a key={ki++} href={g.bareUrl} target="_blank" rel="noreferrer" className="ai-link">{g.bareUrl}</a>)

    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(<span key={ki++}>{text.slice(lastIndex)}</span>)
  return parts.length ? parts : [text]
}

// ── Block renderer ────────────────────────────────────────────────────────────
function renderFormattedText(text, streaming = false, onPageJump = null) {
  const lines = text.replace(/\\n/g, '\n').split('\n')
  const elements = []
  let i = 0, listKey = 0

  let listStack = []
  const flushList = () => {
    while (listStack.length > 0) {
      const top = listStack.pop()
      const Tag = top.type === 'ol' ? 'ol' : 'ul'
      const node = <Tag key={`list-${listKey++}`} className={`ai-${top.type}`}>{top.items}</Tag>
      if (listStack.length > 0) {
        const parent = listStack[listStack.length - 1]
        if (parent.items.length > 0) {
          const lastLi = parent.items[parent.items.length - 1]
          parent.items[parent.items.length - 1] = <li key={lastLi.key} className={lastLi.props.className}>{lastLi.props.children}{node}</li>
        } else {
          parent.items.push(<li key={`li-${listKey++}`} style={{listStyle:'none'}}>{node}</li>)
        }
      } else {
        elements.push(node)
      }
    }
  }

  const closeListToIndent = (indent) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
      const top = listStack.pop()
      const Tag = top.type === 'ol' ? 'ol' : 'ul'
      const node = <Tag key={`list-${listKey++}`} className={`ai-${top.type}`}>{top.items}</Tag>
      if (listStack.length > 0) {
        const parent = listStack[listStack.length - 1]
        if (parent.items.length > 0) {
          const lastLi = parent.items[parent.items.length - 1]
          parent.items[parent.items.length - 1] = <li key={lastLi.key} className={lastLi.props.className}>{lastLi.props.children}{node}</li>
        } else {
          parent.items.push(<li key={`li-${listKey++}`} style={{listStyle:'none'}}>{node}</li>)
        }
      } else {
        elements.push(node)
      }
    }
  }

  let dlItems = []
  const flushDl = () => {
    if (dlItems.length > 0) {
      elements.push(<dl key={`dl-${listKey++}`} className="ai-dl">{dlItems}</dl>)
      dlItems = []
    }
  }

  let footnotes = []
  const flushFootnotes = () => {
    if (footnotes.length > 0) {
      elements.push(
        <div key={`fn-${listKey++}`} className="ai-footnotes">
          <hr className="ai-hr" />
          <ol className="ai-footnote-list">
            {footnotes.map(fn => (
              <li key={fn.id} id={`fn-${fn.id}`} className="ai-footnote-item">
                {parseInline(fn.text, onPageJump)} <a href={`#fnref-${fn.id}`} className="ai-footnote-backref">↩</a>
              </li>
            ))}
          </ol>
        </div>
      )
      footnotes = []
    }
  }

  const flushAll = () => { flushList(); flushDl() }

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()

    if (line.startsWith('```')) {
      flushAll()
      const lang = line.slice(3).trim(); const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++ }
      if (lang === 'mermaid') elements.push(<MermaidBlock key={`code-${i}`} code={codeLines.join('\n')} />)
      else if (lang === 'filetree') elements.push(<FileTree key={`code-${i}`} code={codeLines.join('\n')} />)
      else if (lang === 'chart') elements.push(<ChartBlock key={`code-${i}`} code={codeLines.join('\n')} />)
      else if (lang === 'map') elements.push(<MapBlock key={`code-${i}`} code={codeLines.join('\n')} />)
      else if (lang === 'diff') elements.push(<RichDiffBlock key={`code-${i}`} code={codeLines.join('\n')} />)
      else if (lang === 'timeline') elements.push(<TimelineBlock key={`code-${i}`} code={codeLines.join('\n')} onPageJump={onPageJump} />)
      else if (lang === 'kanban') elements.push(<KanbanBlock key={`code-${i}`} code={codeLines.join('\n')} onPageJump={onPageJump} />)
      else if (['py', 'python', 'js', 'javascript'].includes(lang.toLowerCase())) elements.push(<SandboxBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />)
      else elements.push(<CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />)
      i++; continue
    }

    if (line.startsWith('|||') && line.endsWith('|||') && line.length > 3) {
      flushAll()
      const cols = line.split('|||').filter(Boolean)
      elements.push(
        <div key={`col-${i}`} className="ai-columns">
          {cols.map((c, idx) => <div key={idx} className="ai-column">{parseInline(c.trim(), onPageJump)}</div>)}
        </div>
      )
      i++; continue
    }

    if (line.startsWith('+++')) {
      flushAll()
      const title = line.slice(3).trim() || 'Details'
      const contentLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('+++')) { contentLines.push(lines[i]); i++ }
      elements.push(
        <details key={`details-${i}`} className="ai-details">
          <summary className="ai-details-summary">{title}</summary>
          <div className="ai-details-content">{renderFormattedText(contentLines.join('\n'), false, onPageJump)}</div>
        </details>
      )
      i++; continue
    }

    if (line === '$$') {
      flushAll()
      const mathLines = []
      i++
      while (i < lines.length && lines[i].trim() !== '$$') { mathLines.push(lines[i]); i++ }
      elements.push(<MathDisplay key={`math-${i}`} tex={mathLines.join('\n').trim()} />)
      i++; continue
    }
    if (line.startsWith('$$') && line.endsWith('$$') && line.length > 4) {
      flushAll()
      elements.push(<MathDisplay key={`math-${i}`} tex={line.slice(2, -2).trim()} />)
      i++; continue
    }

    if (line.startsWith('|')) {
      flushAll()
      const tableLines = []
      let caption = null
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i].trim()); i++ }
      if (i < lines.length && lines[i].trim().startsWith('^')) {
        caption = lines[i].trim().slice(1).trim()
        i++
      }
      const parsedRows = tableLines.filter(r => r).map(r => r.replace(/^\||\\|$/g, '').split('|').map(c => c.trim()))
      const sepRowIndex = parsedRows.findIndex(r => r.some(c => /^:?-+:?$/.test(c)))
      let header = [], body = parsedRows, aligns = []
      
      if (sepRowIndex !== -1) {
        aligns = parsedRows[sepRowIndex].map(c => {
          if (c.startsWith(':') && c.endsWith(':')) return 'center'
          if (c.endsWith(':')) return 'right'
          return 'left'
        })
        header = parsedRows.slice(0, sepRowIndex)[0] || []
        body = parsedRows.slice(sepRowIndex + 1)
      } else if (parsedRows.length > 1) {
        header = parsedRows[0]
        body = parsedRows.slice(1)
      }
      
      elements.push(
        <AdvancedTable
          key={`tbl-${i}`}
          caption={caption ? parseInline(caption, onPageJump) : null}
          headers={header.map(h => ({ text: h }))}
          rows={body.map(r => r.map(c => ({ text: c })))}
          aligns={aligns}
          onPageJump={onPageJump}
        />
      )
      continue
    }

    const imgMatch = line.match(/^!\[([^\]]*)\]\((.+)\)$/)
    if (imgMatch) {
      flushAll()
      const alt    = imgMatch[1]
      const target = imgMatch[2].trim()
      if (target.startsWith('search:')) elements.push(<InlineImage key={`img-${i}`} searchQuery={target.slice(7).trim()} alt={alt} />)
      else elements.push(<InlineImage key={`img-${i}`} src={target} alt={alt} />)
      i++; continue
    }

    if (/^[-*_]{3,}$/.test(line))  { flushAll(); elements.push(<hr key={`hr-${i}`} className="ai-hr" />); i++; continue }
    if (line.startsWith('### '))   { flushAll(); elements.push(<h3 key={`h3-${i}`} className="ai-h3">{parseInline(line.slice(4), onPageJump)}</h3>); i++; continue }
    if (line.startsWith('## '))    { flushAll(); elements.push(<h2 key={`h2-${i}`} className="ai-h2">{parseInline(line.slice(3), onPageJump)}</h2>); i++; continue }
    if (line.startsWith('# '))     { flushAll(); elements.push(<h1 key={`h1-${i}`} className="ai-h1">{parseInline(line.slice(2), onPageJump)}</h1>); i++; continue }

    const fnMatch = line.match(/^\[\^(\d+)\]:\s*(.*)/)
    if (fnMatch) {
      flushAll()
      footnotes.push({ id: fnMatch[1], text: fnMatch[2] })
      i++; continue
    }

    const listMatch = raw.match(/^(\s*)([-*•]|\d+\.)\s+(.*)/)
    if (listMatch) {
      flushDl()
      const indent = listMatch[1].length
      const marker = listMatch[2]
      const content = listMatch[3]
      const type = /^\d/.test(marker) ? 'ol' : 'ul'
      const checkedMatch = content.match(/^\[([ xX])\]\s+(.*)/)
      let parsedContent = content
      let checked = false
      let isTask = false

      if (checkedMatch) {
        isTask = true
        checked = checkedMatch[1].toLowerCase() === 'x'
        parsedContent = checkedMatch[2]
      }

      closeListToIndent(indent)
      
      if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent || listStack[listStack.length - 1].type !== type) {
        listStack.push({ indent, type, items: [] })
      }

      const liContent = isTask ? (
        <>
          <span className={`ai-task-check${checked ? ' checked' : ''}`} aria-hidden="true" />
          <span className={checked ? 'ai-task-done' : ''}>{parseInline(parsedContent, onPageJump)}</span>
        </>
      ) : parseInline(parsedContent, onPageJump)

      listStack[listStack.length - 1].items.push(
        <li key={`li-${listKey++}`} className={isTask ? 'ai-task-item' : ''}>{liContent}</li>
      )
      i++; continue
    }

    if (line.startsWith(': ')) {
      flushList()
      const def = line.slice(2)
      if (dlItems.length === 0) {
        const term = elements.pop()
        dlItems.push(<dt key={`dt-${listKey++}`}>{term?.props?.children || 'Term'}</dt>)
      }
      dlItems.push(<dd key={`dd-${listKey++}`}>{parseInline(def, onPageJump)}</dd>)
      i++; continue
    }

    if (line.startsWith('> ')) {
      flushAll()
      const firstContent = line.slice(2)
      const calloutMatch = firstContent.match(/^\[!(note|info|tip|success|warning|danger|caution|important|question|bug)\]\s*/i)
      const bqLines = []
      if (!calloutMatch) bqLines.push(firstContent)
      i++
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        bqLines.push(lines[i].trim().slice(2)); i++
      }
      if (calloutMatch) {
        elements.push(<Callout key={`callout-${i}`} type={calloutMatch[1].toLowerCase()} lines={bqLines} onPageJump={onPageJump} />)
      } else {
        elements.push(
          <blockquote key={`bq-${i}`} className="ai-blockquote">
            {bqLines.map((l, li) => <p key={li} className="ai-bq-p">{parseInline(l, onPageJump)}</p>)}
          </blockquote>
        )
      }
      continue
    }

    if (!line) { flushAll(); i++; continue }

    flushAll()
    elements.push(<p key={`p-${i}`} className="ai-p">{parseInline(line, onPageJump)}</p>)
    i++
  }

  flushAll()
  flushFootnotes()
  if (streaming) elements.push(<span key="cursor" className="ai-stream-cursor" />)
  return elements
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AIPanel({
  open, width, setWidth,
  messages, setMessages,
  input, setInput,
  referCurrentPage, setReferCurrentPage,
  referPrevPage, setReferPrevPage,
  selectedModel, setSelectedModel,
  configuredModels, apiKeys, apiModels,
  currentPage, pageTexts,
  onOpenKeyVault,
  chatFont, fontSize,
  fileName,
  getPageImageRef,
  selectedText,
  setSelectedText,
  onPageJump,
}) {
  const textareaRef   = useRef(null)
  const chatRef       = useRef(null)
  const isLoadingRef  = useRef(false)
  const controlRowRef = useRef(null)

  const [modelMenuOpen,  setModelMenuOpen]  = useState(false)
  const [templatesOpen,  setTemplatesOpen]  = useState(false)
  const [contextOpen,    setContextOpen]    = useState(false)
  const [copiedId,       setCopiedId]       = useState(null)
  const [micListening,   setMicListening]   = useState(false)
  const [visualMode,     setVisualMode]     = useState(false)
  const [pageRangeInput, setPageRangeInput] = useState('')

  const storageKey = fileName
    ? `pdfistic-chat:${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    : 'pdfistic-chat'
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey

  const recognitionRef      = useRef(null)
  const micPauseTimerRef    = useRef(null)
  const micBaseInputRef     = useRef('')
  const micStopRequestedRef = useRef(false)

  const isLoading = messages.some(m => m.streaming)

  const clearMicPauseTimer = () => {
    if (!micPauseTimerRef.current) return
    window.clearTimeout(micPauseTimerRef.current)
    micPauseTimerRef.current = null
  }
  const stopMicRecognition = () => {
    micStopRequestedRef.current = true
    clearMicPauseTimer()
    window.electronAPI?.stopSpeechRecognition?.()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) { try { recognition.stop() } catch {} }
    setMicListening(false)
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          return
        }
      }
      setMessages([])
    } catch {
      setMessages([])
    }
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = storageKeyRef.current
    if (messages.length === 0) { localStorage.removeItem(key); return }
    try {
      const toSave = messages.filter(m => !m.streaming).slice(-60)
      localStorage.setItem(key, JSON.stringify(toSave))
    } catch {}
  }, [messages])

  useEffect(() => {
    if (!selectedText) return
    setInput(`"${selectedText}"\n\n`)
    setSelectedText?.('')
    window.setTimeout(() => textareaRef.current?.focus(), 120)
  }, [selectedText]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [input])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => {
    clearMicPauseTimer()
    try { recognitionRef.current?.abort?.() } catch {}
  }, [])

  useEffect(() => {
    if (!modelMenuOpen && !templatesOpen && !contextOpen) return
    const onDown = (e) => {
      if (controlRowRef.current && !controlRowRef.current.contains(e.target)) {
        setModelMenuOpen(false)
        setTemplatesOpen(false)
        setContextOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [modelMenuOpen, templatesOpen, contextOpen])

  const startResize = (e) => {
    e.preventDefault()
    const startX = e.clientX, startW = width
    const onMove = (mv) => {
      const max  = Math.floor(window.innerWidth * 0.4)
      const next = Math.min(Math.max(startW + startX - mv.clientX, 280), max)
      setWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const parsePageRange = (raw) => {
    if (!raw.trim()) return null
    const pages = []
    for (const part of raw.split(',')) {
      const sides = part.trim().split('-')
      if (sides.length === 2) {
        const s = parseInt(sides[0]), e = parseInt(sides[1])
        if (!isNaN(s) && !isNaN(e)) for (let p = s; p <= e; p++) pages.push(p)
      } else {
        const p = parseInt(part.trim())
        if (!isNaN(p)) pages.push(p)
      }
    }
    return pages.length ? pages : null
  }

  const sendWithHistory = useCallback(async (userText, history, userTs = 0) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    const aiId  = Math.max(Date.now(), userTs + 1)
    const aiMsg = { role: 'ai', text: '', page: currentPage, model: selectedModel, timestamp: aiId, streaming: true }
    setMessages(prev => [...prev, aiMsg])

    const imageBase64 = visualMode ? (getPageImageRef?.current?.(currentPage) ?? null) : null
    const pageRange = parsePageRange(pageRangeInput)

    const builtMessages = buildMessages(
      history, userText, pageTexts, referCurrentPage, referPrevPage, currentPage,
      pageRange ? { pageRange } : {}
    )
    let fullText = ''
    try {
      await streamAI(
        selectedModel, apiKeys?.[selectedModel], builtMessages,
        apiModels?.[selectedModel],
        (chunk) => {
          fullText += chunk
          setMessages(prev => prev.map(m => m.timestamp === aiId ? { ...m, text: fullText } : m))
        },
        imageBase64
      )
    } catch (err) {
      fullText = `Request failed:\n- ${err.message || 'Unknown error'}`
    }
    setMessages(prev => prev.map(m =>
      m.timestamp === aiId ? { ...m, text: fullText || 'No response returned.', streaming: false } : m
    ))
    isLoadingRef.current = false
  }, [selectedModel, apiKeys, apiModels, currentPage, pageTexts, referCurrentPage, referPrevPage,
      setMessages, visualMode, getPageImageRef, pageRangeInput])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    if (!selectedModel) { onOpenKeyVault?.(); return }
    const userTs  = Date.now()
    const userMsg = { role: 'user', text, page: currentPage, model: selectedModel, timestamp: userTs }
    const historySnapshot = [...messages]
    setMessages(prev => [...prev, userMsg])
    setInput('')
    await sendWithHistory(text, historySnapshot, userTs)
  }

  const handleRegenerate = async () => {
    if (isLoading) return
    let lastAiIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'ai') { lastAiIdx = i; break } }
    if (lastAiIdx === -1) return
    let lastUserIdx = -1
    for (let i = lastAiIdx - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserIdx = i; break } }
    if (lastUserIdx === -1) return
    const lastUserText  = messages[lastUserIdx].text
    const historyBefore = messages.slice(0, lastUserIdx)
    setMessages(messages.filter((_, i) => i !== lastAiIdx))
    await sendWithHistory(lastUserText, historyBefore)
  }

  const copyMessage = (text, id) => {
    copyToClipboard(text).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => {})
  }

  const toggleMic = async () => {
    if (micListening || recognitionRef.current) { stopMicRecognition(); return }

    if (window.electronAPI?.recognizeSpeech) {
      micBaseInputRef.current = input.trim() ? `${input.trim()} ` : ''
      micStopRequestedRef.current = false
      setMicListening(true)
      try {
        const result = await window.electronAPI.recognizeSpeech({ pauseMs: MIC_PAUSE_MS })
        if (micStopRequestedRef.current) return
        if (result?.ok && result.text?.trim()) {
          const nextInput = `${micBaseInputRef.current}${result.text}`.replace(/\s+/g, ' ').trimStart()
          setInput(nextInput)
        } else if (!result?.ok) alert(result?.error || 'Speech recognition failed.')
      } catch (error) {
        if (!micStopRequestedRef.current) alert(error?.message || 'Speech recognition failed.')
      } finally { setMicListening(false) }
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported in this browser.'); return }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch { alert('Microphone access was denied.'); return }
    }

    const recognition = new SR()
    recognition.lang = 'en-IN'; recognition.interimResults = true
    recognition.continuous = true; recognition.maxAlternatives = 1
    micBaseInputRef.current = input.trim() ? `${input.trim()} ` : ''
    micStopRequestedRef.current = false

    const schedulePauseStop = () => {
      clearMicPauseTimer()
      micPauseTimerRef.current = window.setTimeout(() => {
        micStopRequestedRef.current = true; try { recognition.stop() } catch {}
      }, MIC_PAUSE_MS)
    }

    recognition.onresult = (e) => {
      let finalTranscript = '', interimTranscript = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i]?.[0]?.transcript || ''
        if (e.results[i].isFinal) finalTranscript += `${t} `
        else interimTranscript += t
      }
      setInput(`${micBaseInputRef.current}${finalTranscript}${interimTranscript}`.replace(/\s+/g, ' ').trimStart())
      schedulePauseStop()
    }
    recognition.onspeechend = schedulePauseStop
    recognition.onsoundend  = schedulePauseStop
    recognition.onend = () => { clearMicPauseTimer(); recognitionRef.current = null; setMicListening(false) }
    recognition.onerror = (e) => {
      clearMicPauseTimer(); recognitionRef.current = null; setMicListening(false)
      if (e.error === 'not-allowed') alert('Microphone access was denied.')
      else if (e.error === 'network') alert('Speech recognition service failed.')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') console.warn('SR error:', e.error)
    }
    recognitionRef.current = recognition
    try { recognition.start(); setMicListening(true) }
    catch { recognitionRef.current = null; setMicListening(false) }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  let lastAiMsgIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'ai') { lastAiMsgIdx = i; break }
  }

  return (
    <aside
      className={`ai-panel ${open ? 'open' : ''}`}
      style={{
        '--ai-panel-width': `${width}px`,
        '--ai-chat-font':   chatFont || "'Segoe UI', system-ui, sans-serif",
        '--ai-font-size':   `${fontSize || 13}px`,
      }}
      aria-hidden={!open}
    >
      <div className="ai-resizer" onPointerDown={startResize} />
      <div className="ai-panel-inner">

        {/* ── Header ── */}
        <header className="ai-header">
          <div className="ai-header-row">
            <span className="ai-live-dot" title="AI ready" />
            <div className="ai-header-info">
              <span className="ai-title">Inferna</span>
              {selectedModel && (
                <span className="ai-model-pill">{modelLabel(selectedModel)}</span>
              )}
            </div>
            {referCurrentPage && (
              <span className="ai-page-badge" title="Reading current page">
                p.{currentPage}
              </span>
            )}
          </div>
        </header>

        {/* ── Chat area ── */}
        <div className="ai-chat" ref={chatRef}>
          {messages.length === 0 ? (

            /* ── Empty state ── */
            <div className="ai-empty">
              <div className="ai-empty-hero">
                <div className="ai-empty-icon-wrap">
                  <BrainIcon size={24} />
                </div>
                <p className="ai-empty-title">Ask about this PDF</p>
                <p className="ai-empty-sub">Citations appear as clickable page links.</p>
              </div>

              <div className="ai-empty-cards">
                {PROMPT_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    className="ai-empty-card"
                    type="button"
                    onClick={() => {
                      setInput(t.text)
                      setTimeout(() => textareaRef.current?.focus(), 50)
                    }}
                  >
                    <span className="ai-empty-card-emoji">{t.emoji}</span>
                    <span className="ai-empty-card-label">{t.label}</span>
                    <span className="ai-empty-card-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

          ) : (

            /* ── Messages ── */
            <div className="ai-message-stack">
              {messages.map((msg, idx) => (
                <div key={msg.timestamp} className={`ai-message-row ${msg.role}`}>
                  <div className={`ai-bubble${msg.streaming ? ' streaming' : ''}`}>
                    {msg.role === 'ai' && msg.streaming && (
                      <div className="ai-stream-bar" aria-hidden="true" />
                    )}
                    {msg.role === 'ai'
                      ? renderFormattedText(msg.text, msg.streaming && !msg.text, onPageJump)
                      : <p className="ai-p">{msg.text}</p>
                    }
                    {msg.role === 'ai' && msg.streaming && msg.text && <span className="ai-stream-cursor" />}
                    {msg.role === 'ai' && msg.streaming && !msg.text && (
                      <div className="typing-bubble"><span /><span /><span /></div>
                    )}
                  </div>

                  {!msg.streaming && (
                    <div className="ai-msg-actions">
                      <button className="ai-action-btn" type="button" title="Copy"
                        onClick={() => copyMessage(msg.text, msg.timestamp)}>
                        {copiedId === msg.timestamp ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
                      </button>
                      {msg.role === 'ai' && idx === lastAiMsgIdx && (
                        <button className="ai-action-btn" type="button" title="Regenerate"
                          onClick={handleRegenerate} disabled={isLoading}>
                          <RegenIcon /> Regen
                        </button>
                      )}
                    </div>
                  )}

                  <div className="ai-meta">
                    {modelLabel(msg.model)} · p.{msg.page || currentPage} · {formatTime(msg.timestamp)}
                  </div>
                </div>
              ))}
            </div>

          )}
        </div>

        {/* ── Control row ── */}
        <div className="ai-control-row" ref={controlRowRef}>
          {configuredModels.length === 0 ? (
            <button className="ai-add-key" type="button" onClick={onOpenKeyVault}>
              Add API key to get started →
            </button>
          ) : (
            <div className="ai-model-dropup">
              <button
                className="ai-model-dropup-btn"
                type="button"
                onClick={() => { setModelMenuOpen(o => !o); setTemplatesOpen(false); setContextOpen(false) }}
              >
                <span className="ai-model-dot" />
                {modelLabel(selectedModel)}
                <ChevronIcon />
              </button>
              {modelMenuOpen && (
                <div className="ai-model-menu">
                  {configuredModels.map(p => (
                    <button key={p.id} type="button"
                      className={selectedModel === p.id ? 'active' : ''}
                      onClick={() => { setSelectedModel(p.id); setModelMenuOpen(false) }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ai-context-dropup">
            <button
              className={`ai-context-btn${(referCurrentPage || referPrevPage || visualMode || pageRangeInput) ? ' has-context' : ''}`}
              type="button"
              onClick={() => { setContextOpen(o => !o); setModelMenuOpen(false); setTemplatesOpen(false) }}
              title="Page context settings"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M9 13h6M9 17h4"/>
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 0' }}>Context</span>
              {(referCurrentPage || referPrevPage || visualMode || pageRangeInput) && (
                <span className="ai-context-dot" />
              )}
              <ChevronIcon />
            </button>
            {contextOpen && (
              <div className="ai-context-menu">
                <div className="ai-ctx-section-label">Page context</div>
                <label className="ai-ctx-row">
                  <input type="checkbox" checked={referCurrentPage}
                    onChange={e => setReferCurrentPage(e.target.checked)} />
                  <span>Current page (p.{currentPage || 1})</span>
                </label>
                <label className="ai-ctx-row">
                  <input type="checkbox" checked={referPrevPage} disabled={currentPage <= 1}
                    onChange={e => setReferPrevPage(e.target.checked)} />
                  <span>Previous page (p.{Math.max(1, currentPage - 1)})</span>
                </label>
                <div className="ai-ctx-divider" />
                <div className="ai-ctx-section-label">Visual mode</div>
                <label className="ai-ctx-row" title="Send a screenshot of the current page (Gemini only)">
                  <input type="checkbox" checked={visualMode}
                    onChange={e => setVisualMode(e.target.checked)} />
                  <span>📷 Send page image <span className="ai-ctx-note">Gemini only</span></span>
                </label>
                <div className="ai-ctx-divider" />
                <div className="ai-ctx-section-label">Page range</div>
                <input
                  className="ai-ctx-range-input"
                  type="text"
                  value={pageRangeInput}
                  onChange={e => setPageRangeInput(e.target.value)}
                  placeholder="e.g. 1-5, 8, 12"
                  title="Override context with specific pages"
                />
                {pageRangeInput && (
                  <button className="ai-ctx-clear" type="button"
                    onClick={() => setPageRangeInput('')}>
                    Clear range
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ai-templates-dropup">
            <button
              className="ai-templates-btn"
              type="button"
              disabled={isLoading}
              onClick={() => { setTemplatesOpen(o => !o); setModelMenuOpen(false); setContextOpen(false) }}
            >
              <SparkleIcon />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 0' }}>Templates</span>
              <ChevronIcon />
            </button>
            {templatesOpen && (
              <div className="ai-templates-menu">
                {PROMPT_TEMPLATES.map(t => (
                  <button key={t.label} type="button"
                    onClick={() => { setInput(t.text); setTemplatesOpen(false) }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="ai-composer">
          <div className="ai-composer-inner">
            <textarea
              ref={textareaRef}
              className="ai-input"
              value={input}
              rows={1}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this PDF…"
              disabled={isLoading}
            />
            <button
              className={`ai-mic-btn${micListening ? ' listening' : ''}`}
              type="button"
              onClick={toggleMic}
              title={micListening ? 'Stop listening' : 'Voice input'}
              disabled={isLoading}
            >
              <MicIcon active={micListening} />
            </button>
            <button
              className="ai-send-btn"
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <SendIcon />
            </button>
          </div>
        </div>

      </div>
    </aside>
  )
}