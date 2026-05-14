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
import crypto from 'crypto'
// argon2id — ganador del Password Hashing Competition 2015, recomendado por NIST.
// Proporciona resistencia a ataques de fuerza bruta, GPU y side-channel.
// La variante argon2id combina protección de argon2i (side-channel) y argon2d (GPU).
import argon2 from 'argon2'
import { pool, logLoginAttempt } from '../db.js'
import { buildPrincipalFormats, tryBind } from '../ldapts.js'
import { ensureTransporter, getPreviewUrl } from '../mailer.js'
import { turnstileMiddleware } from '../middleware/turnstile.js'
import { logError } from '../lib/errorLog.js'
import { signSession, setSessionCookie, clearSessionCookie, setRefreshCookie, clearRefreshCookie, createRefreshToken, rotateRefreshToken, findValidRefreshToken, revokeRefreshToken, requireAuth } from '../middleware/session.js'
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie, verifyCsrf } from '../middleware/csrf.js'

// ─── Helpers de hashing ───────────────────────────────────────────────────────
// Opciones argon2id para producción: memoria 64 MB, 3 iteraciones, 4 hilos.
// Estos valores superan los mínimos OWASP y ofrecen un balance seguridad/performance.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iteraciones
  parallelism: 4     // hilos paralelos
}

/**
 * hashPassword — genera un hash argon2id de la contraseña.
 * El hash incluye la sal y los parámetros, por lo que puede almacenarse
 * directamente en la BD como string opaco.
 * @param {string} plaintext — contraseña en texto plano
 * @returns {Promise<string>} hash argon2id
 */
async function hashPassword(plaintext) {
  return argon2.hash(plaintext, ARGON2_OPTIONS)
}

/**
 * verifyPassword — verifica una contraseña contra su hash argon2id.
 * Soporta migración transparente: si el hash almacenado NO comienza con '$argon2'
 * se asume texto plano (legado) y se compara directamente. En ese caso retorna
 * también `legacy: true` para que la capa de llamada pueda rehashear y actualizar la BD.
 * @param {string} stored — hash almacenado (o texto plano en sistemas legado)
 * @param {string} plaintext — contraseña ingresada por el usuario
 * @returns {Promise<{valid: boolean, legacy: boolean}>}
 */
