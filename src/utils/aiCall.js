export const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Gemini Flash',
    model: 'gemini-3.1-flash-lite',
    color: '#534AB7',
    models: [
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash' },
      { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    model: 'llama-3.3-70b-versatile',
    color: '#f97316',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', note: 'Next-Gen Choice' },
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', note: 'The Powerhouse' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', note: 'Stable & Reliable' }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'inclusionai/ring-2.6-1t:free',
    color: '#2563eb',
    models: [
      { id: 'inclusionai/ring-2.6-1t:free', name: 'Ring-2.6-1T' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Omni' },
      { id: 'baidu/qianfan-ocr-fast:free', name: 'Qianfan-OCR-Fast' },
      { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B' }
    ]
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    model: 'llama-3.3-70b',
    color: '#dc2626',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', note: 'The Giant' },
      { id: 'llama3.1-70b', name: 'Llama 3.1 70B', note: 'Open Source King' },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B', note: 'The Speedster' }
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral',
    model: 'mistralai/mistral-small',
    color: '#7c3aed',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct' },
      { id: 'mistralai/pixtral-12b:free', name: 'Pixtral 12B' },
      { id: 'mistralai/mistral-small', name: 'Mistral Small' }
    ]
  }
]

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map(p => [p.id, p]))

export function getProvider(providerId) {
  return PROVIDER_MAP[providerId] || null
}

