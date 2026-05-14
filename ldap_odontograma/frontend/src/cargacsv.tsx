import React, { useState, useRef } from 'react'
import { getCsrfToken } from './csrf'

type Row = string[]

export default function CargaCSV() {
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalRows, setTotalRows] = useState<number | null>(null)
  const [previewLimit, setPreviewLimit] = useState<number>(500)
  const [originalText, setOriginalText] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ inserted: number | null, serverDurationMs: number | null, totalMs: number | null } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Parse CSV text using semicolon as delimiter, lightweight and non-blocking in batches
  async function parseCsvText(text: string, delimiter = ';') {
    setError(null)
    setLoading(true)
    setHeaders(null)
    setRows([])
    setTotalRows(null)

    try {
      // Normalize newlines and split into lines
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lines = normalized.split('\n')
      if (lines.length === 0) throw new Error('Archivo vacío')

      // header is first non-empty line
      let headerLineIndex = 0
      while (headerLineIndex < lines.length && lines[headerLineIndex].trim() === '') headerLineIndex++
      if (headerLineIndex >= lines.length) throw new Error('No se encontró cabecera')

      const headerLine = lines[headerLineIndex]
      const hdrs = headerLine.split(delimiter).map(h => h.trim())
      setHeaders(hdrs)

      // Collect non-empty data lines (avoid counting blank lines)
      const dataLines = lines.slice(headerLineIndex + 1).filter(l => l.trim() !== '')
      setTotalRows(dataLines.length)

      const BATCH = 1000
      for (let i = 0; i < dataLines.length; i += BATCH) {
        const end = Math.min(dataLines.length, i + BATCH)
        const batchParsed: Row[] = []
        for (let j = i; j < end; j++) {
          const parts = dataLines[j].split(delimiter).map(p => p.trim())
          while (parts.length < hdrs.length) parts.push('')
          if (parts.length > hdrs.length) parts.length = hdrs.length
          batchParsed.push(parts)
        }
        // yield to UI thread
        await new Promise(r => setTimeout(r, 0))
        setRows(prev => [...prev, ...batchParsed])
      }

      // Keep original raw text to allow uploading to backend without reserializing
      setOriginalText(text)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setError(null)
    setHeaders(null)
    setRows([])
    setTotalRows(null)
    setLoading(true)
    try {
      // Use file.text() which is efficient in modern browsers
      const text = await f.text()
      setOriginalText(text)
      await parseCsvText(text, ';')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Fetch default CSV from repo path (requires backend /api/project/download and auth)
  async function loadDefaultCsv() {
    setError(null)
    setLoading(true)
    setHeaders(null)
    setRows([])
    try {
      const res = await fetch('/api/project/download?path=' + encodeURIComponent('docs/csv/nuevos.csv'), { credentials: 'include' })
      if (!res.ok) throw new Error('No se pudo descargar el CSV desde el servidor')
      const ab = await res.arrayBuffer()
      // Decodificar evitanto problemas de codificación
      const decoder = new TextDecoder('utf-8')
      const text = decoder.decode(ab)
      setOriginalText(text)
      await parseCsvText(text, ';')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Upload parsed CSV (original text) to backend and show timing
  async function uploadToServer() {
    if (!originalText) return
    setError(null)
    setImportResult(null)
    setLoading(true)
    try {
      const clientStart = Date.now()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const csrf = getCsrfToken()
      if (csrf) headers['X-CSRF-Token'] = csrf

      const res = await fetch('/api/csv/upload', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ csv: originalText }),
      })
      const clientTotalMs = Date.now() - clientStart
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body && body.error ? String(body.error) : `HTTP ${res.status}`)
      }
      const body = await res.json()
      const inserted = typeof body.inserted === 'number' ? body.inserted : null
      const serverDurationMs = typeof body.durationMs === 'number' ? body.durationMs : null
      setImportResult({ inserted, serverDurationMs, totalMs: clientTotalMs })
      // If the UI grid is empty (user didn't preview), parse client-side to show data
      if ((headers === null || rows.length === 0) && originalText) {
        await parseCsvText(originalText, ';')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-4">
      <h2 className="text-xl font-semibold mb-3">Cargar CSV</h2>

      <div className="mb-3 flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileSelect} />
        <button className="px-3 py-1 bg-gray-200 rounded" onClick={loadDefaultCsv} disabled={loading}>Cargar CSV por defecto</button>
        <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={uploadToServer} disabled={loading || !originalText}>Importar al servidor</button>
        <div className="ml-auto text-sm text-gray-600">{loading ? 'Cargando…' : (totalRows != null ? `${totalRows} filas` : '')}</div>
      </div>

      {importResult && (
        <div className="mb-3 text-sm text-green-700">
          Importado: {importResult.inserted ?? '-'} filas — Tiempo servidor: {importResult.serverDurationMs != null ? `${(importResult.serverDurationMs/1000).toFixed(3)} s` : '-'} — Tiempo total cliente: {importResult.totalMs != null ? `${(importResult.totalMs/1000).toFixed(3)} s` : '-'}
        </div>
      )}

      {error && <div className="text-red-600 mb-2">{error}</div>}

      {headers && (
        <div className="mb-2">
          <div className="text-sm text-gray-700 font-medium mb-1">Columnas detectadas</div>
          <div className="flex gap-2 flex-wrap">
            {headers.map((h, i) => <div key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">{h || `col${i}`}</div>)}
          </div>
        </div>
      )}

      {headers && (
        <div className="overflow-auto border rounded" style={{ maxHeight: '60vh' }}>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {headers.map((h, i) => <th key={i} className="p-2 text-left border-b">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, previewLimit).map((r, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {r.map((c, ci) => <td key={ci} className="p-2 align-top border-b whitespace-pre">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {headers && totalRows !== null && totalRows > previewLimit && (
        <div className="mt-2 flex items-center gap-2">
          <div className="text-sm text-gray-600">Mostrando {Math.min(previewLimit, rows.length)} de {rows.length} filas</div>
          <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => setPreviewLimit(l => l + 500)}>Mostrar más</button>
        </div>
      )}
    </main>
  )
}
