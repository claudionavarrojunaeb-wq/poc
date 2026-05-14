/**
 * backend/routes/projectViewer.js
 * -------------------------------
 * Router mínimo para inspeccionar el árbol de archivos del workspace
 * desde el frontend en modo desarrollo.
 *
 * Endpoints:
 *   GET /api/project/list?path=rel/path
 *     - Lista entradas (dirs y archivos) dentro de la carpeta indicada (relativa
 *       a la raíz del repositorio). Si no se indica `path`, se listará la raíz.
 *
 *   GET /api/project/file?path=rel/path/to/file
 *     - Devuelve { path, content } con el contenido textual del archivo.
 *     - Rechaza archivos binarios o mayores a 3 MB con código 400/413.
 *
 *   GET /api/project/download?path=rel/path/to/file
 *     - Envía el archivo como descarga (res.download).
 *
 * Seguridad: Las rutas son estrictamente relativas a la raíz del repo y se valida
 * que la resolución absoluta esté dentro del directorio base para evitar
 * path traversal.
 */

import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyCsrf } from '../middleware/csrf.js'

const router = Router()

// Pequeño log para verificar carga en runtime
console.log('[projectViewer] router loaded')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Raíz del repositorio (dos niveles arriba de backend/routes)
const REPO_ROOT = path.join(__dirname, '..', '..')

function safeResolve(relPath) {
  // Normalizar y evitar caracteres nulos
  const p = String(relPath || '').replace(/\0/g, '')
  const joined = path.join(REPO_ROOT, p)
  const resolved = path.resolve(joined)
  const base = path.resolve(REPO_ROOT) + path.sep
  if (resolved === path.resolve(REPO_ROOT) || resolved.startsWith(base)) return resolved
  return null
}

// GET /list
router.get('/list', (req, res) => {
  try {
    const rel = String(req.query.path || '').trim()
    const abs = safeResolve(rel)
    if (!abs) return res.status(400).json({ error: 'invalid path' })

    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return res.status(400).json({ error: 'not a directory' })
    }

    const dirents = fs.readdirSync(abs, { withFileTypes: true })
    const entries = dirents.map((d) => {
      const childAbs = path.join(abs, d.name)
      const relChild = path.relative(REPO_ROOT, childAbs).replace(/\\/g, '/')
      const stat = d.isFile() ? fs.statSync(childAbs) : null
      return {
        name: d.name,
        path: relChild,
        isDirectory: d.isDirectory(),
        size: stat ? stat.size : null,
      }
    })

    // Ordenar: directorios primero, luego archivos, ambos alfabéticamente
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

    const relBase = path.relative(REPO_ROOT, abs).replace(/\\/g, '/') || ''
    return res.json({ path: relBase, entries })
  } catch (err) {
    console.error('projectViewer /list error', err)
    return res.status(500).json({ error: String(err) })
  }
})

// GET /file — devuelve contenido textual si es seguro
router.get('/file', (req, res) => {
  try {
    const rel = String(req.query.path || '').trim()
    const abs = safeResolve(rel)
    if (!abs) return res.status(400).json({ error: 'invalid path' })
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'not found' })
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) return res.status(400).json({ error: 'is directory' })

    const MAX_BYTES = 3 * 1024 * 1024 // 3 MB
    if (stat.size > MAX_BYTES) return res.status(413).json({ error: 'file too large', size: stat.size })

    // Leer primer fragmento para detectar binarios (null byte heuristic)
    const sampleSize = Math.min(8192, stat.size)
    const fd = fs.openSync(abs, 'r')
    const buf = Buffer.alloc(sampleSize)
    fs.readSync(fd, buf, 0, sampleSize, 0)
    fs.closeSync(fd)
    if (buf.includes(0)) return res.status(400).json({ error: 'binary file' })

    const content = fs.readFileSync(abs, 'utf8')
    return res.json({ path: path.relative(REPO_ROOT, abs).replace(/\\/g, '/'), content })
  } catch (err) {
    console.error('projectViewer /file error', err)
    return res.status(500).json({ error: String(err) })
  }
})

// GET /download — descarga directa del archivo
router.get('/download', (req, res) => {
  try {
    const rel = String(req.query.path || '').trim()
    const abs = safeResolve(rel)
    if (!abs) return res.status(400).json({ error: 'invalid path' })
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'not found' })
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) return res.status(400).json({ error: 'is directory' })

    return res.download(abs)
  } catch (err) {
    console.error('projectViewer /download error', err)
    return res.status(500).json({ error: String(err) })
  }
})

