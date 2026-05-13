import './Onboarding.css'

const PROVIDERS_INFO = [
  { id: 'gemini',     name: 'Gemini',     color: '#534AB7', badge: 'Free',      url: 'https://aistudio.google.com/app/apikey',    desc: 'Google AI Studio' },
  { id: 'groq',       name: 'Groq',       color: '#f97316', badge: 'Free',      url: 'https://console.groq.com/keys',             desc: 'Ultra fast inference' },
  { id: 'openrouter', name: 'OpenRouter', color: '#2563eb', badge: 'Free tier', url: 'https://openrouter.ai/settings/keys',       desc: '100+ models' },
  { id: 'cerebras',   name: 'Cerebras',   color: '#dc2626', badge: 'Free',      url: 'https://cloud.cerebras.ai/platform',        desc: 'Fastest LLM chips' },
  { id: 'mistral',    name: 'Mistral',    color: '#7c3aed', badge: 'Free tier', url: 'https://console.mistral.ai/api-keys/',      desc: 'European AI' },
]

const openLink = (url) => {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

export default function Onboarding({ theme, onDone, onOpenKeyVault }) {
  return (
    <div className={`ob-overlay ${theme}`}>
      <div className="ob-card">

        {/* Header */}
        <div className="ob-header">
          <img src="./icon.ico" className="ob-logo" alt="PDFistic" />
          <h1 className="ob-title">Welcome to PDFistic</h1>
          <p className="ob-sub">AI-powered PDF reader — ready in 5 minutes</p>
        </div>

        {/* Steps */}
        <div className="ob-steps">

          {/* Step 1 */}
          <div className="ob-step">
            <div className="ob-step-badge">Step 1</div>
            <h3 className="ob-step-title">Get a free API key</h3>
            <p className="ob-step-desc">All providers below have free tiers — no credit card needed</p>
            <div className="ob-providers">
              {PROVIDERS_INFO.map(p => (
                <button
                  key={p.id}
                  className="ob-provider"
                  onClick={() => openLink(p.url)}
                  style={{ '--pc': p.color }}
                >
                  <span className="ob-pdot" />
                  <span className="ob-pinfo">
                    <span className="ob-pname">{p.name}</span>
                    <span className="ob-pdesc">{p.desc}</span>
                  </span>
                  <span className="ob-pbadge">{p.badge}</span>
                  <svg className="ob-parrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div className="ob-divider">
            <span>then</span>
          </div>

          {/* Step 2 */}
          <div className="ob-step">
            <div className="ob-step-badge">Step 2</div>
            <h3 className="ob-step-title">Add your key to PDFistic</h3>
            <p className="ob-step-desc">Paste it in the vault — stored locally on your device, never uploaded</p>
            <button className="ob-vault-btn" onClick={onOpenKeyVault}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2M7.5 11.5a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM12 12l8-8 2 2-8 8M16 6l2 2" />
              </svg>
              Open API Key Vault
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="ob-footer">
          <button className="ob-skip" onClick={onDone}>Skip for now</button>
          <button className="ob-done" onClick={onDone}>I'm all set →</button>
        </div>
      </div>
    </div>
  )
}