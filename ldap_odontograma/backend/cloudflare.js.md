# Documentación automática para cloudflare.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
import axios from 'axios'

/**
 * Verifica el token de Cloudflare Turnstile usando la variable de entorno
 * `TURNSTILE_SECRET`. Devuelve el objeto de respuesta de la API de
 * Cloudflare o `{ success: true, skipped: true }` cuando no hay secreto.
 */
export async function verifyTurnstile(token) {
  // Allow bypassing Turnstile in development/testing by setting DISABLE_TURNSTILE=1
  if (process.env.DISABLE_TURNSTILE === '1') return { success: true, skipped: true }
  const secret = process.env.TURNSTILE_SECRET
  if (!secret) return { success: true, skipped: true }

  try {
    const params = new URLSearchParams()
    params.append('secret', secret)
    params.append('response', token || '')

    const res = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    return res.data
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  }
}

export default verifyTurnstile

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
