/**
 * backend/routes/metrics.js
 * ------------------------
 * Endpoint simple para exponer métricas mínimas usadas por el dashboard.
 *
 * Rutas:
 *   GET /api/metrics  — devuelve JSON con métricas: users, errorsToday, activeSessions, activitySeries
 *
 * Implementación:
 * - Intenta obtener `users` contando la tabla `users` vía `pool` si está disponible.
 * - Cuenta las líneas del fichero `backend/log/errorYYYYMMDD.jsonl` para `errorsToday`.
 * - `activitySeries` es una serie ligera mock basada en `errorsToday`/users para dar contexto visual.
 */

import express from 'express'
import { pool } from '../db.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    let users = null
    try {
      const r = await pool.query('SELECT COUNT(*)::int AS count FROM users')
      users = r && r.rows && r.rows[0] ? r.rows[0].count : 0
    } catch (e) {
      // Silenciar: el proyecto puede no tener la tabla `users` en todos los entornos.
      console.error('metrics: users count failed', e && e.message ? e.message : String(e))
      users = null
    }

    let errorsToday = 0
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = path.dirname(__filename)
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const fn = `error${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.jsonl`
      const filePath = path.join(__dirname, '..', 'log', fn)
      const content = await fs.readFile(filePath, 'utf8')
      errorsToday = content.split(/\r?\n/).filter(Boolean).length
    } catch {
      // file may not exist — that's okay, default 0
      errorsToday = 0
    }

    // Serie mock para sparkline (8 puntos). Se basa en errores/users si están disponibles.
    const activitySeries = Array.from({ length: 8 }, (_, i) => {
      const base = (typeof users === 'number' && users > 0) ? Math.round(users / 100) : 5
      return Math.max(0, Math.round((errorsToday || 0) + base + Math.random() * 6 - (i % 3)))
    })

    res.json({ ok: true, metrics: { users, errorsToday, activeSessions: null, activitySeries } })
  } catch (err) {
    console.error('metrics: unexpected error', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
