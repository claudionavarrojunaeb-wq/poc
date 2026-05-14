/**
 * backend/middleware/turnstile.js
 * --------------------------------
 * Middleware Express para verificar tokens de Cloudflare Turnstile.
 *
 * Cloudflare Turnstile es el reemplazo de CAPTCHA: el frontend obtiene un token
 * que el backend debe validar contra la API de Cloudflare antes de procesar la petición.
 *
 * El token se busca en este orden de precedencia:
 *   1. `req.body.token`                 — body JSON estándar del frontend
 *   2. `cf-turnstile-response` header   — cabecera nativa de Cloudflare
 *   3. `x-turnstile-response` header    — alias alternativo
 *   4. `x-turnstile-token` header       — alias alternativo
 *   5. `turnstile-token` header         — alias alternativo
 *   6. null (no se encontró token)
 *
 * Si `DISABLE_TURNSTILE=1` (modo dev) o `TURNSTILE_SECRET` no está configurado,
 * `verifyTurnstile` retorna `{ skipped: true }` y el middleware deja pasar la petición.
 */

import { verifyTurnstile } from '../cloudflare.js'

/**
 * turnstileMiddleware
 * Middleware de Express que verifica el token Turnstile.
 * Se usa como segundo argumento en `router.post('/api/login', turnstileMiddleware, handler)`.
 *
 * En caso de éxito adjunta `req.turnstile = verification` para que el handler
 * descendente pueda acceder al resultado si lo necesita.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function turnstileMiddleware(req, res, next) {
  try {
    // Extraer el token desde body o cabeceras (en orden de prioridad)
    const token =
      (req.body && req.body.token) ||
      req.headers['cf-turnstile-response'] ||
      req.headers['x-turnstile-response'] ||
      req.headers['x-turnstile-token'] ||
      req.headers['turnstile-token'] ||
      null

    // `verifyTurnstile` retorna { success: true } si OK,
    // { skipped: true } si se omite (dev/sin secret), o { success: false, ... } si falla.
    const verification = await verifyTurnstile(token)

    if (verification && (verification.success || verification.skipped)) {
      // Adjuntar resultado al request para uso opcional en handlers
      req.turnstile = verification
      return next()
    }

    // Token inválido: rechazar con 400 y devolver detalles del fallo
    return res.status(400).json({ error: 'turnstile-failed', details: verification })

  } catch (err) {
    // Error inesperado en la llamada a la API de Cloudflare
    console.error('turnstile middleware error', err)
    return res.status(500).json({
      error: 'turnstile-error',
      details: err && err.message ? err.message : String(err)
    })
  }
}
