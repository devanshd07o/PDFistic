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

export function buildMessages(history, userText, pageTexts, referCurrent, referPrev, currentPage) {
  const systemPrompt = [
    'You are a PDF reading assistant. The user is reading a PDF.',
    'Answer based on the PDF content provided. Always cite page numbers.',
    'Format responses beautifully and clearly.',
    'Use short headings, line breaks, numbered steps, and bullet points where helpful.',
    'Keep paragraphs compact. Never return a dense wall of text.',
    'When listing facts, put each point on a new line.',
    'If the answer is uncertain or the PDF context is missing, say that clearly.'
  ].join(' ')

  const contextParts = []
  if (referCurrent && pageTexts?.[currentPage]) {
    contextParts.push(`=== Page ${currentPage} ===\n${pageTexts[currentPage]}`)
  }
  if (referPrev && currentPage > 1 && pageTexts?.[currentPage - 1]) {
    contextParts.push(`=== Page ${currentPage - 1} ===\n${pageTexts[currentPage - 1]}`)
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

// ── SSE stream reader ──────────────────────────────────────────────────────────
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

// ── Non-streaming callAI (unchanged, for KeyVault test) ───────────────────────
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

// ── Streaming callAI ──────────────────────────────────────────────────────────
// onChunk(text: string) called for each incoming token chunk
// Returns a promise that resolves when streaming is complete
export async function streamAI(provider, apiKey, messages, modelOverride = '', onChunk) {
  const providerConfig = getProvider(provider)
  if (!providerConfig) throw new Error('Unknown provider')
  if (!apiKey?.trim()) throw new Error('Missing API key')
  const model = modelOverride || providerConfig.model

  // ── Gemini ────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const modelsToTry = [model, ...providerConfig.models.map(m => m.id)]
      .filter((m, i, arr) => m && arr.indexOf(m) === i)
    let lastError = null
    for (const modelId of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: getSystemText(messages) }] },
            contents: toGeminiContents(messages),
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

  // ── OpenAI-compatible (Groq / OpenRouter / Cerebras / Mistral) ────────────
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