# Documentación detallada de frontend/src/Login.tsx

## Código fuente

```tsx
import React, { useEffect, useState, useRef } from 'react'
import { FaEyeSlash } from 'react-icons/fa'
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

  useEffect(() => {
    let mounted = true
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
        // ignore
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setLoading(true)
      try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, token })
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(data.error || 'Error en login')
      } else {
        setMsg('Autenticación correcta')
        window.location.pathname = '/dashboard'
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
          <label htmlFor="username" className="block text-sm font-medium text-gray-600 mb-2">Usuario</label>
          <input id="username" className="login-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nombre.usuario" />
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
        </div>

        {SITE_KEY ? (
          <div className="mt-4">
            <div className="mx-auto bg-white border border-gray-200 rounded-md p-3 shadow-sm max-w-md">
              <div ref={turnstileRef} />
            </div>
            <input type="hidden" name="cf-turnstile-response" value={token} />
          </div>
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
```

## Explicación detallada

- Resumen: Componente de login que muestra un formulario, integra Cloudflare Turnstile para protección anti-bots, y redirige a `/dashboard` al autenticarse correctamente.

**Importaciones clave:**
- `react`, `useEffect`, `useState`, `useRef`: hooks usados por el componente.
- `FaEyeSlash` de `react-icons`: icono usado para el botón "ojo" que alterna visibilidad de la contraseña.
- `./App.css`, `./Login.css`: estilos locales del componente y estilos globales de la app.
- `footerGob`: imagen usada en el footer.

**Declaraciones globales:**
- Extiende `window` para declarar propiedades opcionales: `onTurnstileToken`, `turnstile` y `__cspNonce`.
- `SITE_KEY` se obtiene desde `import.meta.env.VITE_TURNSTILE_SITE_KEY`.

**Funciones auxiliares:**
- `loadTurnstileScript()`: Inyecta el script de Cloudflare Turnstile de forma segura, intentando setear `nonce` si existe.

**Hooks y efectos:**
- `useEffect` principal: carga el script Turnstile y reintenta el render hasta que la API esté disponible; registra `window.onTurnstileToken` para recibir el token.

**Manejo del formulario:**
- `handleSubmit`: envía `username`, `password` y `token` a `POST /api/login`. Maneja estados `loading` y `msg`.
- En caso de éxito redirige a `/dashboard`.

**Estructura del JSX:**
- Formulario con campos `username` y `password`.
- Botón para alternar visibilidad de la contraseña usando `FaEyeSlash`.
- Contenedor para Turnstile (renderizado por `window.turnstile.render`).
- Footer con imagen.

## Notas adicionales
- El componente asume que el endpoint `/api/login` está disponible en el backend.
- Se manejan nonces CSP cuando están presentes, para compatibilidad con políticas de seguridad en entornos restringidos.

- Al solicitar recuperación de contraseña (`Olvidé mi contraseña`) el `Login` ahora
  redirige al usuario a la ruta `/reset-password` tras enviar el correo con el código.
  La ruta recibirá el `username` por `location.state` para prellenar el formulario.

---

Nota: Esta documentación fue generada automáticamente y puede ampliarse con ejemplos de respuesta del backend o diagramas de flujo de autenticación.
