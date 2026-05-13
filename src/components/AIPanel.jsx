import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { buildMessages, streamAI, getProvider } from '../utils/aiCall'
import './AIPanel.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'pdfistic-chat'
const MIC_PAUSE_MS = 2000

const PROMPT_TEMPLATES = [
  { label: '📝 Summarize', text: 'Summarize this page in bullet points.' },
  { label: '❓ Quiz me',   text: 'Generate 3 quiz questions from this page.' },
  { label: '📖 Explain',   text: 'Explain the key concepts on this page simply.' },
  { label: '🔑 Key terms', text: 'List the key terms and their definitions from this page.' },
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

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  const normalLang = lang?.toLowerCase().trim() || ''
  const langColor  = LANG_COLORS[normalLang] || 'rgba(160,157,245,0.65)'
  const lines = code.split('\n')
  const displayLines = lines[lines.length - 1].trim() === '' ? lines.slice(0, -1) : lines
  const copy = () => {
    copyToClipboard(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }
  return (
    <div className="ai-code-wrap">
      <div className="ai-code-header">
        <span className="ai-code-dots" aria-hidden="true">
          <span className="ai-code-dot red" /><span className="ai-code-dot yellow" /><span className="ai-code-dot green" />
        </span>
        <span className="ai-code-lang-label" style={{ color: langColor }}>{normalLang || 'code'}</span>
        <button className={`ai-code-copy-btn${copied ? ' copied' : ''}`} type="button" onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="ai-code-body">
        <div className="ai-code-gutter" aria-hidden="true">
          {displayLines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre className="ai-code-block"><code>{displayLines.join('\n')}</code></pre>
      </div>
    </div>
  )
}

// ── Callout ───────────────────────────────────────────────────────────────────
const CALLOUT_META = {
  note:      { icon: 'ℹ', label: 'Note' },
  tip:       { icon: '💡', label: 'Tip' },
  warning:   { icon: '⚠', label: 'Warning' },
  caution:   { icon: '🔥', label: 'Caution' },
  important: { icon: '❗', label: 'Important' },
}
function Callout({ type, lines }) {
  const meta = CALLOUT_META[type] || CALLOUT_META.note
  return (
    <div className={`ai-callout ai-callout-${type}`}>
      <div className="ai-callout-header">
        <span className="ai-callout-icon">{meta.icon}</span>
        <span className="ai-callout-label">{meta.label}</span>
      </div>
      <div className="ai-callout-body">
        {lines.filter(Boolean).map((line, i) => (
          <p key={i} className="ai-p">{parseInline(line)}</p>
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
    // Prevent body scroll when modal open
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

  const signal = AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined

  const tryGetThumb = async (title) => {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=700&origin=*`,
      { signal }
    )
    const data = await res.json()
    const pages = data?.query?.pages
    const page  = pages && Object.values(pages)[0]
    if (page?.thumbnail?.source && page.pageid !== -1)
      return { url: page.thumbnail.source, credit: 'Wikipedia', title: page.title }
    return null
  }

  try {
    // 1. exact title match
    const exact = await tryGetThumb(query)
    if (exact) { _imgCache.set(key, exact); return exact }

    // 2. search + first 3 results
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      { signal }
    )
    const searchData = await searchRes.json()
    const hits = searchData?.query?.search || []
    for (const hit of hits) {
      const result = await tryGetThumb(hit.title)
      if (result) { _imgCache.set(key, result); return result }
    }
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const modelLabel = (modelId) => getProvider(modelId)?.name || 'No model'
const formatTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// ── Inline parser ─────────────────────────────────────────────────────────────
// Supports: ***bold+italic***, **bold**, *italic*, `code`, ~~del~~, ==mark==, [[kbd]]
function parseInline(text) {
  const parts = []
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~|==(.+?)==|\[\[(.+?)\]\])/g
  let lastIndex = 0, ki = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push(<span key={ki++}>{text.slice(lastIndex, match.index)}</span>)
    if      (match[2] !== undefined) parts.push(<strong key={ki++}><em>{match[2]}</em></strong>)
    else if (match[3] !== undefined) parts.push(<strong key={ki++}>{match[3]}</strong>)
    else if (match[4] !== undefined) parts.push(<em key={ki++}>{match[4]}</em>)
    else if (match[5] !== undefined) parts.push(<code key={ki++} className="ai-inline-code">{match[5]}</code>)
    else if (match[6] !== undefined) parts.push(<del key={ki++} className="ai-del">{match[6]}</del>)
    else if (match[7] !== undefined) parts.push(<mark key={ki++} className="ai-mark">{match[7]}</mark>)
    else if (match[8] !== undefined) parts.push(<kbd key={ki++} className="ai-kbd">{match[8]}</kbd>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(<span key={ki++}>{text.slice(lastIndex)}</span>)
  return parts.length ? parts : [text]
}

// ── Block renderer ────────────────────────────────────────────────────────────
function renderFormattedText(text, streaming = false) {
  const lines = text.replace(/\\n/g, '\n').split('\n')
  const elements = []
  let i = 0, listItems = [], listType = null, listKey = 0

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    elements.push(<Tag key={`list-${listKey++}`} className={`ai-${listType}`}>{listItems}</Tag>)
    listItems = []; listType = null
  }

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()

    // Fenced code block
    if (line.startsWith('```')) {
      flushList()
      const lang = line.slice(3).trim(); const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++ }
      elements.push(<CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />)
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      flushList()
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i].trim()); i++ }
      const dataRows = tableLines.filter(r => !/^\|[-| :]+\|$/.test(r))
      if (dataRows.length > 0) {
        const parsedRows = dataRows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
        const [header, ...body] = parsedRows
        elements.push(
          <div key={`tbl-${i}`} className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr>{header.map((cell, ci) => <th key={ci}>{parseInline(cell)}</th>)}</tr></thead>
              <tbody>{body.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{parseInline(cell)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // ── Standalone image (block-level) ──────────────────────────────────────
    // Syntax 1: ![alt text](https://direct-url.jpg)
    // Syntax 2: ![alt text](search: heart diagram)   ← Wikipedia search
    const imgMatch = line.match(/^!\[([^\]]*)\]\((.+)\)$/)
    if (imgMatch) {
      flushList()
      const alt    = imgMatch[1]
      const target = imgMatch[2].trim()
      if (target.startsWith('search:')) {
        elements.push(<InlineImage key={`img-${i}`} searchQuery={target.slice(7).trim()} alt={alt} />)
      } else {
        elements.push(<InlineImage key={`img-${i}`} src={target} alt={alt} />)
      }
      i++; continue
    }

    if (/^[-*_]{3,}$/.test(line))  { flushList(); elements.push(<hr key={`hr-${i}`} className="ai-hr" />); i++; continue }
    if (line.startsWith('### '))   { flushList(); elements.push(<h3 key={`h3-${i}`} className="ai-h3">{parseInline(line.slice(4))}</h3>); i++; continue }
    if (line.startsWith('## '))    { flushList(); elements.push(<h2 key={`h2-${i}`} className="ai-h2">{parseInline(line.slice(3))}</h2>); i++; continue }
    if (line.startsWith('# '))     { flushList(); elements.push(<h1 key={`h1-${i}`} className="ai-h1">{parseInline(line.slice(2))}</h1>); i++; continue }

    // ── Task list: - [x] or - [ ] ──────────────────────────────────────────
    if (/^[-*]\s+\[[ xX]\]/.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      const checked  = /^[-*]\s+\[[xX]\]/.test(line)
      const taskText = line.replace(/^[-*]\s+\[[ xX]\]\s*/, '')
      listItems.push(
        <li key={`li-${i}`} className="ai-task-item">
          <span className={`ai-task-check${checked ? ' checked' : ''}`} aria-hidden="true" />
          <span className={checked ? 'ai-task-done' : ''}>{parseInline(taskText)}</span>
        </li>
      )
      i++; continue
    }

    // Unordered list
    if (/^[-*•]\s+/.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(<li key={`li-${i}`}>{parseInline(line.replace(/^[-*•]\s+/, ''))}</li>)
      i++; continue
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(<li key={`li-${i}`}>{parseInline(line.replace(/^\d+\.\s+/, ''))}</li>)
      i++; continue
    }

    // Blockquote / Callout
    if (line.startsWith('> ')) {
      flushList()
      const firstContent = line.slice(2)
      const calloutMatch = firstContent.match(/^\[!(note|tip|warning|caution|important)\]\s*/i)
      const bqLines = []
      if (!calloutMatch) bqLines.push(firstContent)
      i++
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        bqLines.push(lines[i].trim().slice(2)); i++
      }
      if (calloutMatch) {
        elements.push(<Callout key={`callout-${i}`} type={calloutMatch[1].toLowerCase()} lines={bqLines} />)
      } else {
        elements.push(
          <blockquote key={`bq-${i}`} className="ai-blockquote">
            {bqLines.map((l, li) => <p key={li} className="ai-bq-p">{parseInline(l)}</p>)}
          </blockquote>
        )
      }
      continue
    }

    if (!line) { flushList(); i++; continue }

    flushList()
    elements.push(<p key={`p-${i}`} className="ai-p">{parseInline(line)}</p>)
    i++
  }

  flushList()
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
}) {
  const textareaRef  = useRef(null)
  const chatRef      = useRef(null)
  const isLoadingRef = useRef(false)

  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [copiedId, setCopiedId]           = useState(null)
  const [micListening, setMicListening]   = useState(false)
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

  // ── Persist chat ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messages.length === 0) { localStorage.removeItem(STORAGE_KEY); return }
    try {
      const toSave = messages.filter(m => !m.streaming).slice(-60)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {}
  }, [messages])

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

  // ── Resize ────────────────────────────────────────────────────────────────
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

  // ── Stream ────────────────────────────────────────────────────────────────
  const sendWithHistory = useCallback(async (userText, history, userTs = 0) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    const aiId  = Math.max(Date.now(), userTs + 1)
    const aiMsg = { role: 'ai', text: '', page: currentPage, model: selectedModel, timestamp: aiId, streaming: true }
    setMessages(prev => [...prev, aiMsg])
    const builtMessages = buildMessages(history, userText, pageTexts, referCurrentPage, referPrevPage, currentPage)
    let fullText = ''
    try {
      await streamAI(selectedModel, apiKeys?.[selectedModel], builtMessages, apiModels?.[selectedModel], (chunk) => {
        fullText += chunk
        setMessages(prev => prev.map(m => m.timestamp === aiId ? { ...m, text: fullText } : m))
      })
    } catch (err) {
      fullText = `Request failed:\n- ${err.message || 'Unknown error'}`
    }
    setMessages(prev => prev.map(m =>
      m.timestamp === aiId ? { ...m, text: fullText || 'No response returned.', streaming: false } : m
    ))
    isLoadingRef.current = false
  }, [selectedModel, apiKeys, apiModels, currentPage, pageTexts, referCurrentPage, referPrevPage, setMessages])

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

  // ── Mic ───────────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* Header */}
        <header className="ai-header">
          <div className="ai-header-row">
            <div className="ai-icon-box"><BrainIcon /></div>
            <div className="ai-header-info">
              <span className="ai-title">PDF Assistant</span>
              {selectedModel && <span className="ai-model-pill">{modelLabel(selectedModel)}</span>}
            </div>
          </div>
        </header>

        {/* Chat */}
        <div className="ai-chat" ref={chatRef}>
          {messages.length === 0 ? (
            <div className="ai-empty">
              <div className="ai-empty-icon-wrap"><BrainIcon size={26} /></div>
              <p className="ai-empty-title">PDF Assistant</p>
              <p className="ai-empty-sub">Ask anything about this document — summaries, explanations, quiz questions, or key terms.</p>
              <div className="ai-empty-chips">
                {PROMPT_TEMPLATES.map(t => (
                  <button key={t.label} className="ai-empty-chip" type="button"
                    onClick={() => setInput(t.text)}>{t.label}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-message-stack">
              {messages.map((msg, idx) => (
                <div key={msg.timestamp} className={`ai-message-row ${msg.role}`}>
                  <div className={`ai-bubble${msg.streaming ? ' streaming' : ''}`}>
                    {/* Streaming progress bar at top of bubble */}
                    {msg.role === 'ai' && msg.streaming && (
                      <div className="ai-stream-bar" aria-hidden="true" />
                    )}
                    {msg.role === 'ai'
                      ? renderFormattedText(msg.text, msg.streaming && !msg.text)
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

        {/* Page refs */}
        <div className="ai-page-refs">
          <label>
            <input type="checkbox" checked={referCurrentPage} onChange={e => setReferCurrentPage(e.target.checked)} />
            <span>Current (p.{currentPage || 1})</span>
          </label>
          <label>
            <input type="checkbox" checked={referPrevPage} disabled={currentPage <= 1}
              onChange={e => setReferPrevPage(e.target.checked)} />
            <span>Previous (p.{Math.max(1, currentPage - 1)})</span>
          </label>
        </div>

        {/* Model + Templates */}
        <div className="ai-control-row">
          {configuredModels.length === 0 ? (
            <button className="ai-add-key" type="button" onClick={onOpenKeyVault}>
              Add API key to get started →
            </button>
          ) : (
            <div className="ai-model-dropup">
              <button className="ai-model-dropup-btn" type="button"
                onClick={() => { setModelMenuOpen(o => !o); setTemplatesOpen(false) }}>
                <span className="ai-model-dot" />{modelLabel(selectedModel)}<ChevronIcon />
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
          <div className="ai-templates-dropup">
            <button className="ai-templates-btn" type="button" disabled={isLoading}
              onClick={() => { setTemplatesOpen(o => !o); setModelMenuOpen(false) }}>
              <SparkleIcon />Templates<ChevronIcon />
            </button>
            {templatesOpen && (
              <div className="ai-templates-menu">
                {PROMPT_TEMPLATES.map(t => (
                  <button key={t.label} type="button"
                    onClick={() => { setInput(t.text); setTemplatesOpen(false) }}>{t.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="ai-composer">
          <textarea
            ref={textareaRef} className="ai-input"
            value={input} rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this PDF…"
            disabled={isLoading}
          />
          <button className={`ai-mic-btn${micListening ? ' listening' : ''}`}
            type="button" onClick={toggleMic}
            title={micListening ? 'Stop listening' : 'Voice input'}
            disabled={isLoading}>
            <MicIcon active={micListening} />
          </button>
          <button className="ai-send-btn" type="button"
            onClick={handleSend} disabled={!input.trim() || isLoading}>
            <SendIcon />
          </button>
        </div>

      </div>
    </aside>
  )
}