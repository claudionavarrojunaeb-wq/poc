# Documentación automática para logsViewer.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
/**
 * backend/routes/logsViewer.js
 * -----------------------------
 * Router Express para listar, buscar y descargar archivos de log del proyecto.
 *
 * Cubre dos fuentes de log:
 *   1. `log/` (raíz del proyecto)  → archivos `YYYYMMDD.md`   (logs de operación diarios)
 *   2. `backend/log/`              → archivos `errorYYYYMMDD.jsonl` (errores del backend)
 *
 * Endpoints:
 *   GET /api/logsViewer/list
 *     Devuelve las fechas disponibles en ambas fuentes, ordenadas descendente.
 *     Respuesta: { dates: ['20260506', '20260505', ...] }
 *
 *   GET /api/logsViewer/search?term=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     Busca en líneas de todos los archivos dentro del rango de fechas.
 *     Retorna hasta 2000 coincidencias para proteger al servidor de respuestas enormes.
 *     Respuesta: { matches: [ { date, file, source, line, index } ], total }
 *
 *   GET /api/logsViewer/file?name=NOMBRE_ARCHIVO
 *     Descarga el archivo indicado. El nombre debe ser un patrón seguro (sin traversal).
 *     Acepta: `YYYYMMDD.md` o `errorYYYYMMDD.jsonl`.
 *     Respuesta: descarga del archivo.
 *
 * Seguridad:
 *   - Todos los nombres de archivo se validan con regex estricta antes de servir.
 *   - Las rutas se resuelven solo dentro de las carpetas declaradas (no hay path traversal).
 */

import { Router } from 'express'
import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const router = Router()

// Resolver __dirname en ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)               // backend/routes

// ── Directorios de log ────────────────────────────────────────────────────────
// LOG_OPS: logs de operación (Markdown) — raíz del proyecto
const LOG_OPS    = path.join(__dirname, '..', '..', 'log')   // d:\_SSMM\log
// LOG_ERRORS: logs de errores (JSONL) — backend
const LOG_ERRORS = path.join(__dirname, '..', 'log')         // d:\_SSMM\backend\log

// ── Patrones de nombre de archivo ─────────────────────────────────────────────
// YYYYMMDD.md → logs de operación
const RE_OPS    = /^(\d{8})\.md$/
// errorYYYYMMDD.jsonl → logs de errores
const RE_ERRORS = /^error(\d{8})\.jsonl$/

/**
 * listAllFiles
 * Devuelve la lista unificada de archivos de log de ambas fuentes.
 * Cada entrada tiene: { name, date, source: 'ops'|'errors', dir }
 *
 * @returns {Array<{name: string, date: string, source: string, dir: string}>}
 */
function listAllFiles() {
  const results = []

  // Fuente 1: logs de operación (Markdown)
  if (fs.existsSync(LOG_OPS)) {
    for (const f of fs.readdirSync(LOG_OPS)) {
      const m = f.match(RE_OPS)
      if (m) results.push({ name: f, date: m[1], source: 'ops', dir: LOG_OPS })
    }
  }

  // Fuente 2: logs de errores (JSONL)
  if (fs.existsSync(LOG_ERRORS)) {
    for (const f of fs.readdirSync(LOG_ERRORS)) {
      const m = f.match(RE_ERRORS)
      if (m) results.push({ name: f, date: m[1], source: 'errors', dir: LOG_ERRORS })
    }
  }

  return results
}

/**
 * resolveFile
 * Dado un nombre de archivo, determina a qué directorio pertenece.
 * Retorna null si el nombre no coincide con ningún patrón válido (protección contra traversal).
 *
 * @param {string} name
 * @returns {{ filePath: string, name: string } | null}
 */
function resolveFile(name) {
  if (RE_OPS.test(name))    return { filePath: path.join(LOG_OPS, name),    name }
  if (RE_ERRORS.test(name)) return { filePath: path.join(LOG_ERRORS, name), name }
  return null
}

// ─── GET /api/logsViewer/list ─────────────────────────────────────────────────
//
// Devuelve las fechas únicas disponibles en ambas fuentes, en orden descendente.
// El frontend usa esta lista para mostrar qué días tienen registros.
router.get('/list', (req, res) => {
  try {
    const files = listAllFiles()
    // Extraer fechas únicas y ordenar de más reciente a más antigua
    const dates = Array.from(new Set(files.map(f => f.date).filter(Boolean)))
      .sort()
      .reverse()
    return res.json({ dates })
  } catch (err) {
    console.error('logsViewer /list error', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

// ─── GET /api/logsViewer/search ───────────────────────────────────────────────
//
// Busca `term` en todas las líneas de todos los archivos dentro del rango from..to.
// Si no se especifica rango, busca en todos los archivos disponibles.
//
// Query params:
//   term  — cadena a buscar (case-sensitive, substring)
//   from  — YYYY-MM-DD (opcional)
//   to    — YYYY-MM-DD (opcional)
//
// Respuesta: { matches: [ { date, file, source, line, index } ], total }
router.get('/search', (req, res) => {
  try {
    const term = String(req.query.term || '').trim()
    // term es requerido: sin él devolvemos error de validación
    if (!term) return res.status(400).json({ ok: false, error: 'term query required' })

    // Convertir fechas de YYYY-MM-DD a YYYYMMDD para comparar con los nombres de archivo
    const fmt = (d) => String(d).replace(/-/g, '')
    const from = req.query.from ? fmt(req.query.from) : null
    const to   = req.query.to   ? fmt(req.query.to)   : null

    // Filtrar archivos por rango de fechas
    const allFiles = listAllFiles()
    const filesInRange = allFiles.filter(({ date }) => {
      if (!date) return false
      if (from && date < from) return false
      if (to   && date > to)   return false
      return true
    }).sort((a, b) => a.date.localeCompare(b.date))

    const matches = []
    const MAX = 2000 // límite de seguridad para no saturar la respuesta

    outer: for (const { name, date, source, dir } of filesInRange) {
      const filePath = path.join(dir, name)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const lines   = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(term)) {
            matches.push({ date, file: name, source, line: lines[i], index: i })
            if (matches.length >= MAX) break outer
          }
        }
      } catch (e) {
        console.error('logsViewer: error leyendo', filePath, e && e.message)
      }
    }

    return res.json({ matches, total: matches.length })
  } catch (err) {
    console.error('logsViewer /search error', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

// ─── GET /api/logsViewer/file ─────────────────────────────────────────────────
//
// Descarga el archivo de log indicado por `name`.
// La validación de nombre previene path traversal: solo se aceptan los dos
// patrones conocidos (YYYYMMDD.md y errorYYYYMMDD.jsonl).
router.get('/file', (req, res) => {
  try {
    const name = String(req.query.name || '').trim()
    const resolved = resolveFile(name)

    // Rechazar cualquier nombre que no coincida con los patrones esperados
    if (!resolved) {
      return res.status(400).json({ ok: false, error: 'invalid file name' })
    }

    const { filePath } = resolved

    // Verificar existencia antes de intentar enviar
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'not found' })
    }

    // Enviar como descarga; el nombre del archivo queda visible en el navegador
    return res.download(filePath, name, (err) => {
      if (err) {
        console.error('logsViewer: error enviando archivo', filePath, err)
        try { res.status(500).end() } catch (e) { /* ignore double-send */ }
      }
    })
  } catch (err) {
    console.error('logsViewer /file error', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
