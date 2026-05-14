# Documentación automática para mail.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/routes/mail.js
 * -----------------------
 * Router Express con la ruta de envío genérico de correo electrónico:
 *
 *   POST /api/send-email — Envía un correo con el payload del body
 *
 * Esta ruta es de propósito general (pruebas, notificaciones, integraciones).
 * La ruta de recuperación de contraseña está en routes/auth.js porque
 * involucra lógica de identidad de usuario.
 *
 * Dependencias:
 *   - ../mailer.js → ensureTransporter, getPreviewUrl
 *   - fs, path, util → volcado de diagnóstico a archivos en log/
 */

import { Router } from 'express'
import { ensureTransporter, getPreviewUrl } from '../mailer.js'
import { logError } from '../lib/errorLog.js'
import fs from 'fs'
import path from 'path'
import util from 'util'

// Router independiente; se monta en app.use(mailRouter) en index.js
const router = Router()

// ─── POST /api/send-email ─────────────────────────────────────────────────────
//
// Recibe un payload JSON con `to`, `subject`, `text`/`html` y opcionalmente `from`.
// Vuelca información de diagnóstico a `log/send-email-req-<ts>.json` para facilitar
// la depuración sin necesidad de inspeccionar la consola del servidor.
//
// Body esperado:
//   { to: string, subject: string, text?: string, html?: string, from?: string }
//
// Respuesta exitosa:
//   { ok: true, messageId: string, accepted: string[], previewUrl?: string }
//
// Errores:
//   400 — faltan campos requeridos
//   502 — relay SMTP rechazó el mensaje
//   500 — error interno al enviar
router.post('/api/send-email', async (req, res) => {
  // IP del cliente para trazabilidad en los archivos de log
  const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip

  // Log mínimo en consola con metadatos de la petición (sin contraseñas ni datos sensibles)
  console.log('Incoming POST /api/send-email', JSON.stringify({
    time: new Date().toISOString(),
    remoteIp,
    origin: req.headers && req.headers.origin,
    ua: req.headers && req.headers['user-agent'],
    preview: {
      to:      req.body && req.body.to,
      from:    req.body && req.body.from,
      subject: req.body && req.body.subject,
      hasText: Boolean(req.body && req.body.text),
      hasHtml: Boolean(req.body && req.body.html)
    }
  }))

  // ── Volcado a archivo para diagnóstico offline ───────────────────────────────
  // Permite revisar qué llegó al endpoint incluso si la consola no está disponible.
  // Se escribe sincrónicamente para garantizar que el archivo exista antes de responder.
  try {
    const logDir = path.join(process.cwd(), 'log')
    // Crear la carpeta log/ si no existe (p.ej. primer arranque en un entorno nuevo)
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const reqFile = path.join(logDir, `send-email-req-${Date.now()}.json`)
    const dumpReq = {
      timestamp: new Date().toISOString(),
      remoteIp,
      origin: req.headers && req.headers.origin,
      preview: {
        to:      req.body && req.body.to,
        from:    req.body && req.body.from,
        subject: req.body && req.body.subject,
        hasText: Boolean(req.body && req.body.text),
        hasHtml: Boolean(req.body && req.body.html)
      }
    }
    fs.writeFileSync(reqFile, JSON.stringify(dumpReq, null, 2), 'utf8')
    console.error('Wrote send-email request file:', reqFile)
  } catch (writeErr) {
    // El fallo al escribir el diagnóstico no debe bloquear el envío del correo
    console.error('Failed writing send-email request file', writeErr)
  }

  // ── Validar campos requeridos ────────────────────────────────────────────────
  const { to, subject, text, html, from } = req.body || {}
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'to, subject and text/html required' })
  }

  // ── Construir opciones del correo ────────────────────────────────────────────
  // `from` puede venir en el body (override del frontend) o de las variables de entorno.
  const mailOptions = {
    from: from || process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
    html,
  }

  // ── Intentar envío ───────────────────────────────────────────────────────────
  try {
    const tx = await ensureTransporter()
    const info = await tx.sendMail(mailOptions)

    // Construir respuesta exitosa; previewUrl solo se incluye en modo test (Ethereal)
    const resp = { ok: true, messageId: info.messageId, accepted: info.accepted || [] }
    const previewUrl = getPreviewUrl(info)
    if (previewUrl) resp.previewUrl = previewUrl

    return res.json(resp)

  } catch (err) {
    console.error('sendMail error', err)

    // Registrar en archivo JSONL diario antes de cualquier otro diagnóstico
    logError(err, { context: 'send-email', req })

    // Log detallado de propiedades SMTP para diagnóstico en consola
    try {
      console.error('sendMail err.code',          err && err.code)
      console.error('sendMail err.responseCode',  err && err.responseCode)
      console.error('sendMail err.response',      err && err.response)
      console.error('sendMail err.rejected',      err && err.rejected)
      console.error('sendMail err.rejectedErrors',err && err.rejectedErrors)
    } catch (inspectErr) {
      console.error('sendMail inspect error', inspectErr)
    }

    // ── Volcado del error a archivo para diagnóstico offline ──────────────────
    // Incluye el error completo serializado con util.inspect para máxima visibilidad.
    try {
      const logDir = path.join(process.cwd(), 'log')
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
      const logFile = path.join(logDir, `smtp-debug-${Date.now()}.log`)
      const dump = {
        timestamp: new Date().toISOString(),
        mailOptions,
        err: {
          message:       err && err.message,
          response:      err && err.response,
          responseCode:  err && err.responseCode,
          code:          err && err.code,
          rejected:      err && err.rejected,
          rejectedErrors:err && err.rejectedErrors,
          stack:         err && err.stack,
          raw:           util.inspect(err, { depth: 10 })
        }
      }
      fs.writeFileSync(logFile, JSON.stringify(dump, null, 2), 'utf8')
      console.error('Wrote SMTP debug file:', logFile)
    } catch (logErr) {
      console.error('Failed writing SMTP debug file', logErr)
    }

    // Normalizar el texto del error para poder clasificarlo
    const errText = (err && (err.response || err.message)) ? (err.response || err.message) : String(err)

    // Detectar si el error viene del servidor de relay (4xx/5xx SMTP, EENVELOPE, rechazados)
    // En ese caso responder 502 (Bad Gateway) porque el problema es upstream, no nuestro.
    const isRelayReject = Boolean(
      (err && err.code === 'EENVELOPE') ||
      (err && err.responseCode && Number(err.responseCode) >= 400) ||
      (err && Array.isArray(err.rejectedErrors) && err.rejectedErrors.length > 0) ||
      /Client host rejected|all recipients were rejected|454|5\.[0-9]+\.[0-9]+/.test(errText)
    )

    if (isRelayReject) return res.status(502).json({ error: 'relay-rejected', detail: errText })
    return res.status(500).json({ error: 'send-failed', detail: errText })
  }
})

export default router

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
