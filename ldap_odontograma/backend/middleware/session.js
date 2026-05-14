import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { pool } from '../db.js'

const SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-session-secret-change'
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Seguridad: evitar arrancar en producción con la clave por defecto
if (process.env.NODE_ENV === 'production' && (SECRET === 'dev-session-secret-change' || !process.env.JWT_SECRET)) {
  console.error('FATAL: NODE_ENV=production but JWT_SECRET is not set to a strong value. Aborting startup.')
  process.exit(1)
}

function signSession(payload, opts = {}) {
  const expiresIn = opts.expiresIn || (process.env.SESSION_EXPIRES_IN || '1h')
  return jwt.sign(payload, SECRET, { expiresIn })
}

function _cookieOptions(maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = process.env.SESSION_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')
  const maxAge = parseInt(String(maxAgeMs), 10) || 0
  return { httpOnly: true, secure, sameSite, maxAge, path: '/' }
}

function setSessionCookie(res, token) {
  const maxAge = parseInt(process.env.SESSION_MAX_AGE_MS || String(DEFAULT_MAX_AGE_MS), 10)
  res.cookie('ssmm_session', token, _cookieOptions(maxAge))
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = process.env.SESSION_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')
  res.clearCookie('ssmm_session', { httpOnly: true, secure, sameSite, path: '/' })
}

function setRefreshCookie(res, token) {
  const maxAge = parseInt(process.env.SESSION_REFRESH_MAX_AGE_MS || String(DEFAULT_REFRESH_MAX_AGE_MS), 10)
  res.cookie('ssmm_refresh', token, _cookieOptions(maxAge))
}

function clearRefreshCookie(res) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = process.env.SESSION_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')
  res.clearCookie('ssmm_refresh', { httpOnly: true, secure, sameSite, path: '/' })
}

async function ensureRefreshTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        userid INT NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        revoked BOOLEAN DEFAULT false,
        user_agent TEXT,
        ip TEXT
      )
    `)
  } catch (e) {
    console.error('Failed to ensure refresh_tokens table', e && e.message ? e.message : String(e))
    throw e
  }
}

async function createRefreshToken({ userid, expiresDays = 30, ip = null, ua = null } = {}) {
  await ensureRefreshTable()
  const raw = crypto.randomBytes(64).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
  // Some authentication flows (e.g., LDAP principals) may not have a numeric
  // `userid`. The refresh_tokens table was created with `userid INT NOT NULL`.
  // To avoid violating the NOT NULL constraint on existing databases we
  // normalize missing user ids to `0` which is treated as "anonymous/system".
  const userIdToStore = (typeof userid === 'number' && !Number.isNaN(userid)) ? userid : 0
  await pool.query(
    `INSERT INTO refresh_tokens (userid, token_hash, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
    [userIdToStore, hash, expiresAt, ua, ip]
  )
  return raw
}

async function findValidRefreshToken(raw) {
  if (!raw) return null
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const now = new Date()
  const res = await pool.query(
    `SELECT id, userid, token_hash, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1 AND revoked = false AND expires_at > $2 LIMIT 1`,
    [hash, now]
  )
  return (res && res.rowCount > 0) ? res.rows[0] : null
}

async function revokeRefreshToken(raw) {
  if (!raw) return
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [hash])
}

async function rotateRefreshToken(oldRaw, userid, ip = null, ua = null) {
  try {
    if (oldRaw) {
      const oldHash = crypto.createHash('sha256').update(oldRaw).digest('hex')
      // marcar antiguo como revocado (si existe)
      await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [oldHash])
    }
    // crear uno nuevo
    const newRaw = await createRefreshToken({ userid, ip, ua })
    return newRaw
  } catch (e) {
    console.error('rotateRefreshToken error', e && e.message ? e.message : String(e))
    throw e
  }
}

function requireAuth(req, res, next) {
  try {
    const token = (req.cookies && req.cookies.ssmm_session) || null
    if (!token) return res.status(401).json({ error: 'not-authenticated' })
    const payload = jwt.verify(token, SECRET)
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ error: 'invalid-session' })
  }
}

export {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  setRefreshCookie,
  clearRefreshCookie,
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  requireAuth
}
