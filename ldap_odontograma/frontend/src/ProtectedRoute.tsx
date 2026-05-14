import React, { useEffect, useState } from 'react'
import { getCsrfToken } from './csrf'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'include' })
        if (!mounted) return
        if (res.ok) {
          setAuthed(true)
          setChecking(false)
          return
        }

        // Intentar refresh automático si la sesión expiró
        if (res.status === 401) {
          try {
            const headers: Record<string, string> = {}
            let csrf = getCsrfToken()
            if (!csrf) {
              try {
                const t = await fetch('/api/csrf-token', { credentials: 'include' })
                if (t.ok) {
                  const jj = await t.json().catch(() => ({}))
                  if (jj && typeof jj === 'object' && jj['csrfToken']) csrf = jj['csrfToken']
                  try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
                }
              } catch { /* ignore */ }
            }
            if (csrf) headers['X-CSRF-Token'] = csrf
            const r2 = await fetch('/api/refresh', {
              method: 'POST',
              credentials: 'include',
              headers
            })
            if (!mounted) return
            if (r2.ok) {
              // Reintentar obtener la sesión
              const r3 = await fetch('/api/session', { credentials: 'include' })
              if (!mounted) return
              setAuthed(r3.ok)
              setChecking(false)
              return
            }
          } catch {
            // ignore and fallthrough to unauthenticated
          }
        }
        setAuthed(false)
      } catch {
        if (!mounted) return
        setAuthed(false)
      } finally {
        if (mounted) setChecking(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  if (checking) return null
  if (!authed) return <Navigate to="/login" replace />
  return children
}
