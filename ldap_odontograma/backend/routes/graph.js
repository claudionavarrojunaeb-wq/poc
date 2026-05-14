/**
 * backend/routes/graph.js
 * -----------------------
 * Rutas mínimas para integrar OAuth2 con Microsoft (Microsoft Graph)
 * - GET  /api/graph/connect   -> redirige al flujo de autorización de Microsoft
 * - GET  /api/graph/callback  -> callback que intercambia código por tokens y los guarda
 * - GET  /api/graph/status    -> comprueba si la cuenta Outlook está vinculada
 * - GET  /api/graph/contacts  -> devuelve los contactos del usuario (requiere token)
 *
 * Notas:
 * - Requiere configurar env vars: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI (opcional)
 * - Los tokens se guardan en la tabla `ms_tokens` (se crea si no existe).
 */

import { Router } from 'express'
import crypto from 'crypto'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/session.js'

const router = Router()

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || null
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const SCOPES = (process.env.MICROSOFT_SCOPES || 'offline_access openid profile User.Read Contacts.Read')

function subjectForReq(req) {
  // Preferir useremail o principal; si no existe, serializar req.user
  const u = req.user || {}
  return (u.useremail || u.principal || JSON.stringify(u))
}

// Crear tabla simple para tokens si no existe
async function ensureMsTokensTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ms_tokens (
        id SERIAL PRIMARY KEY,
        subject TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ,
        scope TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  } catch (e) {
    console.error('ensureMsTokensTable failed', e && e.message ? e.message : e)
    throw e
  }
}

// GET /api/graph/connect
router.get('/connect', requireAuth, async (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    // Mostrar una página informativa con instrucciones para configurar OAuth
    const example = `# Agregar en backend/.env\nMICROSOFT_CLIENT_ID=your_client_id_here\nMICROSOFT_CLIENT_SECRET=your_client_secret_here\nMICROSOFT_REDIRECT_URI=http://localhost:4000/api/graph/callback\nMICROSOFT_SCOPES=offline_access openid profile User.Read Contacts.Read`
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Microsoft OAuth no configurado</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#111"><h1>Microsoft OAuth no configurado</h1><p>El servidor no tiene configuradas las variables de entorno necesarias para iniciar el flujo de autorización con Microsoft.</p><p>Por favor, registre una aplicación en <a href="https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app" target="_blank" rel="noopener noreferrer">Azure AD App registrations</a> y copie los valores en <code>backend/.env</code> (no los suba a control de versiones).</p><h3>Ejemplo (.env)</h3><pre style="background:#f6f8fa;padding:12px;border-radius:6px;white-space:pre-wrap;">${example}</pre><p>Después de actualizar <code>backend/.env</code>, reinicie el servidor backend (por ejemplo: <code>node backend/index.js</code> o usar <code>npm run dev</code> si tiene nodemon).</p></body></html>`
    return res.status(500).send(html)
  }
  try {
    const state = crypto.randomBytes(16).toString('hex')
    // Guardar state en cookie de corta vida
    res.cookie('ms_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60 * 1000, path: '/' })
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      response_mode: 'query',
      scope: SCOPES,
      state,
      prompt: 'select_account'
    })
    return res.redirect(`${AUTH_URL}?${params.toString()}`)
  } catch (e) {
    console.error('graph connect error', e)
    return res.status(500).json({ error: 'internal-error' })
  }
})

// GET /api/graph/callback
router.get('/callback', requireAuth, async (req, res) => {
  try {
    const { code, state } = req.query || {}
    const stored = req.cookies && req.cookies.ms_oauth_state
    if (!code) return res.status(400).send('missing_code')
    if (!state || !stored || state !== stored) return res.status(400).send('invalid_state')

    // Intercambiar código por tokens
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI
    })
    const tokenRes = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('token exchange failed', tokenJson)
      return res.status(400).send('token_exchange_failed')
    }

    const access_token = tokenJson.access_token
    const refresh_token = tokenJson.refresh_token
    const expires_in = Number(tokenJson.expires_in || 0)

    await ensureMsTokensTable()
    const subj = subjectForReq(req)
    const expiresAt = new Date(Date.now() + expires_in * 1000)
    await pool.query(`
      INSERT INTO ms_tokens (subject, access_token, refresh_token, expires_at, scope)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (subject) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = NOW()
    `, [subj, access_token, refresh_token, expiresAt, tokenJson.scope || ''])

    // Limpiar state
    res.clearCookie('ms_oauth_state', { path: '/' })

    // Cerrar popup y notificar opener
    return res.send(`<!doctype html><html><body><script>try{window.opener.postMessage({type:'ms_oauth',ok:true},'*')}catch(e){} try{window.close()}catch(e){}</script><div>Autorización completada. Puede cerrar esta ventana.</div></body></html>`)
  } catch (e) {
    console.error('graph callback error', e && e.message ? e.message : e)
    return res.status(500).send('internal-error')
  }
})

// GET /api/graph/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    await ensureMsTokensTable()
    const subj = subjectForReq(req)
    const r = await pool.query('SELECT id FROM ms_tokens WHERE subject = $1 LIMIT 1', [subj])
    return res.json({ linked: !!(r && r.rowCount > 0) })
  } catch (e) {
    console.error('graph status error', e)
    return res.status(500).json({ error: 'internal-error' })
  }
})

// Helper: refresh access token using refresh_token
async function refreshTokenIfNeeded(row) {
  if (!row) return null
  const now = new Date()
  const expiresAt = row.expires_at ? new Date(row.expires_at) : new Date(0)
  if (expiresAt.getTime() - Date.now() > 60 * 1000) {
    // still valid > 60s
    return row.access_token
  }
  // refresh
  if (!row.refresh_token) return null
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    redirect_uri: REDIRECT_URI
  })
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
  const j = await r.json()
  if (!r.ok) {
    console.error('refresh failed', j)
    return null
  }
  const access_token = j.access_token
  const refresh_token = j.refresh_token || row.refresh_token
  const expires_in = Number(j.expires_in || 0)
  const newExpiresAt = new Date(Date.now() + expires_in * 1000)
  await pool.query('UPDATE ms_tokens SET access_token=$1, refresh_token=$2, expires_at=$3, scope=$4, updated_at=NOW() WHERE subject=$5', [access_token, refresh_token, newExpiresAt, j.scope || row.scope, row.subject])
  return access_token
}

// GET /api/graph/contacts
router.get('/contacts', requireAuth, async (req, res) => {
  try {
    await ensureMsTokensTable()
    const subj = subjectForReq(req)
    const r = await pool.query('SELECT * FROM ms_tokens WHERE subject = $1 LIMIT 1', [subj])
    if (!r || r.rowCount === 0) return res.json({ contacts: [] })
    const row = r.rows[0]
    let accessToken = await refreshTokenIfNeeded(row)
    if (!accessToken) return res.status(403).json({ error: 'no_token' })

    // Llamada a Graph para obtener contactos
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/contacts?$select=displayName,emailAddresses&$top=500', { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!graphRes.ok) {
      const text = await graphRes.text().catch(() => '')
      console.error('graph contacts error', graphRes.status, text)
      return res.status(502).json({ error: 'graph_failed' })
    }
    const graphJson = await graphRes.json()
    const contacts = (graphJson.value || []).map(c => ({ id: c.id, name: c.displayName || '', emails: (c.emailAddresses || []).map(e => e.address).filter(Boolean) }))
    return res.json({ contacts })
  } catch (e) {
    console.error('graph contacts error', e && e.message ? e.message : e)
    return res.status(500).json({ error: 'internal-error' })
  }
})

export default router