async function verifyPassword(stored, plaintext) {
  // Detectar hash argon2 por el prefijo estándar del PHC String Format
  if (stored && stored.startsWith('$argon2')) {
    const valid = await argon2.verify(stored, plaintext)
    return { valid, legacy: false }
  }
  // Contraseña legado en texto plano — comparación directa.
  // Se usa `crypto.timingSafeEqual` para evitar timing-attacks en comparación de strings.
  const storedBuf = Buffer.from(stored || '')
  const inputBuf  = Buffer.from(plaintext || '')
  const valid = storedBuf.length === inputBuf.length &&
    crypto.timingSafeEqual(storedBuf, inputBuf)
  return { valid, legacy: true }
}

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
    } catch { /* ignorar error de auditoría */ }
    return res.status(400).json({ error: 'username and password required' })
  }

  // ── Paso 1: buscar el usuario en la BD ───────────────────────────────────────
  // Se obtiene `usertipo` para decidir el método de autenticación,
  // `useremail` como posible principal LDAP alternativo,
  // `userpwd` para la comparación (hash) en usuarios externos,
  // `userid` para poder rehashear la contraseña en caso de migración desde texto plano.
  let userRow = null
  try {
    // El usuario ingresa su correo electrónico como identificador de login
    // (columna useremail). Se busca exclusivamente por esa columna.
    const result = await pool.query(
      'SELECT userid, usertipo, useremail, userpwd FROM users WHERE useremail = $1 LIMIT 1',
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
  // La contraseña se verifica con argon2id. Si el registro es texto plano (legado),
  // `verifyPassword` lo detecta y realiza la migración transparente rehashando
  // la contraseña correcta y guardando el nuevo hash en la BD.
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
      } catch { /* ignorar */ }
      return res.status(401).json({ error: 'invalid-credentials', detail: 'No password configured for user' })
    }

    // Verificar contraseña (soporta hash argon2id y texto plano legado)
    let verifyResult
    try {
      verifyResult = await verifyPassword(storedPwd, password)
    } catch (hashErr) {
      // Error interno del motor de hashing — no revelar detalle al cliente
      logError(hashErr, { context: 'login-verify', req })
      return res.status(500).json({ error: 'internal-error' })
    }

    if (!verifyResult.valid) {
      try {
        await logLoginAttempt({
          loginInput: username,
          eventType: 'LOGIN_FAILED',
          details: 'Wrong password',
          ip: remoteIp,
          ua
        })
      } catch { /* ignorar */ }
      return res.status(401).json({ error: 'invalid-credentials', detail: 'Wrong password' })
    }

    // ── Migración transparente: si la contraseña era texto plano, rehashear ──
    // Esto ocurre una sola vez por usuario al primer login exitoso después del deploy.
    // El usuario no nota ningún cambio; su próximo login ya usará el hash seguro.
    if (verifyResult.legacy && userRow && userRow.userid) {
      try {
        const newHash = await hashPassword(password)
        await pool.query('UPDATE users SET userpwd = $1 WHERE userid = $2', [newHash, userRow.userid])
        console.log(`[auth] migración argon2id completada para userid=${userRow.userid}`)
      } catch (migrErr) {
        // No bloquear el login si la migración falla; solo loguear
        console.error('argon2 migration failed', migrErr && migrErr.message)
      }
    }

    // Autenticación exitosa — usuario externo
    try {
      await logLoginAttempt({
        loginInput: username,
        eventType: 'LOGIN_SUCCESS',
        details: verifyResult.legacy ? 'External password match (migrated to argon2id)' : 'External password match (argon2id)',
        ip: remoteIp,
        ua
      })
    } catch { /* ignorar */ }

    // Crear JWT de sesión y refresh token; enviarlos como cookies HttpOnly
    try {
      const payload = { userid: userRow.userid, useremail: userRow.useremail, usertipo: 2 }
      const token = signSession(payload)
      setSessionCookie(res, token)
      // Crear refresh token y enviarlo (raw) en cookie
      const rawRefresh = await createRefreshToken({ userid: userRow.userid, ip: remoteIp, ua })
      setRefreshCookie(res, rawRefresh)
      // Generar token CSRF accesible desde JS (double-submit) y devolverlo
      // en la respuesta para clientes que no pueden leer cookies.
      try {
        const csrfToken = generateCsrfToken()
        setCsrfCookie(res, csrfToken)
        return res.json({ ok: true, tipo: 'external', csrfToken })
      } catch {
        // Si algo falla al establecer cookie, devolvemos al menos ok
        return res.json({ ok: true, tipo: 'external' })
      }
    } catch (sessionErr) {
      console.error('Failed to set session cookie', sessionErr && sessionErr.message ? sessionErr.message : sessionErr)
    }

    // Si por alguna razón no retornamos antes (ej. fallo al crear cookies),
    // devolvemos al menos OK para no caer al flujo LDAP.
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
        } catch { /* ignorar */ }

        // Para usuarios internos también emitimos cookie de sesión + refresh
        try {
          const payload = { useremail: principal, usertipo: 1, principal }
          const token = signSession(payload)
          setSessionCookie(res, token)
          const rawRefreshLdap = await createRefreshToken({ userid: null, ip: remoteIp, ua })
          setRefreshCookie(res, rawRefreshLdap)
          try {
            const csrfToken = generateCsrfToken()
            setCsrfCookie(res, csrfToken)
            return res.json({ ok: true, tipo: 'internal', principal, csrfToken })
          } catch {
            return res.json({ ok: true, tipo: 'internal', principal })
          }
        } catch (sessionErr) {
          console.error('Failed to set session cookie for LDAP user', sessionErr && sessionErr.message ? sessionErr.message : sessionErr)
        }

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
  } catch { /* ignorar */ }
  return res.status(401).json({ error: 'invalid-credentials', detail: 'All bind attempts failed' })
})

