import React, { useEffect, useState, useRef } from 'react'
import { FaEyeSlash } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import './App.css'
import './Login.css'
// Importar imagen de footer institucional ubicada en la carpeta `pages/assets`.
// Esta imagen se muestra en la parte inferior (footer) de la pantalla
// en la vista de login. La importación devuelve una URL gestionada por
// Vite, por lo que puede usarse directamente en el atributo `src` del `img`.
import footerGob from './assets/footer-gob-2026-junaeb.png'

declare global {
  interface Window {
    onTurnstileToken?: (token: string) => void
    turnstile?: { render: (el: Element, opts: Record<string, unknown>) => void }
    __cspNonce?: string
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
// Permitir deshabilitar Turnstile en desarrollo mediante la variable de entorno
// Vite `VITE_DISABLE_TURNSTILE=1` (o 'true'). Esto evita cargar el script
// y renderizar el widget en la UI cuando está activo.
const DISABLE_TURNSTILE = (import.meta.env.VITE_DISABLE_TURNSTILE === '1' || import.meta.env.VITE_DISABLE_TURNSTILE === 'true')

// Mapa de códigos de error del backend a mensajes amigables en español.
// Cubre todos los códigos que pueden llegar desde /api/forgot-password
// y /api/login.
const FRIENDLY_ERRORS: Record<string, string> = {
  'ldap-user-no-reset': 'Los usuarios internos no pueden recuperar su contraseña por este medio. Contacte a soporte.',
  'user-not-found': 'No se encontró ningún usuario con ese correo electrónico.',
  'invalid-credentials': 'Credenciales inválidas. Verifique su correo y contraseña.',
}

function loadTurnstileScript() {
  if (document.querySelector('script[data-cf-turnstile]')) return
  const s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  s.async = true
  s.defer = true
  s.setAttribute('data-cf-turnstile', '1')
  try {
    const meta = document.querySelector('meta[name="csp-nonce"]') as HTMLMetaElement | null
    const globalNonce = window.__cspNonce
    const nonce = (meta && meta.content) || globalNonce
    if (nonce) {
      s.setAttribute('nonce', nonce)
      try {
        ;(s as HTMLScriptElement & { nonce?: string }).nonce = nonce
      } catch (innerErr) {
        console.error('Error asignando nonce a script element:', innerErr)
      }
    }
  } catch (e) {
    console.error('No fue posible leer nonce CSP:', e)
  }

  document.head.appendChild(s)
}

const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    // Si Turnstile está explícitamente deshabilitado en dev, no cargamos
    // el script ni intentamos renderizar el widget.
    if (!DISABLE_TURNSTILE && SITE_KEY) {
      loadTurnstileScript()
      const tryRender = () => {
        try {
          if (!mounted) return
          if (window.turnstile && turnstileRef.current && SITE_KEY) {
            window.turnstile.render(turnstileRef.current, {
              sitekey: SITE_KEY,
              callback: (t: string) => setToken(t),
            })
          } else {
            setTimeout(tryRender, 300)
          }
        } catch (e) {
          console.error('Turnstile render error', e)
        }
      }

      window.onTurnstileToken = (t: string) => setToken(t)
      tryRender()

      return () => {
        mounted = false
        try {
          window.onTurnstileToken = undefined
        } catch {
          void 0
        }
      }
    }

    // Si está deshabilitado, limpiamos cualquier handler y no hacemos nada.
    try {
      window.onTurnstileToken = undefined
    } catch { void 0 }
    return () => {}
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setLoading(true)
      try {
      const res = await fetch('http://10.162.14.49:4000/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, token })
      })

      const contentType = res.headers.get('content-type') || ''
      let data: unknown = null
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          const text = await res.text()
          setMsg(`Respuesta no JSON del servidor: ${text || res.statusText}`)
          setLoading(false)
          return
        }
      } else {
        // non-json response (HTML/error page) — read text for debugging
        const text = await res.text()
        setMsg(`Respuesta inesperada del servidor: ${text || res.statusText}`)
        setLoading(false)
        return
      }

      if (!res.ok) {
        let errMsg = 'Error en login'
        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>
          const eVal = obj['error']
          if (typeof eVal === 'string') errMsg = eVal
          else if (eVal !== undefined) errMsg = String(eVal)
        }
        setMsg(errMsg)
      } else {
        setMsg('Autenticación correcta')
        // Si el backend devuelve un CSRF token (útil cuando la cookie fue bloqueada), lo guardamos en localStorage
        try {
          if (data && typeof data === 'object' && data !== null) {
            const obj = data as Record<string, unknown>
            const csrfVal = obj['csrfToken']
            if (typeof csrfVal === 'string' && window && window.localStorage) {
              try { window.localStorage.setItem('ssmm_csrf', csrfVal) } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
        // No persistimos sesión en localStorage: usamos cookie HttpOnly del servidor
        try { navigate('/dashboard') } catch { window.location.pathname = '/dashboard' }
      }
    } catch (err) {
      setMsg(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setMsg('')
    if (!username) {
      setMsg('Ingrese su correo electrónico para recuperar la contraseña')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })
      const contentType = res.headers.get('content-type') || ''
      let data: unknown = null
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          const text = await res.text()
          setMsg(`Respuesta no JSON del servidor: ${text || res.statusText}`)
          setLoading(false)
          return
        }
      } else {
        // Si el servidor devuelve HTML (p.ej. "Cannot POST /api/forgot-password")
        // o responde 404/Not Found, intentamos un reintento directo al backend
        // en localhost:4000 (caso en que Vite no está proxyando /api).
        const text = await res.text()
        const shouldRetryDirect = res.status === 404 || res.status >= 400 || (text && (text.includes('Cannot POST') || text.includes('Not Found') || text.includes('404')))
        if (shouldRetryDirect) {
            try {
            const res2 = await fetch('http://127.0.0.1:4000/api/forgot-password', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username })
            })
            const ct2 = res2.headers.get('content-type') || ''
            if (ct2.includes('application/json')) {
              try {
                data = await res2.json()
              } catch {
                const t2 = await res2.text()
                setMsg(`Respuesta inesperada del servidor (direct): ${t2 || res2.statusText}`)
                setLoading(false)
                return
              }
            } else {
              const t2 = await res2.text()
              setMsg(`Respuesta inesperada del servidor (direct): ${t2 || res2.statusText}`)
              setLoading(false)
              return
            }
            if (!res2.ok) {
              let errMsg = 'Error al recuperar contraseña'
              if (data && typeof data === 'object' && data !== null) {
                const obj2 = data as Record<string, unknown>
                const eVal2 = obj2['error']
                // Traducir código de error a mensaje amigable
                if (typeof eVal2 === 'string') errMsg = FRIENDLY_ERRORS[eVal2] ?? eVal2
                else if (eVal2 !== undefined) errMsg = String(eVal2)
              }
              setMsg(errMsg)
            } else {
              setMsg('Se envió un correo con la contraseña al email registrado')
              if (data && typeof data === 'object' && data !== null && 'previewUrl' in (data as Record<string, unknown>)) {
                const pv = (data as Record<string, unknown>)['previewUrl']
                if (pv && typeof pv === 'string') setMsg((m) => `${m} (preview: ${pv})`)
              }
            }
            setLoading(false)
            return
          } catch (err2) {
            setMsg(String(err2))
            setLoading(false)
            return
          }
        }

        setMsg(`Respuesta inesperada del servidor: ${text || res.statusText}`)
        setLoading(false)
        return
      }

      if (!res.ok) {
        let errMsg = 'Error al recuperar contraseña'
        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>
          const eVal = obj['error']
          // Traducir código de error a mensaje amigable; si no hay traducción usar el código
          if (typeof eVal === 'string') errMsg = FRIENDLY_ERRORS[eVal] ?? eVal
          else if (eVal !== undefined) errMsg = String(eVal)
        }
        setMsg(errMsg)
      } else {
        setMsg('Se envió un correo con el código al email registrado')
        // Redirigir al formulario de reset para que el usuario ingrese el código
        try { navigate('/reset-password', { state: { username } }) } catch { void 0 }
        if (data && typeof data === 'object' && data !== null && 'previewUrl' in (data as Record<string, unknown>)) {
          const pv = (data as Record<string, unknown>)['previewUrl']
          if (pv && typeof pv === 'string') setMsg((m) => `${m} (preview: ${pv})`)
        }
      }
    } catch (err) {
      setMsg(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    // Estructura principal: columna de altura mínima completa para permitir
    // ubicar el formulario centrado y el footer en la parte inferior.
    <div className="login-page">
      {/* Contenedor flexible que ocupa el espacio disponible y centra el formulario */}
      <div className="flex-1 flex items-center justify-center">
      <form className="login-card" onSubmit={handleSubmit}>
        <h2 className="login-title">Iniciar sesión</h2>

        <div className="mb-4">
          <label htmlFor="username" className="block text-sm font-medium text-gray-600 mb-2">Correo electrónico</label>
          <input id="username" className="login-input" type="email" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="correo@ejemplo.cl" />
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">Contraseña</label>
          <div className="flex items-center">
            <input
              id="password"
              className="login-input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="ml-3 p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                <FaEyeSlash size={18} />
              </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="text-sm text-blue-600 underline" onClick={handleForgotPassword} disabled={loading || !username}>Olvidé mi contraseña</button>
          </div>
        </div>

        {(!DISABLE_TURNSTILE && SITE_KEY) ? (
          <div className="turnstile-wrap">
            <div className="turnstile-box turnstile-borderless">
              <div ref={turnstileRef} />
            </div>
            <input type="hidden" name="cf-turnstile-response" value={token} />
          </div>
        ) : DISABLE_TURNSTILE ? (
          <div className="text-gray-500 mt-3 text-center">Turnstile deshabilitado (modo desarrollo)</div>
        ) : (
          <div className="text-orange-600 mt-3 text-center">Turnstile no configurado (VITE_TURNSTILE_SITE_KEY faltante)</div>
        )}

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        {msg && <p className="mt-3 text-center text-sm text-gray-700">{msg}</p>}
      </form>
      </div>

      {/* Footer institucional con logo/imagen de la campaña. Se coloca fuera del
          contenedor central para que quede al pie de la pantalla. */}
      <footer className="login-footer">
        <img
          src={footerGob}
          alt="Pie de página - Gobierno / JUNAEB 2026"
          className="footer-image"
        />
      </footer>
    </div>
  )
}

export default Login
