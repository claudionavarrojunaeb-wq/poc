/**
 * frontend/src/VerLog.tsx
 * ------------------------
 * Página de visor de logs del proyecto _SSMM.
 *
 * Muestra y permite buscar dentro de dos fuentes de log:
 *   - Logs de operación: archivos `YYYYMMDD.md` en `log/` (raíz del proyecto)
 *   - Logs de errores:   archivos `errorYYYYMMDD.jsonl` en `backend/log/`
 *
 * Características:
 *   - Listado de fechas disponibles al cargar la página.
 *   - Búsqueda por término de texto con resaltado amarillo en los resultados.
 *   - Filtro por rango de fechas (desde / hasta) con selector nativo de calendario.
 *   - Badge de tipo: "error" (JSONL) u "ops" (MD) por cada resultado.
 *   - Para líneas JSONL que sean JSON válido, se muestra formateado.
 *   - Descarga directa del archivo al hacer clic en su nombre.
 *   - Spinner de carga mientras se espera respuesta del backend.
 *
 * Endpoints consumidos (proxy Vite → http://127.0.0.1:4000):
 *   GET /api/logsViewer/list
 *   GET /api/logsViewer/search?term=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET /api/logsViewer/file?name=NOMBRE_ARCHIVO
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * LogMatch
 * Representa una línea coincidente devuelta por GET /api/logsViewer/search.
 *
 * - date   : fecha extraída del nombre del archivo (YYYYMMDD)
 * - file   : nombre del archivo (ej. `20260506.md` o `error20260506.jsonl`)
 * - source : 'ops' para Markdown, 'errors' para JSONL
 * - line   : contenido completo de la línea
 * - index  : número de línea 0-based dentro del archivo
 */
type LogMatch = {
  date:   string
  file:   string
  source: 'ops' | 'errors'
  line:   string
  index:  number
}