// GET /api/session — validar cookie de sesión y devolver información mínima
router.get('/api/session', requireAuth, async (req, res) => {
  try {
    // `requireAuth` deja `req.user` con el payload del JWT
    return res.json({ ok: true, session: req.user })
  } catch {
    return res.status(500).json({ error: 'internal-error' })
  }
})

// GET /api/csrf-token — devuelve el token CSRF para el cliente y (re)establece
// la cookie `ssmm_csrf`. Requiere sesión válida. En entornos de desarrollo el
// cliente puede usar solo el token en header cuando las cookies cross-site
// están bloqueadas por políticas SameSite.
// GET /api/csrf-token — devuelve token CSRF. No requiere sesión JWT: si existe
// una cookie `ssmm_csrf` se reutiliza. Si no, intenta emitir uno nuevo si hay
// un refresh token válido. Esto permite a clientes con sesión expirada pero
// con `ssmm_refresh` (HttpOnly) solicitar un CSRF token para el intercambio.
router.get('/api/csrf-token', async (req, res) => {
  try {
    const existing = req.cookies && req.cookies.ssmm_csrf
    if (existing) {
      try { setCsrfCookie(res, existing) } catch { /* ignore */ }
      return res.json({ ok: true, csrfToken: existing })
    }

    // Intentar emitir token si el cliente posee un refresh token válido.
    const rawRefresh = req.cookies && req.cookies.ssmm_refresh
    if (rawRefresh) {
      try {
        const found = await findValidRefreshToken(rawRefresh)
        if (found) {
          const token = generateCsrfToken()
          try { setCsrfCookie(res, token) } catch { /* ignore */ }
          return res.json({ ok: true, csrfToken: token })
        }
      } catch (e) {
        console.error('csrf-token refresh check failed', e && e.message ? e.message : e)
      }
    }

    return res.status(401).json({ error: 'no-session-or-refresh' })
  } catch (err) {
    console.error('csrf-token error', err)
    return res.status(500).json({ error: 'internal-error' })
  }
})

// POST /api/logout — borrar cookie de sesión
router.post('/api/logout', verifyCsrf, async (req, res) => {
  try {
    // Revocar refresh token en BD si existe
    try {
      const raw = req.cookies && req.cookies.ssmm_refresh
      if (raw) await revokeRefreshToken(raw)
    } catch (e) {
      console.error('Failed to revoke refresh token on logout', e && e.message ? e.message : e)
    }

    // Limpiar cookies tanto de access como de refresh y CSRF
    try { clearSessionCookie(res) } catch { /* ignore */ }
    try { clearRefreshCookie(res) } catch { /* ignore */ }
    try { clearCsrfCookie(res) } catch { /* ignore */ }

    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'internal-error' })
  }
})

// POST /api/refresh — intercambiar refresh token por nuevo access token
router.post('/api/refresh', verifyCsrf, async (req, res) => {
  try {
    // Leer refresh token raw desde cookie (HttpOnly)
    const raw = req.cookies && req.cookies.ssmm_refresh
    if (!raw) return res.status(401).json({ error: 'no-refresh-token' })

    // Localizar refresh en BD
    const found = await findValidRefreshToken(raw)
    if (!found) return res.status(401).json({ error: 'invalid-refresh' })

    // Crear nuevo access token y rotar refresh token para mayor seguridad
    const payload = { userid: found.userid }
    const newAccess = signSession(payload)
    setSessionCookie(res, newAccess)

    // Rotar: crear nuevo refresh token y revocar el antiguo
    const newRaw = await rotateRefreshToken(raw, found.userid, req.ip, req.headers['user-agent'])
    setRefreshCookie(res, newRaw)
    // Rotar CSRF token también y devolverlo en la respuesta para clientes
    // que no pueden leer cookies (dev env, cross-site etc.). En producción
    // el cliente seguirá recibiendo la cookie HttpOnly y no necesitará usar
    // el valor en el body.
    let csrfToken = null
    try {
      csrfToken = generateCsrfToken()
      setCsrfCookie(res, csrfToken)
    } catch { /* ignore */ }

    return res.json({ ok: true, csrfToken })
  } catch (err) {
    console.error('refresh error', err)
    return res.status(500).json({ error: 'internal-error' })
  }
})

