Backend notes — sesiones, CSRF y variables de entorno
-----------------------------------------------------

Resumen rápido
- El backend usa cookies HttpOnly para la sesión (`ssmm_session`) y para el refresh token (`ssmm_refresh`).
- Para mitigar CSRF se usa la técnica "double-submit cookie": el servidor emite una cookie accesible por JS `ssmm_csrf` y el cliente debe enviarla en el header `X-CSRF-Token` en todas las peticiones mutantes (POST/PUT/DELETE).

Variables de entorno (resumen)
- `JWT_SECRET` — secreto para firmar JWT (PRODUCCIÓN: mínimo 32 bytes aleatorios). No commitear.
- `NODE_ENV` — `production` o `development`.
- `SESSION_SAME_SITE` — política SameSite de las cookies. En producción debe ser `none` si la app necesita cookies cross-site (ej. frontend servido desde otro host). Si se usa `none`, las cookies deben marcarse `secure` y la app debe servir por HTTPS.
- `SESSION_MAX_AGE_MS` — duración en ms de la cookie de sesión.
- `SESSION_REFRESH_MAX_AGE_MS` — duración en ms del refresh token.

Cómo generar un `JWT_SECRET` seguro (Windows PowerShell):

  $pw = [System.Convert]::ToBase64String((New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes(48)) ; Write-Output $pw

O usando Node.js (cross-platform):

  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

CSRF (double-submit)
- Al iniciar sesión o rotar refresh tokens, el servidor genera un token CSRF y lo expone en la cookie `ssmm_csrf` (no HttpOnly). El frontend debe leer esa cookie y enviar su valor en el header `X-CSRF-Token` para peticiones mutantes.
- El middleware `backend/middleware/csrf.js` implementa `verifyCsrf` que rechaza peticiones mutantes si el header no coincide con la cookie.

Despliegue seguro (puntos clave)
- Usar HTTPS en producción (obligatorio si `SESSION_SAME_SITE=none`).
- Establecer `NODE_ENV=production` y `JWT_SECRET` robusto antes de exponer el servicio.
- No commitear `.env` ni secretos. Mantener `.env.example` actualizado con variables necesarias.

Dónde está el código relevante
- `backend/middleware/session.js` — gestión de cookies de sesión y refresh tokens.
- `backend/middleware/csrf.js` — generación/verificación CSRF (double-submit).
- `backend/routes/auth.js` — login, refresh, logout; ahora emite y limpia cookie CSRF.
- `frontend/src/csrf.ts` — helper para leer la cookie `ssmm_csrf` desde el navegador.
