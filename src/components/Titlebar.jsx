import { useEffect, useState } from 'react'

export default function Titlebar({ theme, fileName }) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let mounted = true
    window.electronAPI?.isMaximized?.().then(value => {
      if (mounted) setMaximized(Boolean(value))
    })
    return window.electronAPI?.onAppCommand?.((command) => {
      if (command === 'window-state-changed') {
        window.electronAPI?.isMaximized?.().then(value => {
          if (mounted) setMaximized(Boolean(value))
        })
      }
    })
  }, [])

  if (!window.electronAPI) return null
  return (
    <div className={`titlebar ${theme}`}>
      <div className="titlebar-drag" onDoubleClick={() => window.electronAPI.maximize()}>
        <span className="app-logo">
          <img className="app-logo-img" src="./icon.png" alt="PDFistic" />
        </span>
        {fileName && <span className="file-name-title">— {fileName}</span>}
      </div>
      <div className="titlebar-controls">
        <button className="wbtn min" onClick={() => window.electronAPI.minimize()} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button className="wbtn max" onClick={() => window.electronAPI.maximize()} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized
            ? <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3.5 4.5V2.5h6v6h-2M2.5 4.5h6v6h-6z" fill="none" stroke="currentColor"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><rect width="9" height="9" x=".5" y=".5" fill="none" stroke="currentColor"/></svg>
          }
        </button>
        <button className="wbtn cls" onClick={() => window.electronAPI.close()} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  )
}
