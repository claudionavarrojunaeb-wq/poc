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
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'

// Routers de dominio
import authRouter       from './routes/auth.js'
import mailRouter       from './routes/mail.js'
import logsViewerRouter from './routes/logsViewer.js'
import projectViewerRouter from './routes/projectViewer.js'
import metricsRouter    from './routes/metrics.js'
import graphRouter      from './routes/graph.js'
import csvRouter        from './routes/csv.js'
import logRouter        from './routes/log.js'
import { requireAuth } from './middleware/session.js'


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
  },
  // Permitir credenciales (cookies httpOnly) en llamadas cross-origin
  credentials: true,
}))

// Parsear body JSON; los errores de JSON inválido caen en errorHandler
// Añadimos `verify` para capturar el body crudo en `req.rawBody` y poder
// diagnosticar problemas de parsing sin alterar la semántica del parser.
app.use(bodyParser.json({
  // Incrementamos el límite para permitir subidas de CSV grandes en JSON
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    try {
      req.rawBody = buf.toString(encoding || 'utf8')
    } catch {
      req.rawBody = ''
    }
  }
}))

// Parse cookies para leer el cookie de sesión firmado (HttpOnly)
app.use(cookieParser())

// ─── Montaje de rutas (API Gateway) ───────────────────────────────────────────
app.use(authRouter)                      // POST /api/login, POST /api/forgot-password
app.use(mailRouter)                      // POST /api/send-email
app.use('/api/logsViewer', logsViewerRouter) // GET /api/logsViewer/list|search|file
app.use('/api/project', requireAuth, projectViewerRouter) // GET /api/project/list|file|download (protegido)
app.use('/api/metrics', metricsRouter)   // GET /api/metrics
app.use('/api/graph', graphRouter)       // Microsoft Graph OAuth + contacts
app.use('/api/csv', csvRouter)           // CSV import endpoints
app.use('/api/log', logRouter)           // Estadísticas y registros de la tabla log

// Ruta de comprobación rápida para desarrollo
app.get('/api/project/_ping', (req, res) => res.json({ ok: true }))

// Ruta debug: listar rutas registradas (solo en desarrollo)
app.get('/__routes', (req, res) => {
  try {
    const routes = []
    app._router.stack.forEach((mw) => {
      if (mw.route && mw.route.path) {
        routes.push({ path: mw.route.path, methods: Object.keys(mw.route.methods) })
      } else if (mw.name === 'router' && mw.handle && mw.handle.stack) {
        mw.handle.stack.forEach((r) => {
          if (r.route && r.route.path) routes.push({ path: r.route.path, methods: Object.keys(r.route.methods) })
        })
      }
    })
    return res.json({ routes })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

// ─── Error handler global ─────────────────────────────────────────────────────
// Debe ir después de todos los routers
app.use(errorHandler)

// ─── Arrancar servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`)
})
