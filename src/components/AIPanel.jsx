import { useEffect, useRef, useState, useCallback } from 'react'
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
    <path d="M8 8h2" />
    <path d="M14 8h2" />
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

const RegenIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
    <path d="M21 3v6h-6"/>
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const modelLabel = (modelId) => getProvider(modelId)?.name || 'No model'

const formatTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// ── Markdown: inline parser ───────────────────────────────────────────────────
function parseInline(text) {
  const parts = []
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let lastIndex = 0, ki = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={ki++}>{text.slice(lastIndex, match.index)}</span>)
    if      (match[2] !== undefined) parts.push(<strong key={ki++}><em>{match[2]}</em></strong>)
    else if (match[3] !== undefined) parts.push(<strong key={ki++}>{match[3]}</strong>)
    else if (match[4] !== undefined) parts.push(<em key={ki++}>{match[4]}</em>)
    else if (match[5] !== undefined) parts.push(<code key={ki++} className="ai-inline-code">{match[5]}</code>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(<span key={ki++}>{text.slice(lastIndex)}</span>)
  return parts.length ? parts : [text]
}

// ── Markdown: block renderer ──────────────────────────────────────────────────
function renderFormattedText(text, streaming = false) {
  const lines = text.replace(/\\n/g, '\n').split('\n')
  const elements = []
  let i = 0, listItems = [], listType = null, listKey = 0

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    elements.push(<Tag key={`list-${listKey++}`} className={`ai-${listType}`}>{listItems}</Tag>)
    listItems = []
    listType = null
  }

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()

    if (line.startsWith('```')) {
      flushList()
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++ }
      elements.push(
        <pre key={`code-${i}`} className="ai-code-block">
          {lang && <span className="ai-code-lang">{lang}</span>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

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

    if (/^[-*_]{3,}$/.test(line))  { flushList(); elements.push(<hr key={`hr-${i}`} className="ai-hr" />); i++; continue }
    if (line.startsWith('### '))   { flushList(); elements.push(<h3 key={`h3-${i}`} className="ai-h3">{parseInline(line.slice(4))}</h3>); i++; continue }
    if (line.startsWith('## '))    { flushList(); elements.push(<h2 key={`h2-${i}`} className="ai-h2">{parseInline(line.slice(3))}</h2>); i++; continue }
    if (line.startsWith('# '))     { flushList(); elements.push(<h1 key={`h1-${i}`} className="ai-h1">{parseInline(line.slice(2))}</h1>); i++; continue }

    if (/^[-*•]\s+/.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(<li key={`li-${i}`}>{parseInline(line.replace(/^[-*•]\s+/, ''))}</li>)
      i++; continue
    }
    if (/^\d+\.\s+/.test(line)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(<li key={`li-${i}`}>{parseInline(line.replace(/^\d+\.\s+/, ''))}</li>)
      i++; continue
    }
    if (line.startsWith('> ')) {
      flushList()
      elements.push(<blockquote key={`bq-${i}`} className="ai-blockquote">{parseInline(line.slice(2))}</blockquote>)
      i++; continue
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

// ── Component ─────────────────────────────────────────────────────────────────
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
  // Font props from App (managed via Settings Panel)
  chatFont,
  fontSize,
}) {
  const textareaRef  = useRef(null)
  const chatRef      = useRef(null)
  const isLoadingRef = useRef(false)

  const [modelMenuOpen, setModelMenuOpen]   = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [copiedId, setCopiedId]           = useState(null)
  const [micListening, setMicListening]   = useState(false)
  const recognitionRef = useRef(null)
  const micPauseTimerRef = useRef(null)
  const micBaseInputRef = useRef('')
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
    if (recognition) {
      try { recognition.stop() } catch {}
    }
    setMicListening(false)
  }

  // ── Persist chat ─────────────────────────────────────────────────────────────
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

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [input])

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => {
    clearMicPauseTimer()
    try { recognitionRef.current?.abort?.() } catch {}
  }, [])

  // ── Resize handle ────────────────────────────────────────────────────────────
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

  // ── Core streaming send ──────────────────────────────────────────────────────
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

  // ── Send ─────────────────────────────────────────────────────────────────────
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

  // ── Regenerate ───────────────────────────────────────────────────────────────
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
    const base = messages.filter((_, i) => i !== lastAiIdx)
    setMessages(base)
    await sendWithHistory(lastUserText, historyBefore)
  }

  // ── Copy ─────────────────────────────────────────────────────────────────────
  const copyMessage = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => {})
  }

  // ── Mic / Speech-to-text ─────────────────────────────────────────────────────
  const toggleMic = async () => {
    if (micListening || recognitionRef.current) {
      stopMicRecognition()
      return
    }

    if (window.electronAPI?.recognizeSpeech) {
      micBaseInputRef.current = input.trim() ? `${input.trim()} ` : ''
      micStopRequestedRef.current = false
      setMicListening(true)
      try {
        const result = await window.electronAPI.recognizeSpeech({ pauseMs: MIC_PAUSE_MS })
        if (micStopRequestedRef.current) return
        if (result?.ok) {
          if (result.text?.trim()) {
            const nextInput = `${micBaseInputRef.current}${result.text}`.replace(/\s+/g, ' ').trimStart()
            setInput(nextInput)
          }
        } else {
          alert(result?.error || 'Speech recognition failed.')
        }
      } catch (error) {
        if (!micStopRequestedRef.current) alert(error?.message || 'Speech recognition failed.')
      } finally {
        setMicListening(false)
      }
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported in this browser.'); return }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
      } catch {
        alert('Microphone access was denied. Please allow mic permissions for this app.')
        return
      }
    }

    const recognition = new SR()
    recognition.lang = 'en-IN'          // English with Indian locale
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    micBaseInputRef.current = input.trim() ? `${input.trim()} ` : ''
    micStopRequestedRef.current = false

    const schedulePauseStop = () => {
      clearMicPauseTimer()
      micPauseTimerRef.current = window.setTimeout(() => {
        micStopRequestedRef.current = true
        try { recognition.stop() } catch {}
      }, MIC_PAUSE_MS)
    }

    recognition.onresult = (e) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = 0; i < e.results.length; i++) {
        const transcript = e.results[i]?.[0]?.transcript || ''
        if (e.results[i].isFinal) finalTranscript += `${transcript} `
        else interimTranscript += transcript
      }
      const nextInput = `${micBaseInputRef.current}${finalTranscript}${interimTranscript}`
        .replace(/\s+/g, ' ')
        .trimStart()
      setInput(nextInput)
      schedulePauseStop()
    }
    recognition.onspeechend = schedulePauseStop
    recognition.onsoundend = schedulePauseStop
    recognition.onend = () => {
      clearMicPauseTimer()
      recognitionRef.current = null
      setMicListening(false)
    }
    recognition.onerror = (e) => {
      clearMicPauseTimer()
      recognitionRef.current = null
      setMicListening(false)
      if (e.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow mic permissions for this app.')
      } else if (e.error === 'network') {
        alert('Speech recognition service failed. Check your internet connection and try again.')
      } else if (e.error === 'aborted' && micStopRequestedRef.current) {
        return
      } else if (e.error !== 'no-speech') {
        console.warn('Speech recognition error:', e.error)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setMicListening(true)
    } catch (error) {
      recognitionRef.current = null
      setMicListening(false)
      console.warn('Speech recognition could not start:', error)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  let lastAiMsgIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'ai') { lastAiMsgIdx = i; break }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
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
            <div className="ai-icon-box">
              <BrainIcon />
            </div>
            <div className="ai-header-info">
              <span className="ai-title">PDF Assistant</span>
              {selectedModel && (
                <span className="ai-model-pill">{modelLabel(selectedModel)}</span>
              )}
            </div>
          </div>
        </header>

        {/* ── Chat ── */}
        <div className="ai-chat" ref={chatRef}>
          {messages.length === 0 ? (
            <div className="ai-empty">
              <div className="ai-empty-icon"><BrainIcon size={44} /></div>
              <p className="ai-empty-title">Ask about this PDF</p>
              <p className="ai-empty-sub">Summaries, explanations, quiz questions — anything.</p>
            </div>
          ) : (
            <div className="ai-message-stack">
              {messages.map((msg, idx) => (
                <div key={msg.timestamp} className={`ai-message-row ${msg.role}`}>
                  <div className="ai-bubble">
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
                      <button className="ai-action-btn" type="button"
                        title="Copy" onClick={() => copyMessage(msg.text, msg.timestamp)}>
                        {copiedId === msg.timestamp ? '✓ Copied' : <><CopyIcon /> Copy</>}
                      </button>
                      {msg.role === 'ai' && idx === lastAiMsgIdx && (
                        <button className="ai-action-btn" type="button"
                          title="Regenerate" onClick={handleRegenerate} disabled={isLoading}>
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

        {/* ── Page refs ── */}
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

        {/* ── Model + Templates row ── */}
        <div className="ai-control-row">
          {configuredModels.length === 0 ? (
            <button className="ai-add-key" type="button" onClick={onOpenKeyVault}>
              Add API key to get started →
            </button>
          ) : (
            <div className="ai-model-dropup">
              <button className="ai-model-dropup-btn" type="button"
                onClick={() => { setModelMenuOpen(o => !o); setTemplatesOpen(false) }}>
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

          {/* Templates dropup */}
          <div className="ai-templates-dropup">
            <button className="ai-templates-btn" type="button" disabled={isLoading}
              onClick={() => { setTemplatesOpen(o => !o); setModelMenuOpen(false) }}>
              <SparkleIcon />
              Templates
              <ChevronIcon />
            </button>
            {templatesOpen && (
              <div className="ai-templates-menu">
                {PROMPT_TEMPLATES.map(t => (
                  <button key={t.label} type="button"
                    onClick={() => { setInput(t.text); setTemplatesOpen(false) }}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="ai-composer">
          <textarea
            ref={textareaRef}
            className="ai-input"
            value={input} rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this PDF…"
            disabled={isLoading}
          />
          <button
            className={`ai-mic-btn ${micListening ? 'listening' : ''}`}
            type="button"
            onClick={toggleMic}
            title={micListening ? 'Stop listening' : 'Voice input'}
            disabled={isLoading}
          >
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
