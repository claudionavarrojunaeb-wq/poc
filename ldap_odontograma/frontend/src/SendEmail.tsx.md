# Documentación automática para SendEmail.tsx

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```tsx
import React, { useState } from 'react'
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
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text: message }),
      })
      const contentType = res.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch (parseErr) {
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
        setResult(`Error: ${data && data.error ? data.error : 'send-failed'}`)
        if (data && data.previewUrl) setPreviewUrl(data.previewUrl)
      } else {
        setResult('Correo enviado correctamente')
        if (data && data.previewUrl) setPreviewUrl(data.previewUrl)
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

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
