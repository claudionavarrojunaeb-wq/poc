# Documentación de frontend/src/ResetPassword.tsx

## Propósito

Componente de React que permite al usuario completar el flujo de recuperación de contraseña tras haber solicitado el código por correo:

- Verificar el código recibido (`POST /api/forgot-password/verify`).
- Introducir y validar la nueva contraseña, y enviar el cambio (`POST /api/forgot-password/reset`).

## Código fuente

```tsx
import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Login.css'

const ResetPassword: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const initUsername = (location.state && (location.state as any).username) || ''

  const [username, setUsername] = useState<string>(initUsername)
  const [code, setCode] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [passwordRepeat, setPasswordRepeat] = useState<string>('')
  const [msg, setMsg] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [verified, setVerified] = useState<boolean>(false)

  // handleVerify -> POST /api/forgot-password/verify
  // handleReset  -> POST /api/forgot-password/reset

  return (
    <div className="login-page"> ...</div>
  )
}

export default ResetPassword
```

## Explicación resumida

- El componente prellena el campo `username` si el usuario fue redirigido desde `Login` con `state`.
- `handleVerify` valida el código contra el backend; si es correcto, muestra el formulario de nueva contraseña.
- `handleReset` envía la nueva contraseña (y la repetición) al backend para aplicar el cambio.
- En caso de éxito redirige a `/login`.

## Notas

- Este componente usa los mismos estilos de `Login.css` para mantener coherencia visual.
- La validación de complejidad y la verificación de historial se realizan en el backend.