// ─── POST /api/forgot-password ────────────────────────────────────────────────
//
// Busca el `useremail` y `userpwd` del usuario en la BD y envía la contraseña
// al correo registrado. Si el usuario no existe, responde con 404.
// Los errores SMTP se clasifican en "relay-rejected" (502) o "send-failed" (500).
// Helpers para manejo de tokens y tablas necesarias
async function ensurePasswordTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        userid INT,
        username VARCHAR(100),
        useremail VARCHAR(100),
        code VARCHAR(128) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        used BOOLEAN DEFAULT false
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_history (
        id SERIAL PRIMARY KEY,
        userid INT NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
  } catch (e) {
    console.error('Failed to ensure password tables', e && e.message ? e.message : String(e))
    throw e
  }
}

async function findValidToken({ userid, username, useremail, code }) {
  const now = new Date()
  const result = await pool.query(
    `SELECT id, userid, username, useremail, code, expires_at, used
     FROM password_reset_tokens
     WHERE code = $1 AND used = false AND expires_at > $2
       AND (userid = $3 OR username = $4 OR useremail = $5)
     ORDER BY created_at DESC LIMIT 1`,
    [code, now, userid || null, username || null, useremail || null]
  )
  return (result && result.rowCount > 0) ? result.rows[0] : null
}

async function markTokenUsed(tokenId) {
  await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenId])
}

// POST /api/forgot-password — generar código y enviar por correo
router.post('/api/forgot-password', async (req, res) => {
  const { username, email } = req.body || {}
  const input = (username || email || '').toString().trim()

  if (!input) return res.status(400).json({ error: 'username or email required' })

  try {
    // El identificador de recuperación es siempre el correo electrónico (useremail).
    // Los usuarios internos (usertipo=1) serán rechazados en el paso siguiente.
    const result = await pool.query(
      'SELECT userid, username, useremail, userpwd, usertipo FROM users WHERE useremail = $1 LIMIT 1',
      [input]
    )

    if (!result || result.rowCount === 0) return res.status(404).json({ error: 'user-not-found' })

    const user = result.rows[0]

    // No permitir reset para usuarios gestionados por LDAP (usertipo=1)
    if (Number(user.usertipo) === 1) {
      return res.status(400).json({ error: 'ldap-user-no-reset', detail: 'User managed by LDAP; password reset not allowed' })
    }

    // Asegurar que existan tablas necesarias
    await ensurePasswordTables()

    // Generar código y persistirlo
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutos
    const inserted = await insertResetToken({ userid: user.userid, username: user.username, useremail: user.useremail, code, expiresAt })

    // Enviar correo con el código
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: user.useremail,
      subject: 'Código de recuperación de contraseña',
      text: `Su código de recuperación es: ${code}\nEste código expira en 15 minutos.`
    }

    const tx = await ensureTransporter()
    const info = await tx.sendMail(mailOptions)

    const resp = { ok: true, tokenId: inserted.id, messageId: info.messageId, accepted: info.accepted || [] }
    const previewUrl = getPreviewUrl(info)
    if (previewUrl) resp.previewUrl = previewUrl

    return res.json(resp)
  } catch (err) {
    console.error('forgot-password error', err)
    const errText = (err && (err.response || err.message)) ? (err.response || err.message) : String(err)
    logError(err, { context: 'forgot-password', req })
    return res.status(500).json({ error: 'send-failed', detail: errText })
  }
})

