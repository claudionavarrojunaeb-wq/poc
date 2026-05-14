/**
 * backend/middleware/errorHandler.js
 * ------------------------------------
 * Middleware global de manejo de errores de Express (error handler de 4 parámetros).
 *
 * Express identifica un "error handler" por la firma `(err, req, res, next)`.
 * Debe registrarse con `app.use(errorHandler)` DESPUÉS de todas las rutas,
 * para que actúe como red de seguridad final de la cadena.
 *
 * Casos que maneja:
 *   1. JSON inválido enviado en el body: body-parser lanza un SyntaxError con
 *      `err.type === 'entity.parse.failed'`. Se responde con 400 en lugar de 500.
 *   2. Cualquier otro error no capturado por los handlers de ruta: se responde con 500.
 *   3. Sin error (llamado por accidente como middleware normal): pasa al siguiente.
 *
 * Todos los errores reales se registran en `backend/log/errorYYYYMMDD.jsonl`
 * mediante `logError` antes de responder al cliente.
 */

import { logError } from '../lib/errorLog.js'

/**
 * errorHandler
 * Middleware de error global de Express.
 *
 * @param {Error}                       err  — objeto de error propagado con `next(err)` o por body-parser
 * @param {import('express').Request}   req
 * @param {import('express').Response}  res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  // Caso 1: body inválido — body-parser produce SyntaxError con type 'entity.parse.failed'
  // Se registra como error 400 (culpa del cliente) y se responde con JSON.
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    console.warn('Invalid JSON received:', err.message || err)
    logError(err, { context: 'body-parser', req, status: 400 })
    return res.status(400).json({ error: 'invalid-json', detail: err.message || String(err) })
  }

  // Caso 2: cualquier otro error propagado desde handlers o middlewares
  if (err) {
    console.error('Unhandled server error:', err)
    logError(err, { context: 'unhandled', req, status: 500 })
    return res.status(500).json({ error: 'server-error', detail: String(err) })
  }

  // Caso 3: sin error — pasar al siguiente middleware (poco probable, pero defensivo)
  return next()
}