// ── Componente DateInput ──────────────────────────────────────────────────────
//
// Input de fecha que muestra un placeholder de texto cuando está vacío
// (porque el tipo "date" no permite placeholder visible en todos los navegadores).
// Al recibir foco o tener valor, cambia a type="date" para mostrar el selector nativo.
function DateInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  ariaLabel?:  string
  className?:  string
}) {
  // `focused` controla si el input está en modo date o texto
  const [focused, setFocused] = useState(false)
  const inputType = focused || value ? 'date' : 'text'

  return (
    <input
      type={inputType}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Al perder foco sin valor, volver a modo texto para mostrar el placeholder
        if (!e.currentTarget.value) setFocused(false)
      }}
    />
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function VerLog() {
  // Lista de fechas disponibles (YYYYMMDD) que llega del endpoint /list
  const [dates, setDates]     = useState<string[]>([])
  // Término de búsqueda ingresado por el usuario
  const [term, setTerm]       = useState('')
  // Rango de fechas (YYYY-MM-DD para compatibilidad con input type="date")
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  // Resultados de la búsqueda
  const [results, setResults] = useState<LogMatch[]>([])
  // Estado de carga mientras se espera la respuesta del backend
  const [loading, setLoading] = useState(false)

  // Al montar el componente, obtener la lista de fechas disponibles
  useEffect(() => {
    fetch('/api/logsViewer/list', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setDates(j.dates || []))
      .catch(() => setDates([]))
  }, [])

  // doSearch: ejecuta la búsqueda con los filtros actuales
  async function doSearch() {
    setLoading(true)
    try {
      // Construir los query params solo con los valores presentes
      const params = new URLSearchParams()
      if (term) params.set('term', term)
      if (from) params.set('from', from)
      if (to)   params.set('to', to)

      const r = await fetch('/api/logsViewer/search?' + params.toString(), { credentials: 'include' })
      const j = await r.json()
      setResults(j.matches || [])
    } catch (e) {
      console.error('logsViewer search error', e)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Lanzar búsqueda al presionar Enter en el campo de término
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doSearch()
  }

  // ── renderLine ──────────────────────────────────────────────────────────────
  // Renderiza el contenido de una línea de log.
  // Si la línea es JSON válido (caso JSONL), la muestra formateada con indentación.
  // En todos los casos, resalta las ocurrencias del término buscado en amarillo.
  function renderLine(line: string, source: 'ops' | 'errors'): ReactNode {
    // Intentar parsear como JSON solo para archivos de error (JSONL)
    if (source === 'errors' && line.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(line)
        // Formatear como JSON legible y luego resaltar el término
        const pretty = JSON.stringify(obj, null, 2)
        return (
          <pre className="whitespace-pre-wrap wrap-break-word text-[11px] leading-relaxed">
            {renderHighlighted(pretty, term)}
          </pre>
        )
      } catch {
        // Si no parsea, caer al render de texto plano
      }
    }
    // Texto plano (Markdown o JSONL no parseable)
    return (
      <div className="whitespace-pre-wrap wrap-break-word">
        {renderHighlighted(line, term)}
      </div>
    )
  }

  // ── renderHighlighted ───────────────────────────────────────────────────────
  // Divide la línea en segmentos y envuelve cada coincidencia del término
  // en un <span> con fondo amarillo. Usa RegExp global para capturar todas las ocurrencias.
  function renderHighlighted(line: string, searchTerm: string): ReactNode {
    if (!searchTerm) return line

    // Escapar caracteres especiales de RegExp para evitar errores con términos como "c++"
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, 'gi')
    const elements: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let i = 0

    while ((match = re.exec(line)) !== null) {
      const start = match.index
      // Texto previo a la coincidencia
      if (start > lastIndex) elements.push(line.slice(lastIndex, start))
      // La coincidencia resaltada
      elements.push(
        <span key={`h-${i}-${start}`} className="bg-yellow-200 text-black px-0.5 rounded">
          {match[0]}
        </span>
      )
      lastIndex = re.lastIndex
      i++
    }

    // Texto restante después de la última coincidencia
    if (lastIndex < line.length) elements.push(line.slice(lastIndex))

    return elements.length ? <>{elements}</> : <>{line}</>
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Encabezado */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">Visor de logs</h1>
        <p className="text-sm text-gray-500 mb-5">
          Logs de operación (<code className="bg-gray-100 px-1 rounded">YYYYMMDD.md</code>) y
          errores del backend (<code className="bg-gray-100 px-1 rounded">errorYYYYMMDD.jsonl</code>)
        </p>

        {/* Panel de búsqueda */}
        <div className="mb-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">

            {/* Campo de búsqueda por término */}
            <input
              className="border border-gray-300 p-2 rounded flex-1 min-w-0 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Buscar término (ej: LOGIN_FAILED, claudio.navarro)"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            {/* Filtro desde */}
            <DateInput
              value={from}
              onChange={setFrom}
              placeholder="Desde"
              ariaLabel="Fecha desde"
              className="border border-gray-300 p-2 rounded text-sm w-full sm:w-36 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            {/* Filtro hasta */}
            <DateInput
              value={to}
              onChange={setTo}
              placeholder="Hasta"
              ariaLabel="Fecha hasta"
              className="border border-gray-300 p-2 rounded text-sm w-full sm:w-36 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            {/* Botón buscar */}
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium w-full sm:w-auto disabled:opacity-50 transition-colors"
              onClick={doSearch}
              disabled={loading || !term}
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          {/* Fechas disponibles */}
          <div className="text-xs text-gray-400 mt-2">
            Fechas disponibles:{' '}
            {dates.length
              ? dates.map((d) => (
                  <span key={d} className="mr-1 font-mono">{d}</span>
                ))
              : 'cargando…'
            }
          </div>
        </div>

        {/* Panel de resultados */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">
              {loading
                ? 'Buscando…'
                : results.length > 0
                  ? `${results.length} resultado${results.length !== 1 ? 's' : ''}`
                  : 'Sin resultados'
              }
            </span>
            {results.length === 2000 && (
              <span className="text-xs text-amber-600 font-medium">
                Límite de 2000 resultados alcanzado — refine la búsqueda
              </span>
            )}
          </div>

          {/* Lista de coincidencias */}
          <div className="space-y-2 max-h-[65vh] overflow-y-auto font-mono text-xs">
            {results.map((r, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-md overflow-x-auto hover:bg-gray-50 transition-colors">

                {/* Cabecera de la coincidencia: fecha, archivo, tipo, número de línea */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1.5">

                  {/* Fecha del archivo */}
                  <span className="font-semibold text-gray-700 font-mono">{r.date}</span>

                  {/* Badge de tipo: error (JSONL) u ops (MD) */}
                  {r.source === 'errors' ? (
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide">
                      error
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide">
                      ops
                    </span>
                  )}

                  {/* Enlace de descarga del archivo */}
                  <a
                    className="text-blue-600 hover:underline"
                    href={`/api/logsViewer/file?name=${encodeURIComponent(r.file)}`}
                    download={r.file}
                  >
                    {r.file}
                  </a>

                  {/* Número de línea */}
                  <span className="ml-auto text-gray-400">línea {r.index}</span>
                </div>

                {/* Contenido de la línea con resaltado y formato */}
                <div className="text-gray-800 leading-relaxed">
                  {renderLine(r.line, r.source)}
                </div>
              </div>
            ))}

            {/* Estado vacío: no hay resultados y no estamos cargando */}
            {!loading && results.length === 0 && term && (
              <div className="text-center py-10 text-gray-400 text-sm">
                No se encontraron coincidencias para «{term}»
              </div>
            )}

            {/* Estado inicial: no se ha buscado todavía */}
            {!loading && results.length === 0 && !term && (
              <div className="text-center py-10 text-gray-400 text-sm">
                Ingresa un término y presiona Buscar
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