// POST /file — guardar contenido en un archivo (mutación)
// Requiere header X-CSRF-Token (double-submit) además de la sesión.
router.post('/file', verifyCsrf, (req, res) => {
  try {
    const { path: relPath, content } = req.body || {}
    if (!relPath || typeof content !== 'string') return res.status(400).json({ error: 'path and content required' })

    const abs = safeResolve(String(relPath).trim())
    if (!abs) return res.status(400).json({ error: 'invalid path' })

    const existed = fs.existsSync(abs)
    if (existed) {
      const stat = fs.statSync(abs)
      if (stat.isDirectory()) return res.status(400).json({ error: 'is directory' })
    } else {
      // permitir crear nuevo archivo: asegurarse que el directorio padre exista
      const parent = path.dirname(abs)
      try {
        fs.mkdirSync(parent, { recursive: true })
      } catch (mkErr) {
        console.error('projectViewer: failed to create parent dir', parent, mkErr)
        return res.status(500).json({ error: 'failed to create directory' })
      }
    }

    const MAX_BYTES = 3 * 1024 * 1024 // 3 MB
    const byteLength = Buffer.byteLength(content, 'utf8')
    if (byteLength > MAX_BYTES) return res.status(413).json({ error: 'file too large', size: byteLength })

    // Heurística simple: detectar null bytes en el primer fragmento para evitar escribir binarios
    const sample = Buffer.from(content.slice(0, 8192), 'utf8')
    if (sample.includes(0)) return res.status(400).json({ error: 'binary content' })

    // Antes de sobrescribir, crear copia de seguridad si el archivo existía
    if (existed) {
      try {
          const now = new Date()
          const pad = (n) => String(n).padStart(2, '0')
          const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
          // Renombrar backup como: nombreArchivoAAAAMMDDHHMMSS.extension
          const ext = path.extname(abs) // incluye el punto si existe, ej. '.txt'
          const nameOnly = path.basename(abs, ext)
          // Formato de backup: nombreArchivo.AAAAMMDDHHMMSS.extension
          const backupName = `${nameOnly}.${ts}${ext}`
          const backupAbs = path.join(path.dirname(abs), backupName)
          fs.copyFileSync(abs, backupAbs)
      } catch (bkErr) {
        console.error('projectViewer: failed to create backup for', abs, bkErr)
        // no bloquear la operación por fallo de backup; continuar
      }
    }

    // Escribir el contenido (síncrono para simplicidad en este router dev)
    fs.writeFileSync(abs, content, 'utf8')
    return res.json({ ok: true })
  } catch (err) {
    console.error('projectViewer /file (save) error', err)
    return res.status(500).json({ error: String(err) })
  }
})

// POST /upload — subir archivo binario (XLSX, imágenes, etc.)
// Se usa para sobrescribir archivos binarios en el repositorio desde el frontend.
router.post('/upload', verifyCsrf, (req, res) => {
  try {
    const rel = String(req.query.path || '').trim()
    const abs = safeResolve(rel)
    if (!abs) return res.status(400).json({ error: 'invalid path' })

    const existed = fs.existsSync(abs)
    if (existed) {
      const stat = fs.statSync(abs)
      if (stat.isDirectory()) return res.status(400).json({ error: 'is directory' })
    } else {
      const parent = path.dirname(abs)
      try { fs.mkdirSync(parent, { recursive: true }) } catch (mkErr) {
        console.error('projectViewer: failed to create parent dir', parent, mkErr)
        return res.status(500).json({ error: 'failed to create directory' })
      }
    }

    // Antes de sobrescribir, crear copia de seguridad si el archivo existía
    if (existed) {
      try {
        const now = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
        const ext = path.extname(abs)
        const nameOnly = path.basename(abs, ext)
        const backupName = `${nameOnly}.${ts}${ext}`
        const backupAbs = path.join(path.dirname(abs), backupName)
        fs.copyFileSync(abs, backupAbs)
      } catch (bkErr) {
        console.error('projectViewer: failed to create backup for', abs, bkErr)
      }
    }

    // Leer el body como buffer (stream) para soportar binarios
    const chunks = []
    let received = 0
    req.on('data', (c) => { chunks.push(c); received += c.length })
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks)
        const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
        if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'file too large', size: buf.length })
        fs.writeFileSync(abs, buf)
        return res.json({ ok: true })
      } catch (wErr) {
        console.error('projectViewer /upload write error', wErr)
        return res.status(500).json({ error: String(wErr) })
      }
    })
    req.on('error', (e) => {
      console.error('projectViewer /upload stream error', e)
      return res.status(500).json({ error: String(e) })
    })
  } catch (err) {
    console.error('projectViewer /upload error', err)
    return res.status(500).json({ error: String(err) })
  }
})

export default router
