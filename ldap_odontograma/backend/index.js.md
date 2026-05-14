# Documentación automática para index.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/index.js — API Gateway
 * --------------------------------
 * Punto de entrada del servidor Express. Su único rol es:
 *   1. Configurar middlewares globales (CORS, body-parser).
 *   2. Montar los routers de dominio en la aplicación.
 *   3. Registrar el error handler global.
 *   4. Arrancar el servidor HTTP.
 *
 * Toda la lógica de negocio y acceso a datos reside en módulos especializados:
 *
 *   backend/db.js                      — Pool PostgreSQL + logLoginAttempt
 *   backend/ldapts.js                  — Lógica LDAP pura
 *   backend/cloudflare.js              — Verificación Cloudflare Turnstile
 *   backend/mailer.js                  — Transporter SMTP
 *   backend/middleware/turnstile.js    — Middleware CAPTCHA
 *   backend/middleware/errorHandler.js — Handler global de errores
 *   backend/routes/auth.js             — POST /api/login, POST /api/forgot-password
 *   backend/routes/mail.js             — POST /api/send-email
 *
 * NOTA sobre dotenv:
 *   db.js llama a dotenv.config() y es importado transitivamente por routes/auth.js
 *   antes de que el cuerpo de este archivo corra. Por eso PORT y CORS_ORIGIN
 *   ya están disponibles cuando se leen abajo.
 */

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

// Routers de dominio
import authRouter       from './routes/auth.js'
import mailRouter       from './routes/mail.js'
import logsViewerRouter from './routes/logsViewer.js'

// Middleware global de errores (debe ir después de todos los routers)
import { errorHandler } from './middleware/errorHandler.js'

// ─── Aplicación Express ────────────────────────────────────────────────────────
const app = express()
const PORT = process.env.PORT || 4000

// ─── CORS ─────────────────────────────────────────────────────────────────────
// CORS_ORIGIN acepta un valor único o lista separada por comas.
// Ejemplo: CORS_ORIGIN=http://localhost:5173,http://10.162.14.62:5173
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Sin origin: curl, Postman, proxies internos — dejar pasar
    if (!origin) return callback(null, true)
    if (CORS_ORIGINS.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked: ${origin}`))
  }
}))

// Parsear body JSON; los errores de JSON inválido caen en errorHandler
app.use(bodyParser.json())

// ─── Montaje de rutas (API Gateway) ───────────────────────────────────────────
app.use(authRouter)                      // POST /api/login, POST /api/forgot-password
app.use(mailRouter)                      // POST /api/send-email
app.use('/api/logsViewer', logsViewerRouter) // GET /api/logsViewer/list|search|file

// ─── Error handler global ─────────────────────────────────────────────────────
// Debe ir después de todos los routers
app.use(errorHandler)

// ─── Arrancar servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`)
})

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
