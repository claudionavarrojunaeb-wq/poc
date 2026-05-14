import React, { useState } from 'react'
import { getCsrfToken } from './csrf'
import './App.css'
import './Login.css'

const SendEmail: React.FC = () => {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult('')
    setLoading(true)
    try {
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      let csrf = getCsrfToken()
      if (!csrf) {
        try {
          const r = await fetch('/api/csrf-token', { credentials: 'include' })
          if (r.ok) {
            const j = await r.json().catch(() => ({}))
            if (j && typeof j === 'object' && j['csrfToken']) csrf = j['csrfToken']
            try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      if (csrf) headers['X-CSRF-Token'] = csrf
      const res = await fetch('/api/send-email', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ to, subject, text: message }),
      })
      const contentType = res.headers.get('content-type') || ''
      let data: unknown = null
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          const text = await res.text()
          setResult(`Respuesta no JSON del servidor: ${text || res.statusText}`)
          setLoading(false)
          return
        }
      } else {
        const text = await res.text()
        setResult(`Respuesta inesperada del servidor: ${text || res.statusText}`)
        setLoading(false)
        return
      }

      if (!res.ok) {
        let errMsg = 'send-failed'
        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>
          const eVal = obj['error']
          if (typeof eVal === 'string') errMsg = eVal
          else if (eVal !== undefined) errMsg = String(eVal)
          const pv = obj['previewUrl']
          if (pv && typeof pv === 'string') setPreviewUrl(pv)
        }
        setResult(`Error: ${errMsg}`)
      } else {
        setResult('Correo enviado correctamente')
        if (data && typeof data === 'object' && data !== null && 'previewUrl' in (data as Record<string, unknown>)) {
          const pv = (data as Record<string, unknown>)['previewUrl']
          if (pv && typeof pv === 'string') setPreviewUrl(pv)
        }
        setTo('')
        setSubject('')
        setMessage('')
      }
    } catch (err) {
      setResult(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-outer">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="login-title">Enviar correo</h2>

          <div className="field">
            <label>Para</label>
            <input className="login-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="destinatario@ejemplo.com" />
          </div>

          <div className="field">
            <label>Asunto</label>
            <input className="login-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" />
          </div>

          <div className="field">
            <label>Mensaje</label>
            <textarea className="login-input" style={{ minHeight: 140 }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="submit-button" disabled={loading}>{loading ? 'Enviando...' : 'Enviar correo'}</button>
          </div>

          {result && <p className="mt-3 text-center text-sm text-gray-700">{result}</p>}
          {previewUrl && (
            <div className="mt-2 text-center">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Abrir vista previa del correo</a>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export default SendEmail
