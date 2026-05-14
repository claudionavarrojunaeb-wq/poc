# Documentación automática para db.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/db.js
 * -------------
 * Módulo de acceso a la base de datos PostgreSQL.
 *
 * Responsabilidades:
 *   - Crear y exportar el Pool de conexiones (singleton compartido por toda la app).
 *   - Exportar `logLoginAttempt`, la función de auditoría que inserta en `auditoriaaccesos`.
 *
 * Este módulo también llama a `dotenv.config()` porque es el primero en necesitar
 * las variables de entorno de base de datos (PGHOST, PGPORT, etc.).
 * Al ser importado por los routers antes de que `index.js` ejecute su propio cuerpo,
 * garantiza que `.env` ya esté cargado para todos los módulos subsiguientes.
 */

import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolver __dirname en módulos ESM (no disponible de forma nativa como en CJS).
// Se usa para construir la ruta absoluta al archivo .env del backend.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Cargar variables de entorno desde backend/.env
// `override: false` (por defecto): no sobreescribe variables ya definidas en el entorno del sistema.
dotenv.config({ path: path.join(__dirname, '.env') })

// ─── Pool de conexiones ────────────────────────────────────────────────────────
//
// `pg.Pool` gestiona un conjunto de conexiones reutilizables a PostgreSQL.
// Se lee cada variable de entorno individualmente para facilitar la depuración:
// si alguna es undefined, el Pool lanzará un error claro al intentar conectarse.
export const pool = new Pool({
  host:     process.env.PGHOST,
  port:     Number(process.env.PGPORT),
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
})

// ─── Auditoría de accesos ──────────────────────────────────────────────────────
//
// `logLoginAttempt` inserta un registro en la tabla `auditoriaaccesos` cada vez
// que ocurre un intento de login (exitoso, fallido o malformado).
//
// Parámetros (todos opcionales con valores por defecto seguros):
//   userId     — id del usuario en la tabla `users` (null si no se pudo resolver)
//   loginInput — texto tal como lo ingresó el usuario (username o email)
//   eventType  — constante de evento: 'LOGIN_ATTEMPT', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BAD_REQUEST'
//   details    — texto libre con contexto adicional (p.ej. nombre del principal LDAP usado)
//   ip         — dirección IP del cliente
//   ua         — User-Agent del cliente
//
// Si la inserción falla (BD caída, tabla inexistente), se registra el error en
// consola pero NO se lanza excepción, para no interrumpir el flujo de login.
export async function logLoginAttempt({
  userId    = null,
  loginInput = null,
  eventType  = 'LOGIN_ATTEMPT',
  details    = null,
  ip         = null,
  ua         = null
} = {}) {
  try {
    const sql = `
      INSERT INTO auditoriaaccesos
        (userid, input_login, fecha_evento, tipo_evento, direccion_ip, user_agent, detalle)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `
    // `new Date()` produce la fecha/hora en UTC; la columna `fecha_sistema` usa
    // LOCALTIMESTAMP (hora local del servidor) como default de BD.
    await pool.query(sql, [userId, loginInput, new Date(), eventType, ip, ua, details])
  } catch (e) {
    console.error('Failed to record login audit to DB:', e && e.message ? e.message : String(e))
  }
}

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
