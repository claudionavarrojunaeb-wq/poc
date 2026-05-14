/**
 * scripts/generate_error_log.mjs
 * Script para invocar `logError` del backend y generar una entrada de error de prueba.
 */

import { logError } from '../backend/lib/errorLog.js'

const err = new Error('Error de prueba intencional: generar log de error')

logError(err, {
  context: 'prueba-manual',
  req: { method: 'CLI', url: '/scripts/generate_error_log.mjs', ip: '127.0.0.1', ua: 'node-script' },
  status: 500,
})

console.log('logError invoked — debería haberse escrito una entrada en backend/log')
