import crypto from 'crypto'

function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex')
}

function _cookieOptions(maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = process.env.SESSION_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')
  const maxAge = parseInt(String(maxAgeMs || process.env.SESSION_MAX_AGE_MS || 60 * 60 * 1000), 10)
  return { httpOnly: false, secure, sameSite, maxAge, path: '/' }
}

function setCsrfCookie(res, token) {
  const maxAge = parseInt(process.env.SESSION_MAX_AGE_MS || String(60 * 60 * 1000), 10)
  res.cookie('ssmm_csrf', token, _cookieOptions(maxAge))
}

function clearCsrfCookie(res) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = process.env.SESSION_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')
  res.clearCookie('ssmm_csrf', { httpOnly: false, secure, sameSite, path: '/' })
}

function verifyCsrf(req, res, next) {
  // Methods that are considered safe and don't require CSRF token
  const safeMethods = ['GET', 'HEAD', 'OPTIONS']
  if (safeMethods.includes(req.method)) return next()

  const header = (req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || null)
  const cookie = req.cookies && req.cookies.ssmm_csrf

  // Require header in all environments
  if (!header) return res.status(403).json({ error: 'csrf-missing' })

  // In development, allow header-only (useful for localhost setups where the
  // non-HttpOnly cookie may be blocked by SameSite policies). In production
  // we require the double-submit (cookie + header) match.
  const isDev = process.env.NODE_ENV !== 'production'
  if (!cookie) {
    if (isDev) {
      console.warn('CSRF cookie missing; accepting header-only in development')
      return next()
    }
    return res.status(403).json({ error: 'csrf-missing' })
  }

  if (header !== cookie) return res.status(403).json({ error: 'csrf-mismatch' })
  return next()
}

export { generateCsrfToken, setCsrfCookie, clearCsrfCookie, verifyCsrf }
