import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Login.css'

// Mapa de códigos de error del backend a mensajes amigables en español.
// Cubre todos los códigos posibles de /api/forgot-password/verify y /reset.
const FRIENDLY_ERRORS: Record<string, string> = {
  'ldap-user-no-reset': 'Los usuarios internos no pueden cambiar su contraseña por este medio.',
  'user-not-found': 'No se encontró ningún usuario con ese correo electrónico.',
  'invalid-or-expired-code': 'Código inválido o expirado. Solicite un nuevo código.',
  'password-complexity-failed': 'La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial (no alfanumérico).',
  'password-reused': 'No puede reutilizar ninguna de sus últimas 5 contraseñas.',
  'passwords-do-not-match': 'Las contraseñas ingresadas no coinciden.',
  'missing-parameters': 'Complete todos los campos requeridos.',
}

const ResetPassword: React.FC = () => {
  const location = useLocation() as { state?: { username?: string } }
  const navigate = useNavigate()
  const initUsername = (location.state && location.state.username) || ''

  const [username, setUsername] = useState<string>(initUsername)
  const [code, setCode] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [passwordRepeat, setPasswordRepeat] = useState<string>('')
  const [msg, setMsg] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [verified, setVerified] = useState<boolean>(false)

  const handleVerify = async () => {
    setMsg('')
    if (!username || !code) { setMsg('Ingrese usuario y código'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code })
      })
      const ct = res.headers.get('content-type') || ''
      let data: unknown = null
      if (ct.includes('application/json')) {
        try { data = await res.json() } catch { const t = await res.text(); setMsg(`Respuesta no JSON: ${t || res.statusText}`); setLoading(false); return }
      } else {
        const t = await res.text(); setMsg(`Respuesta inesperada: ${t || res.statusText}`); setLoading(false); return
      }

      if (!res.ok) {
        let err = 'Código inválido'
        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>
          const eVal = obj['error']
          // Traducir código de error a mensaje amigable
          if (typeof eVal === 'string') err = FRIENDLY_ERRORS[eVal] ?? eVal
          else if (eVal !== undefined) err = String(eVal)
        }
        setMsg(err)
      } else {
        setMsg('Código validado. Ingrese nueva contraseña.')
        setVerified(true)
      }
    } catch (err) {
      setMsg(String(err))
    } finally { setLoading(false) }
  }

  const handleReset = async () => {
    setMsg('')
    if (!username || !code || !password || !passwordRepeat) { setMsg('Complete todos los campos'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code, password, passwordRepeat })
      })
      const ct = res.headers.get('content-type') || ''
      let data: unknown = null
      if (ct.includes('application/json')) {
        try { data = await res.json() } catch { const t = await res.text(); setMsg(`Respuesta no JSON: ${t || res.statusText}`); setLoading(false); return }
      } else {
        const t = await res.text(); setMsg(`Respuesta inesperada: ${t || res.statusText}`); setLoading(false); return
      }

      if (!res.ok) {
        let err = 'Error al cambiar contraseña'
        if (data && typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>
          const eVal = obj['error']
          // Traducir código de error a mensaje amigable
          if (typeof eVal === 'string') err = FRIENDLY_ERRORS[eVal] ?? eVal
          else if (eVal !== undefined) err = String(eVal)
        }
        setMsg(err)
      } else {
        setMsg('Contraseña cambiada correctamente. Redirigiendo al login...')
        setTimeout(() => navigate('/login'), 1200)
      }
    } catch (err) {
      setMsg(String(err))
    } finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="flex-1 flex items-center justify-center">
        <div className="login-card">
          <h2 className="login-title">Recuperar contraseña</h2>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-600 mb-2">Correo electrónico</label>
            <input className="login-input" type="email" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="correo@ejemplo.cl" />
          </div>

          {!verified ? (
            <>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-600 mb-2">Código</label>
                <input className="login-input" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código recibido por correo" />
              </div>

              <div className="flex justify-between items-center">
                <button onClick={handleVerify} disabled={loading} className="submit-button">{loading ? 'Verificando...' : 'Verificar código'}</button>
                <button onClick={() => { navigate('/login') }} className="ml-3 p-2 text-sm">Volver al login</button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-600 mb-2">Nueva contraseña</label>
                <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nueva contraseña" />
              </div>

              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-600 mb-2">Repetir contraseña</label>
                <input className="login-input" type="password" value={passwordRepeat} onChange={(e) => setPasswordRepeat(e.target.value)} placeholder="Repetir contraseña" />
              </div>

              <div className="flex justify-between items-center">
                <button onClick={handleReset} disabled={loading} className="submit-button">{loading ? 'Guardando...' : 'Cambiar contraseña'}</button>
                <button onClick={() => { navigate('/login') }} className="ml-3 p-2 text-sm">Cancelar</button>
              </div>
            </>
          )}

          {msg && <p className="mt-3 text-center text-sm text-gray-700">{msg}</p>}
        </div>
      </div>
    </div>
  )
}

export default ResetPassword
