/**
 * scripts/enforce_docs.mjs
 * -----------------------
 * Verifica que cada archivo `.tsx` y `.js` en `frontend/`, `backend/` y `scripts/`
 * tenga un archivo Markdown asociado con el mismo nombre (`<file>.tsx.md` o `<file>.js.md`).
 *
 * Uso:
 *   - `node scripts/enforce_docs.mjs` : solo comprueba y lista faltantes (exit code 2 si faltan)
 *   - `node scripts/enforce_docs.mjs --fix` : crea los `.md` faltantes automáticamente
 *
 * Las `.md` generadas contienen el código fuente en un bloque de código y
 * un placeholder `TODO` para añadir documentación detallada.
 */

import fs from 'fs/promises'
import path from 'path'

const ROOT = path.resolve('.')
const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'generated', '.vite', 'public', 'backend/log', 'log', 'prisma', 'migrations', '.vscode'])
const TARGET_EXTS = new Set(['.tsx', '.js'])

const args = process.argv.slice(2)
const FIX = args.includes('--fix')

async function walk(dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (IGNORE.has(e.name)) continue
      out.push(...await walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

function isTarget(file) {
  const ext = path.extname(file).toLowerCase()
  if (!TARGET_EXTS.has(ext)) return false
  // Limit to main project folders to avoid scanning node modules etc.
  const rel = path.relative(ROOT, file).replaceAll('\\\\', '/')
  if (rel.startsWith('frontend/') || rel.startsWith('backend/') || rel.startsWith('scripts/') || rel.startsWith('src/') || rel === 'package.json') return true
  return true
}

async function fileExists(file) {
  try { await fs.access(file); return true } catch { return false }
}

async function main() {
  console.log('Buscando archivos .tsx/.js en el repo...')
  const all = await walk(ROOT)
  const targets = all.filter(isTarget)
  const missingMd = []
  const created = []
  const missingHeader = []

  for (const f of targets) {
    if (f.includes('node_modules' + path.sep)) continue
    if (f.endsWith('.d.ts')) continue
    const ext = path.extname(f).toLowerCase()
    if (!TARGET_EXTS.has(ext)) continue

    const mdPath = f + '.md'
    const hasMd = await fileExists(mdPath)
    if (!hasMd) missingMd.push(mdPath)

    // revisar si el archivo tiene comentario inicial (heurística)
    const src = await fs.readFile(f, 'utf8')
    const lines = src.split(/\r?\n/)
    const firstNonEmpty = lines.find(l => l.trim().length > 0) || ''
    const t = firstNonEmpty.trim()
    if (t.startsWith('import') || t.startsWith('export') || t.startsWith('const') || t.startsWith('function') || t.startsWith('<')) {
      missingHeader.push(f)
    }

    if (!hasMd && FIX) {
      const codeFence = ext === '.tsx' ? 'tsx' : (ext === '.js' ? 'js' : '')
      const content = [
        `# Documentación automática para ${path.basename(f)}`,
        '',
        '> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.',
        '',
        '## Código fuente',
        '',
        '```' + codeFence,
        src.replace(/\r\n/g, '\n'),
        '```',
        '',
        '## Explicación',
        '',
        '*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*',
        ''
      ].join('\n')
      await fs.writeFile(mdPath, content, 'utf8')
      created.push(mdPath)
    }
  }

  console.log('Archivos revisados:', targets.length)
  console.log('Faltan .md:', missingMd.length)
  if (created.length) {
    console.log('Se crearon .md:', created.length)
    for (const p of created) console.log('  +', path.relative(ROOT, p))
  }
  if (!FIX && missingMd.length) console.log('Ejecuta `node scripts/enforce_docs.mjs --fix` para crear los .md faltantes.')
  if (missingHeader.length) {
    console.log('Archivos sin comentario cabecera detectados (recomendado añadir comentarios):', missingHeader.length)
    for (const f of missingHeader.slice(0, 30)) console.log('  -', path.relative(ROOT, f))
  }

  if (created.length === 0 && missingMd.length === 0) console.log('OK — no faltan .md')

  // Código de salida: 0 OK; 2 = faltan (si no FIX); 1 = error
  if (!FIX && missingMd.length) process.exit(2)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