// ── buildMessages ─────────────────────────────────────────────────────────────
export function buildMessages(history, userText, pageTexts, referCurrent, referPrev, currentPage, options = {}) {
  const { pageRange } = options

  const systemPrompt = [
    'You are Inferna, an advanced AI reading assistant. The user is reading a document.',
    'Answer based on the PDF content provided.',

    // ── Citation rules (critical) ──────────────────────────────────────────
    'CITATIONS: You MUST cite page numbers using the format [p.N] (e.g. [p.3], [p.12]) inline in your response.',
    'Place citations directly after the claim or fact they support, not at the end.',
    'Example: "The experiment used a sample size of 200 participants [p.4], and results were recorded over 6 weeks [p.5]."',
    'If context spans multiple pages use multiple citations: "The introduction [p.1] and conclusion [p.8] both emphasize..."',
    'Never write "see page 3" — always use [p.3] format so citations are interactive.',
    'If the PDF context does not cover the answer, say so clearly without fabricating citations.',

    // ── Math formatting rules (critical) ──────────────────────────────────
    'MATH FORMATTING: Always use LaTeX notation for ANY mathematical content — no exceptions.',
    'Inline math (within a sentence): wrap in single dollar signs: $x^2$, $q_0$, $\\frac{a}{b}$, $n \\geq 1$.',
    'Display math (standalone equation on its own line): wrap in double dollar signs on their own lines:',
    '$$',
    'L = \\{0^n 1^n \\mid n \\geq 1\\}',
    '$$',
    'Use LaTeX for ALL of the following without exception:',
    '  • Fractions: $\\frac{numerator}{denominator}$',
    '  • Superscripts: $x^2$, $0^n$, $2^{n-1}$',
    '  • Subscripts: $q_0$, $q_{\\text{accept}}$, $a_{ij}$',
    '  • Greek letters: $\\alpha$, $\\beta$, $\\Sigma$, $\\sigma$, $\\delta$, $\\epsilon$, $\\lambda$, $\\mu$, $\\pi$, $\\theta$, $\\omega$',
    '  • Set notation: $\\{0, 1\\}$, $\\in$, $\\subseteq$, $\\cup$, $\\cap$, $\\emptyset$, $\\mathbb{N}$, $\\mathbb{R}$',
    '  • Logic: $\\forall$, $\\exists$, $\\neg$, $\\land$, $\\lor$, $\\Rightarrow$, $\\Leftrightarrow$',
    '  • Relations: $\\leq$, $\\geq$, $\\neq$, $\\approx$, $\\equiv$, $\\sim$',
    '  • Functions: $f(x)$, $\\log$, $\\ln$, $\\sin$, $\\cos$, $\\lim_{x \\to \\infty}$',
    '  • Sums/products: $\\sum_{i=0}^{n} i^2$, $\\prod_{i=1}^{n} i$',
    '  • Integrals: $\\int_a^b f(x)\\,dx$',
    '  • Vectors/matrices: $\\vec{v}$, $\\mathbf{A}$, $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$',
    '  • Turing machine transitions: $\\delta(q_0, 0) = (q_1, X, R)$',
    '  • Complexity: $O(n \\log n)$, $\\Theta(n^2)$, $\\Omega(n)$',
    '  • Number theory: $a \\equiv b \\pmod{m}$, $\\gcd(a, b)$',
    '  • Probability: $P(A \\mid B)$, $\\mathbb{E}[X]$, $\\binom{n}{k}$',
    'NEVER write math as plain text like "x^2" or "q_0" or "sum from i=0 to n". Always use LaTeX.',
    'For multi-line derivations, align using the align environment:',
    '$$\\begin{align} a &= b + c \\\\ &= d \\end{align}$$',
    'For piecewise functions: $f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\leq 0 \\end{cases}$',

    // ── Formatting rules ───────────────────────────────────────────────────
    'Format responses beautifully and clearly.',
    'Use short headings, line breaks, numbered steps, and bullet points where helpful.',
    'Keep paragraphs compact. Never return a dense wall of text.',
    'When listing facts, put each point on a new line.',

    // ── Image rules ────────────────────────────────────────────────────────
    'IMAGE CAPABILITY: You can embed inline images using this syntax: ![short caption](search: 3-5 word query)',
    'The app fetches the best matching image from Wikipedia and Wikimedia Commons and renders it inline.',
    'WHEN TO USE: Only add an image when seeing it would help the reader understand faster or better than text alone — a diagram of a structure or process, a photo of a person or place, a visual of a device, circuit, map, chart, or concept.',
    'WHEN NOT TO USE: Skip images for abstract ideas, definitions, comparisons, math formulas, code blocks, anything purely textual, or when the text already explains it clearly.',
    'FREQUENCY: Most responses need zero images. Maximum one image per response unless the user explicitly asks for more visuals.',
    'SEARCH QUERY: Make it specific. Add descriptor words like "diagram", "structure", "anatomy", "map", "illustration", "chart" when appropriate.',
    'Always place the image immediately after the sentence or paragraph it relates to, never at the very start.',
    'VISUAL MODE: If a page image is provided alongside the text, analyse both together. Describe diagrams, charts, figures, or equations you can see in the image when relevant.',

    // ── Advanced UI & Rendering Rules ──────────────────────────────────────
    'MERMAID DIAGRAMS: Generate diagrams using mermaid.js syntax. Wrap in ```mermaid blocks. Rules:',
    '1. DIAGRAM TYPE: Choose the correct diagram type for the content:',
    '   - Flowcharts/processes → `flowchart TD` (NOT `graph TD`)',
    '   - State machines, DFA, NFA, automata → `stateDiagram-v2` (NEVER use flowchart for automata)',
    '   - Sequences → `sequenceDiagram`',
    '   - Class diagrams → `classDiagram`',
    '   - Entity-relationship → `erDiagram`',
    '2. ARROWS: Use ASCII only (`-->`, `<--`, `<-->`). NEVER use unicode arrows (→, ⟶, ⇒ etc).',
    '3. EDGE LABELS (flowchart): Label goes between pipes: `A -->|label| B`. NEVER write `A -->|label|--> B` or `A --> |label| --> B`.',
    '4. NODE TEXT: Wrap special characters in quotes: `A["Start (Process)"]`, `B{"Decision?"}`, `C(["Accept"])`. Subscripts like q₀ must be written as `q0`.',
    '5. STATEDIAGRAM SYNTAX (for DFA/NFA/automata):',
    '   - Initial state: `[*] --> q0`',
    '   - Accepting state: `state "q0 (accept)" as q0` or just note it in prose',
    '   - Transition with label: `q0 --> q1 : 0` (colon, then label)',
    '   - Self-loop: `q0 --> q0 : 0,1`',
    '   - Example DFA that accepts strings ending in 1:',
    '     ```mermaid',
    '     stateDiagram-v2',
    '       [*] --> q0',
    '       q0 --> q0 : 0',
    '       q0 --> q1 : 1',
    '       q1 --> q0 : 1',
    '       q1 --> q0 : 0',
    '       q1 --> [*]',
    '     ```',
    '6. Never use `graph` keyword — always `flowchart` for flowcharts.',
    '7. Keep diagram compact. Max ~15 nodes for readability.',
    'INTERACTIVE CHARTS: Generate an interactive chart by outputting a JSON block wrapped in ```chart. The JSON MUST be a valid Apache ECharts option object. Example: ```chart {"xAxis": {"type":"category", "data":["A", "B"]}, "yAxis": {"type":"value"}, "series":[{"data":[1, 2], "type":"line"}]} ```',
    'INTERACTIVE MAPS: Show a location on a map by outputting a JSON block wrapped in ```map. Example: ```map {"lat": 51.5, "lng": -0.09, "zoom": 13, "marker": "London"} ```',
    'COLUMNS: Split content into columns using ||| delimiters: |||column one text|||column two text|||',
    'TIMELINES: Create a vertical timeline by wrapping lines in ```timeline. Each line should be formatted exactly as "Date/Title: Description".',
    'KANBAN BOARDS: Create a kanban board by wrapping markdown lists in ```kanban. Use headings for columns (e.g., ### To Do) and bullet points for tasks.',
    'BBOX HIGHLIGHTS: To pinpoint and highlight an exact rectangular area on the PDF page, use the syntax [bbox:page:x,y,w,h]. Coordinates (X,Y) and size (W,H) MUST be decimals between 0 and 1.'
  ].join('\n\n')

  const contextParts = []

  if (pageRange && pageRange.length > 0) {
    for (const pg of pageRange) {
      if (pageTexts?.[pg]) {
        contextParts.push(`=== Page ${pg} ===\n${pageTexts[pg]}`)
      }
    }
  } else {
    if (referCurrent && pageTexts?.[currentPage]) {
      contextParts.push(`=== Page ${currentPage} ===\n${pageTexts[currentPage]}`)
    }
    if (referPrev && currentPage > 1 && pageTexts?.[currentPage - 1]) {
      contextParts.push(`=== Page ${currentPage - 1} ===\n${pageTexts[currentPage - 1]}`)
    }
  }

  const contextText = contextParts.length
    ? `PDF context:\n\n${contextParts.join('\n\n')}`
    : 'No page text was provided. If needed, ask the user to enable a page reference or open a text-based PDF.'

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contextText },
    ...history.slice(-8).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: userText }
  ]
}

