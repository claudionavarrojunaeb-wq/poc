# Documentación automática para auth.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/routes/auth.js
 * -----------------------
 * Router Express con las rutas de autenticación e identidad de usuario:
 *
 *   POST /api/login          — Autenticación LDAP (usertipo=1) o contraseña directa (usertipo=2)
 *   POST /api/forgot-password — Recuperación de contraseña por correo electrónico
 *
 * Dependencias:
 *   - ../db.js           → pool (consultas a `users` y `auditoriaaccesos`)
 *   - ../ldapts.js       → buildPrincipalFormats, tryBind (lógica LDAP pura)
 *   - ../mailer.js       → ensureTransporter, getPreviewUrl (envío de correo)
 *   - ../middleware/turnstile.js → turnstileMiddleware (validación CAPTCHA)
 */

import { Router } from 'express'
import { pool, logLoginAttempt } from '../db.js'
import { buildPrincipalFormats, tryBind } from '../ldapts.js'
import { ensureTransporter, getPreviewUrl } from '../mailer.js'
import { turnstileMiddleware } from '../middleware/turnstile.js'
import { logError } from '../lib/errorLog.js'

// Crear router independiente; se montará en `app.use(authRouter)` en index.js.
// Al no usar un prefijo base, las rutas usan su path completo (/api/login, etc.)
// para mantener compatibilidad con el frontend sin cambiar URLs.
const router = Router()

// ─── POST /api/login ──────────────────────────────────────────────────────────
//
// Flujo:
//   1. Validar campos requeridos (username, password).
//   2. Consultar `users` para obtener `usertipo`, `useremail` y `userpwd`.
//   3a. usertipo=2 (usuario externo): comparar contraseña directamente con `userpwd`.
//   3b. usertipo=1 o sin registro: intentar bind LDAP con múltiples formatos de principal.
//   4. Registrar el evento en `auditoriaaccesos` vía `logLoginAttempt`.
//
// El middleware `turnstileMiddleware` se ejecuta antes del handler para verificar
// el token CAPTCHA de Cloudflare enviado por el frontend.
router.post('/api/login', turnstileMiddleware, async (req, res) => {
  // Extraer credenciales del body JSON
  const { username, password } = req.body || {}

  // Obtener IP real del cliente: X-Forwarded-For si está detrás de un proxy/balanceador,
  // de lo contrario la IP del socket TCP directo.
  const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip

  // User-Agent para trazabilidad en auditoría
  const ua = (req.headers && req.headers['user-agent']) ? req.headers['user-agent'] : null

  // ── Validación de campos requeridos ──────────────────────────────────────────
  if (!username || !password) {
    // Registrar intento malformado antes de responder
    try {
      await logLoginAttempt({
        loginInput: username || null,
        eventType: 'LOGIN_BAD_REQUEST',
        details: 'username or password missing',
        ip: remoteIp,
        ua
      })
    } catch (e) { /* ignorar error de auditoría */ }
    return res.status(400).json({ error: 'username and password required' })
  }

  // ── Paso 1: buscar el usuario en la BD ───────────────────────────────────────
  // Se obtiene `usertipo` para decidir el método de autenticación,
  // `useremail` como posible principal LDAP alternativo,
  // `userpwd` para la comparación directa en usuarios externos.
  let userRow = null
  try {
    const result = await pool.query(
      'SELECT usertipo, useremail, userpwd FROM users WHERE username = $1 LIMIT 1',
      [username]
    )
    if (result && result.rowCount > 0) userRow = result.rows[0]
  } catch (dbErr) {
    // Si la BD no está disponible, se continúa con usertipo=1 (LDAP) como fallback.
    // En producción, esto podría indicar un problema grave; loguear para visibilidad.
    console.error('login DB query error', dbErr && dbErr.message)
  }

  // Si no se encontró el usuario, asumir usuario interno (LDAP)
  const userTipo = userRow ? Number(userRow.usertipo) : 1

  // ── Paso 2a: usuario externo (usertipo=2) ────────────────────────────────────
  // La contraseña se almacena en texto plano en `userpwd` (responsabilidad del admin).
  // Se compara directamente sin hashing.
  if (userTipo === 2) {
    const storedPwd = userRow && userRow.userpwd

    // Sin contraseña configurada: no hay forma de autenticar al usuario
    if (!storedPwd) {
      try {
        await logLoginAttempt({
          loginInput: username,
          eventType: 'LOGIN_FAILED',
          details: 'No password configured for user',
          ip: remoteIp,
          ua
        })
      } catch (e) { /* ignorar */ }
      return res.status(401).json({ error: 'invalid-credentials', detail: 'No password configured for user' })
    }

    // Contraseña incorrecta
    if (password !== storedPwd) {
      try {
        await logLoginAttempt({
          loginInput: username,
          eventType: 'LOGIN_FAILED',
          details: 'Wrong password',
          ip: remoteIp,
          ua
        })
      } catch (e) { /* ignorar */ }
      return res.status(401).json({ error: 'invalid-credentials', detail: 'Wrong password' })
    }

    // Autenticación exitosa — usuario externo
    try {
      await logLoginAttempt({
        loginInput: username,
        eventType: 'LOGIN_SUCCESS',
        details: 'External password match',
        ip: remoteIp,
        ua
      })
    } catch (e) { /* ignorar */ }
    return res.json({ ok: true, tipo: 'external' })
  }

  // ── Paso 2b: usuario interno (usertipo=1 o sin registro) — LDAP ──────────────
  // `buildPrincipalFormats` genera todos los formatos de principal posibles:
  //   uid=X,dc=..., cn=X,dc=..., X@dominio, NETBIOS\X, X
  // Si el usuario tiene `useremail` en la BD, se añade primero como candidato prioritario.
  const ldapUrl = process.env.LDAP_URL
  const principals = (userRow && userRow.useremail)
    ? [userRow.useremail, ...buildPrincipalFormats(username)]
    : buildPrincipalFormats(username)

  // Intentar bind con cada principal en orden hasta que uno tenga éxito.
  // Se usa `for...of` con await para probar secuencialmente (no en paralelo,
  // para no saturar el servidor LDAP con múltiples conexiones simultáneas).
  for (const principal of principals) {
    try {
      console.log(`Attempting LDAP bind for principal: ${principal}`)
      // eslint-disable-next-line no-await-in-loop
      await tryBind(ldapUrl, principal, password)
      console.log(`LDAP bind succeeded for principal: ${principal}`)

      // Registrar éxito indicando el principal que funcionó
      try {
        await logLoginAttempt({
          loginInput: username,
          eventType: 'LOGIN_SUCCESS',
          details: `principal:${principal}`,
          ip: remoteIp,
          ua
        })
      } catch (e) { /* ignorar */ }

      return res.json({ ok: true, tipo: 'internal', principal })
    } catch (err) {
      // Este principal falló — intentar con el siguiente
      console.warn(`Bind failed for principal ${principal}:`, err && err.message ? err.message : String(err))
    }
  }

  // Ningún formato de principal funcionó: credenciales inválidas
  try {
    await logLoginAttempt({
      loginInput: username,
      eventType: 'LOGIN_FAILED',
      details: 'All bind attempts failed',
      ip: remoteIp,
      ua
    })
  } catch (e) { /* ignorar */ }
  return res.status(401).json({ error: 'invalid-credentials', detail: 'All bind attempts failed' })
})

