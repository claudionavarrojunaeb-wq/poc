# Documentación automática para errorLog.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/lib/errorLog.js
 * ------------------------
 * Utilidad de registro de errores en archivo JSONL diario.
 *
 * Genera un archivo `backend/log/errorYYYYMMDD.jsonl` por día.
 * Cada línea es un objeto JSON independiente y válido (formato JSONL / NDJSON),
 * lo que permite leer el archivo línea a línea sin cargar todo en memoria
 * y facilita el procesamiento con herramientas como `jq` o scripts Node.
 *
 * La escritura es SÍNCRONA (`appendFileSync`) para garantizar que el registro
 * no se pierda aunque el proceso termine inmediatamente después (p.ej. crash).
 *
 * Estructura de cada línea:
 * {
 *   "ts"      : "2026-05-06T19:00:00.000Z",   // ISO 8601 UTC
 *   "context" : "forgot-password",             // origen del error (opcional)
 *   "message" : "connect ECONNREFUSED",
 *   "code"    : "ECONNREFUSED",               // err.code si existe
 *   "status"  : 500,                          // HTTP status si viene de Express
 *   "stack"   : "Error: ...\n    at ...",
 *   "req"     : {                             // solo si se pasa req de Express
 *     "method" : "POST",
 *     "url"    : "/api/login",
 *     "ip"     : "127.0.0.1",
 *     "ua"     : "Mozilla/5.0 ..."
 *   }
 * }
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolver __dirname en módulos ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)       // backend/lib

// Carpeta de logs del backend — se crea automáticamente si no existe
const LOG_DIR = path.join(__dirname, '..', 'log') // backend/log

/**
 * logError
 * Registra un error en el archivo JSONL diario correspondiente.
 *
 * @param {Error|unknown} err        — el error capturado (puede ser cualquier valor)
 * @param {object}        [opts]     — opciones adicionales
 * @param {string}        [opts.context]  — nombre del contexto/ruta donde ocurrió
 * @param {object}        [opts.req]      — objeto request de Express (para extraer método, URL, IP, UA)
 * @param {number}        [opts.status]   — código HTTP asociado (si aplica)
 */
export function logError(err, { context = null, req = null, status = null } = {}) {
  try {
    // Construir nombre del archivo con la fecha actual en formato YYYYMMDD
    const now      = new Date()
    const dateStr  = now.toISOString().slice(0, 10).replace(/-/g, '') // '20260506'
    const filePath = path.join(LOG_DIR, `error${dateStr}.jsonl`)

    // Crear carpeta backend/log/ si no existe
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

    // Serializar el error: los objetos Error no se serializan con JSON.stringify por defecto
    const entry = {
      ts:      now.toISOString(),
      context: context || undefined,
      message: err instanceof Error ? err.message : String(err),
      code:    (err && err.code)    ? err.code    : undefined,
      status:  status               ? status      : undefined,
      stack:   err instanceof Error ? err.stack   : undefined,
      // Extraer datos mínimos del request de Express para correlacionar con logs de acceso
      req: req ? {
        method: req.method,
        url:    req.originalUrl || req.url,
        ip:     (req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || req.ip,
        ua:     req.headers && req.headers['user-agent']
      } : undefined
    }

    // Eliminar campos undefined para mantener el JSON limpio
    const line = JSON.stringify(entry, (_, v) => v === undefined ? undefined : v)

    // Escribir sincrónicamente: cada entrada en su propia línea (JSONL)
    fs.appendFileSync(filePath, line + '\n', 'utf8')

  } catch (writeErr) {
    // Si falla la escritura del log, solo mostrar en consola para no ocultar el error original
    console.error('[errorLog] Failed to write error log:', writeErr && writeErr.message ? writeErr.message : String(writeErr))
  }
}

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
