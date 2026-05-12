import { useEffect, useState } from 'react'
import { buildMessages, callAI, PROVIDERS } from '../utils/aiCall'
import './KeyVault.css'

const EyeIcon = ({ hidden }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {hidden ? (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c7 0 10 8 10 8a17.2 17.2 0 0 1-2.2 3.4" />
        <path d="M6.6 6.6C3.6 8.6 2 12 2 12s3 8 10 8a10.9 10.9 0 0 0 4.2-.8" />
      </>
    ) : (
      <>
        <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
)

export default function KeyVault({ open, apiKeys, apiModels, onClose, onSave }) {
  const [draftKeys, setDraftKeys] = useState({})
  const [draftModels, setDraftModels] = useState({})
  const [visible, setVisible] = useState({})
  const [testStatus, setTestStatus] = useState({})

  useEffect(() => {
    if (open) {
      setDraftKeys({ ...apiKeys })
      setDraftModels({ ...apiModels })
      setVisible({})
      setTestStatus({})
    }
  }, [open, apiKeys, apiModels])

  if (!open) return null

  const updateKey = (providerId, value) => {
    setDraftKeys(keys => ({ ...keys, [providerId]: value }))
    setTestStatus(status => ({ ...status, [providerId]: null }))
  }

  const testKey = async (provider) => {
    const key = draftKeys[provider.id]?.trim()
    if (!key) {
      setTestStatus(status => ({ ...status, [provider.id]: { state: 'failed', text: 'Missing key' } }))
      return
    }
    setTestStatus(status => ({ ...status, [provider.id]: { state: 'testing', text: 'Testing...' } }))
    const messages = buildMessages([], 'Reply with only: OK', {}, false, false, 1)
    const result = await callAI(provider.id, key, messages, draftModels[provider.id] || provider.model)
    setTestStatus(status => ({
      ...status,
      [provider.id]: result.error
        ? { state: 'failed', text: 'Failed' }
        : { state: 'working', text: 'Working' }
    }))
  }

  const handleSave = () => {
    onSave(draftKeys, draftModels)
  }

  return (
    <div className="key-vault-overlay" role="dialog" aria-modal="true" aria-label="API key vault">
      <div className="key-vault">
        <header className="key-vault-head">
          <div>
            <h2>API Key Vault</h2>
            <p>Keys are stored locally in Electron storage.</p>
          </div>
          <button className="vault-close" type="button" onClick={onClose}>×</button>
        </header>

        <div className="key-provider-list">
          {PROVIDERS.map(provider => {
            const hasSavedKey = Boolean(apiKeys?.[provider.id]?.trim())
            const status = testStatus[provider.id]
            return (
              <div className="key-provider-row" key={provider.id}>
                <span className="provider-dot" style={{ '--provider-color': provider.color }} />
                <span className="provider-name">{provider.name}</span>
                <input
                  className="provider-key-input"
                  type={visible[provider.id] ? 'text' : 'password'}
                  value={draftKeys[provider.id] || ''}
                  onChange={event => updateKey(provider.id, event.target.value)}
                  placeholder="API key"
                />
                <button
                  className="provider-eye"
                  type="button"
                  onClick={() => setVisible(items => ({ ...items, [provider.id]: !items[provider.id] }))}
                  title={visible[provider.id] ? 'Hide key' : 'Show key'}
                >
                  <EyeIcon hidden={!visible[provider.id]} />
                </button>
                <span className={`saved-mark ${hasSavedKey ? 'on' : ''}`}>{hasSavedKey ? '✓' : ''}</span>
                <select
                  className="provider-model-select"
                  value={draftModels[provider.id] || provider.model}
                  onChange={event => setDraftModels(models => ({ ...models, [provider.id]: event.target.value }))}
                  title={`${provider.name} model`}
                >
                  {provider.models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.note ? `${model.name} - ${model.note}` : model.name}
                    </option>
                  ))}
                </select>
                <button className="provider-test" type="button" onClick={() => testKey(provider)} disabled={status?.state === 'testing'}>
                  Test
                </button>
                {status && (
                  <span className={`test-status ${status.state}`}>
                    {status.state === 'working' ? '✓ ' : status.state === 'failed' ? '✗ ' : ''}
                    {status.text}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <footer className="key-vault-actions">
          <button className="vault-btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="vault-btn primary" type="button" onClick={handleSave}>Save all keys</button>
        </footer>
      </div>
    </div>
  )
}