// ─── POST /api/forgot-password ────────────────────────────────────────────────
//
// Busca el `useremail` y `userpwd` del usuario en la BD y envía la contraseña
// al correo registrado. Si el usuario no existe, responde con 404.
// Los errores SMTP se clasifican en "relay-rejected" (502) o "send-failed" (500).
router.post('/api/forgot-password', async (req, res) => {
  const { username } = req.body || {}

  // Validar campo requerido
  if (!username) return res.status(400).json({ error: 'username required' })

  try {
    // Consultar usuario para obtener email y contraseña almacenada
    const result = await pool.query(
      'SELECT useremail, userpwd FROM users WHERE username = $1 LIMIT 1',
      [username]
    )

    // Usuario no encontrado en la BD
    if (!result || result.rowCount === 0) {
      return res.status(404).json({ error: 'user-not-found' })
    }

    const { useremail, userpwd } = result.rows[0]

    // Construir opciones del correo
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: useremail,
      subject: 'Recuperación de contraseña',
      text: `La contraseña es: ${userpwd}`,
    }

    // `ensureTransporter()` obtiene o crea el transporter SMTP de forma lazy
    const tx = await ensureTransporter()
    const info = await tx.sendMail(mailOptions)

    // Construir respuesta; `getPreviewUrl` devuelve URL de Ethereal en modo test
    const resp = { ok: true, messageId: info.messageId, accepted: info.accepted || [] }
    const previewUrl = getPreviewUrl(info)
    if (previewUrl) resp.previewUrl = previewUrl

    return res.json(resp)

  } catch (err) {
    console.error('forgot-password error', err)

    // Normalizar texto del error para clasificarlo (debe ir antes de logError)
    const errText = (err && (err.response || err.message)) ? (err.response || err.message) : String(err)

    // Detectar rechazo del relay SMTP (error del servidor de correo, no nuestro)
    const isRelayReject = Boolean(
      (err && err.code === 'EENVELOPE') ||
      (err && err.responseCode && Number(err.responseCode) >= 400) ||
      (err && Array.isArray(err.rejectedErrors) && err.rejectedErrors.length > 0) ||
      /Client host rejected|all recipients were rejected|454|5\.[0-9]+\.[0-9]+/.test(errText)
    )

    // Registrar en archivo JSONL diario
    logError(err, { context: 'forgot-password', req, status: isRelayReject ? 502 : 500 })

    try {
      console.error('forgot err.code', err && err.code)
      console.error('forgot err.responseCode', err && err.responseCode)
      console.error('forgot err.response', err && err.response)
      console.error('forgot err.rejectedErrors', err && err.rejectedErrors)
    } catch (inspectErr) {
      console.error('forgot inspect error', inspectErr)
    }

    if (isRelayReject) return res.status(502).json({ error: 'relay-rejected', detail: errText })
    return res.status(500).json({ error: 'send-failed', detail: errText })
  }
})

export default router

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
