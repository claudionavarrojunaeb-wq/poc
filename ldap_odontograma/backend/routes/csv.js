/**
 * backend/routes/csv.js
 * Endpoint para importar CSV (docs/csv/nuevos.csv) a la tabla `nuevos_csv`.
 */
import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/session.js'

const router = Router()

// POST /api/csv/upload
// Body: { csv: string }
router.post('/upload', requireAuth, async (req, res) => {
  try {
    const csv = req.body && req.body.csv
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'missing_csv' })

    // Start timer (ns precision) to measure full server-side processing time
    const startNs = process.hrtime.bigint()

    // Normalize newlines and split
    const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    // find header
    let headerIdx = 0
    while (headerIdx < lines.length && lines[headerIdx].trim() === '') headerIdx++
    if (headerIdx >= lines.length) return res.status(400).json({ error: 'empty_csv' })
    // header expected: bcodmin;brutest;brutdv;bnomest;bapepat;bapemat
    const header = lines[headerIdx].split(';').map(h => h.trim())

    const dataLines = lines.slice(headerIdx + 1)
    const rows = []
    for (const ln of dataLines) {
      if (!ln || ln.trim() === '') continue
      const parts = ln.split(';').map(p => p.trim())
      // ensure 6 columns
      while (parts.length < 6) parts.push('')
      if (parts.length > 6) parts.length = 6
      rows.push(parts)
    }

    if (rows.length === 0) {
      const endNs = process.hrtime.bigint()
      const durationMs = Number((endNs - startNs) / 1000000n)
      return res.json({ inserted: 0, durationMs })
    }

    // Insert in batches to avoid enormous single queries
    const batchSize = 1000
    let inserted = 0
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const values = []
      const placeholders = batch.map((r, idx) => {
        const offset = idx * 6
        values.push(r[0], r[1], r[2], r[3], r[4], r[5])
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`
      }).join(',')

      const sql = `INSERT INTO nuevos_csv (bcodmin, brutest, brutdv, bnomest, bapepat, bapemat) VALUES ${placeholders}`
      await pool.query(sql, values)
      inserted += batch.length
    }

    const endNs = process.hrtime.bigint()
    const durationMs = Number((endNs - startNs) / 1000000n)
    return res.json({ inserted, durationMs })
  } catch (e) {
    console.error('csv upload error', e && e.message ? e.message : e)
    return res.status(500).json({ error: 'internal-error' })
  }
})

export default router