function withTimeout(ms = 30000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), ms)
  return { controller, timeoutId }
}

async function postJson(url, options) {
  const { controller, timeoutId } = withTimeout(30000)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `Request failed with ${response.status}`)
    }
    return data
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function getSystemText(messages) {
  return messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
}

function toGeminiContents(messages) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
}

function toGeminiContentsWithImage(messages, imageBase64) {
  const contents = toGeminiContents(messages)
  if (!imageBase64 || !contents.length) return contents
  for (let i = contents.length - 1; i >= 0; i--) {
    if (contents[i].role === 'user') {
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')
      contents[i] = {
        ...contents[i],
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
          ...contents[i].parts
        ]
      }
      break
    }
  }
  return contents
}

async function callGemini(apiKey, messages, model) {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: getSystemText(messages) }] },
        contents: toGeminiContents(messages),
        generationConfig: { temperature: 0.35, topP: 0.9, maxOutputTokens: 2048 }
      })
    }
  )
  const candidate = data?.candidates?.[0]
  const text = candidate?.content?.parts?.map(p => p.text || '').filter(Boolean).join('\n').trim()
  if (text) return text
  const reason = candidate?.finishReason || data?.promptFeedback?.blockReason
  throw new Error(reason ? `Gemini returned no text (${reason})` : 'Gemini returned no text')
}

async function readSSE(response, extractChunk, onChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const chunk = extractChunk(JSON.parse(data))
          if (chunk) onChunk(chunk)
        } catch {}
      }
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

export async function callAI(provider, apiKey, messages, modelOverride = '') {
  try {
    const providerConfig = getProvider(provider)
    if (!providerConfig) throw new Error('Unknown provider')
    if (!apiKey?.trim()) throw new Error('Missing API key')
    const model = modelOverride || providerConfig.model

    if (provider === 'gemini') {
      const modelsToTry = [model, ...providerConfig.models.map(m => m.id)]
        .filter((m, i, arr) => m && arr.indexOf(m) === i)
      let lastError = null
      for (const modelToTry of modelsToTry) {
        try {
          const text = await callGemini(apiKey, messages, modelToTry)
          return { text, error: null, model: modelToTry }
        } catch (err) {
          lastError = err
          const retryable = /not found|not supported|temporarily|overloaded|503|500|429|quota|deadline|network|abort/i.test(err.message || '')
          if (!retryable) break
        }
      }
      throw lastError || new Error('Gemini request failed')
    }

    const endpoints = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      cerebras: 'https://api.cerebras.ai/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions'
    }
    const headers = { Authorization: `Bearer ${apiKey}` }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://pdfed.app'
      headers['X-Title'] = 'PDFed'
    }
    const data = await postJson(endpoints[provider], {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages, stream: false })
    })
    return { text: data?.choices?.[0]?.message?.content || '', error: null }
  } catch (err) {
    return { text: '', error: err.message || 'AI request failed' }
  }
}

export async function streamAI(provider, apiKey, messages, modelOverride = '', onChunk, imageBase64 = null) {
  const providerConfig = getProvider(provider)
  if (!providerConfig) throw new Error('Unknown provider')
  if (!apiKey?.trim()) throw new Error('Missing API key')
  const model = modelOverride || providerConfig.model

  if (provider === 'gemini') {
    const modelsToTry = [model, ...providerConfig.models.map(m => m.id)]
      .filter((m, i, arr) => m && arr.indexOf(m) === i)
    let lastError = null
    for (const modelId of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
        const geminiContents = imageBase64
          ? toGeminiContentsWithImage(messages, imageBase64)
          : toGeminiContents(messages)
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: getSystemText(messages) }] },
            contents: geminiContents,
            generationConfig: { temperature: 0.35, topP: 0.9, maxOutputTokens: 2048 }
          })
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data?.error?.message || `Gemini ${response.status}`)
        }
        await readSSE(
          response,
          parsed => parsed?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '',
          onChunk
        )
        return
      } catch (err) {
        lastError = err
        const retryable = /not found|not supported|temporarily|overloaded|503|500|429|quota|deadline|network|abort/i.test(err.message || '')
        if (!retryable) break
      }
    }
    throw lastError || new Error('Gemini stream failed')
  }

  const endpoints = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions'
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://pdfed.app'
    headers['X-Title'] = 'PDFed'
  }

  const response = await fetch(endpoints[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: true })
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.error?.message || `Request failed ${response.status}`)
  }

  await readSSE(
    response,
    parsed => parsed?.choices?.[0]?.delta?.content || '',
    onChunk
  )
}