// POST /api/forgot-password/verify — validar código
router.post('/api/forgot-password/verify', async (req, res) => {
  const { username, email, code } = req.body || {}
  const input = (username || email || '').toString().trim()
  if (!input || !code) return res.status(400).json({ error: 'username/email and code required' })

  try {
    // Buscar usuario exclusivamente por correo electrónico
    const userRes = await pool.query('SELECT userid, username, useremail FROM users WHERE useremail = $1 LIMIT 1', [input])
    if (!userRes || userRes.rowCount === 0) return res.status(404).json({ error: 'user-not-found' })
    const user = userRes.rows[0]

    const token = await findValidToken({ userid: user.userid, username: user.username, useremail: user.useremail, code })
    if (!token) return res.status(400).json({ error: 'invalid-or-expired-code' })
    return res.json({ ok: true })
  } catch (err) {
    logError(err, { context: 'forgot-password-verify', req })
    return res.status(500).json({ error: 'internal-error' })
  }
})

// POST /api/forgot-password/reset — cambiar contraseña usando código
router.post('/api/forgot-password/reset', async (req, res) => {
  const { username, email, code, password, passwordRepeat } = req.body || {}
  const input = (username || email || '').toString().trim()

  if (!input || !code || !password || !passwordRepeat) return res.status(400).json({ error: 'missing-parameters' })
  if (password !== passwordRepeat) return res.status(400).json({ error: 'passwords-do-not-match' })

  // Validar complejidad: mínimo 8 chars, al menos una mayúscula, un número y un carácter no alfanumérico
  const complexityRe = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
  if (!complexityRe.test(password)) return res.status(400).json({ error: 'password-complexity-failed' })

  try {
    // Buscar usuario exclusivamente por correo electrónico
    const userRes = await pool.query('SELECT userid, username, useremail, userpwd, usertipo FROM users WHERE useremail = $1 LIMIT 1', [input])
    if (!userRes || userRes.rowCount === 0) return res.status(404).json({ error: 'user-not-found' })
    const user = userRes.rows[0]

    if (Number(user.usertipo) === 1) {
      return res.status(400).json({ error: 'ldap-user-no-reset', detail: 'User managed by LDAP; password reset not allowed' })
    }

    // Verificar token válido
    const token = await findValidToken({ userid: user.userid, username: user.username, useremail: user.useremail, code })
    if (!token) return res.status(400).json({ error: 'invalid-or-expired-code' })

    // Comprobar historial (últimas 5 contraseñas)
    const histRes = await pool.query('SELECT password FROM password_history WHERE userid = $1 ORDER BY created_at DESC LIMIT 5', [user.userid])
    // Recopilar los hashes del historial (últimas 5 entradas) más la contraseña actual.
    // Todos pueden ser argon2id o texto plano (legado); se usa `verifyPassword` para ambos.
    const recentHashes = (histRes && histRes.rows) ? histRes.rows.map(r => r.password) : []
    if (user.userpwd) recentHashes.unshift(user.userpwd) // contraseña actual al frente

    // Verificar que la nueva contraseña no coincida con ninguna del historial.
    // Se itera con `for...of` en lugar de Promise.all para cortar en el primer match
    // y no ejecutar comprobaciones innecesarias.
    for (const stored of recentHashes) {
      let match = false
      try {
        const r = await verifyPassword(stored, password)
        match = r.valid
      } catch { /* si falla la verificación, ignorar esa entrada */ }
      if (match) return res.status(400).json({ error: 'password-reused', detail: 'Password must not match last 5 passwords' })
    }

    // Hashear la nueva contraseña con argon2id antes de persistirla.
    // A partir de este punto NUNCA se almacena texto plano.
    const hashedNew = await hashPassword(password)

    // Actualizar contraseña en users con el hash seguro
    await pool.query('UPDATE users SET userpwd = $1 WHERE userid = $2', [hashedNew, user.userid])

    // Insertar en historial también con hash (para futuras comprobaciones)
    await pool.query('INSERT INTO password_history (userid, password) VALUES ($1, $2)', [user.userid, hashedNew])

    // Marcar token como usado para que no pueda reutilizarse
    await markTokenUsed(token.id)

    return res.json({ ok: true })
  } catch (err) {
    logError(err, { context: 'forgot-password-reset', req })
    return res.status(500).json({ error: 'internal-error' })
  }
})

export default router
