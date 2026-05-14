import { useEffect, useState, useRef } from 'react'
import { getCsrfToken } from './csrf'
import { FiEdit, FiSave, FiEye, FiCornerUpLeft, FiPlus, FiX, FiDownload, FiMaximize, FiMinimize, FiMail } from 'react-icons/fi'

type Entry = { name: string; path: string; isDirectory: boolean; size: number | null }

export default function VerProyecto() {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  // spreadsheetHtml removed: we now use structured rows for editing
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [viewerSize, setViewerSize] = useState<{ width: number; height: number } | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const prevSizeRef = useRef<{ width: number; height: number } | null>(null)
  const workbookRef = useRef<unknown | null>(null)
  const [sheetNames, setSheetNames] = useState<string[] | null>(null)
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0)
  const [spreadsheetRows, setSpreadsheetRows] = useState<string[][] | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  // Styles per cell: key = "r:c" -> { bg?: '#RRGGBB', color?: '#RRGGBB' }
  const [spreadsheetStyles, setSpreadsheetStyles] = useState<Record<string, { bg?: string; color?: string }>>({})
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null)
  const [cellBg, setCellBg] = useState<string>('#ffffff')
  const [cellColor, setCellColor] = useState<string>('#000000')
  const [paletteOpenFor, setPaletteOpenFor] = useState<'bg' | 'color' | null>(null)
  const paletteRef = useRef<HTMLDivElement | null>(null)
  const moreColorInputRef = useRef<HTMLInputElement | null>(null)
  const themeColors = [
    '#FFFFFF','#000000','#F3F4F6','#E5E7EB','#D1D5DB','#9CA3AF',
    '#111827','#374151','#1F2937','#3B82F6','#60A5FA','#93C5FD',
    '#FCA5A5','#FB923C','#F59E0B','#FDE68A','#BBF7D0','#86EFAC'
  ]
  const standardColors = ['#FF0000','#FFA500','#FFFF00','#00FF00','#00B0FF','#0000FF','#800080','#FFC0CB']

  // Email compose modal state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSentMessage, setEmailSentMessage] = useState<string | null>(null)
  // Microsoft Graph / Outlook integration
  const [graphLinked, setGraphLinked] = useState<boolean>(false)
  const [contactsModalOpen, setContactsModalOpen] = useState<boolean>(false)
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; emails: string[] }>>([])
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  useEffect(() => { loadPath('') }, [])

  // Microsoft Graph helpers
  useEffect(() => {
    // comprobar estado al montar
    (async () => {
      try {
        const r = await fetch('/api/graph/status', { credentials: 'include' })
        if (r.ok) {
          const j = await r.json()
          setGraphLinked(!!j.linked)
        }
      } catch { /* ignore */ }
    })()

    // Escuchar mensaje desde popup de OAuth
    function onMessage(e: MessageEvent) {
      try {
        if (e.data && e.data.type === 'ms_oauth') {
          setGraphLinked(true)
          // tras linking, traer contactos en background
          fetchGraphContacts().catch(() => {})
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function connectOutlook() {
    // Abre popup para autorizar la app en Microsoft
    window.open('/api/graph/connect', 'ms_graph_connect', 'width=600,height=700')
  }

  async function fetchGraphContacts() {
    setLoadingContacts(true)
    try {
      const r = await fetch('/api/graph/contacts', { credentials: 'include' })
      if (!r.ok) throw new Error('failed')
      const j = await r.json()
      setContacts(j.contacts || [])
    } catch (e) {
      console.warn('Failed to fetch contacts', e)
      setContacts([])
    } finally { setLoadingContacts(false) }
  }

  function toggleSelectedEmail(email: string, checked: boolean) {
    setSelectedEmails(prev => {
      const s = new Set(prev)
      if (checked) s.add(email)
      else s.delete(email)
      return Array.from(s)
    })
  }

  function addSelectedContacts() {
    if (!selectedEmails || selectedEmails.length === 0) return setContactsModalOpen(false)
    setEmailTo(prev => {
      const existing = prev ? prev.split(';').map(p => p.trim()).filter(Boolean) : []
      for (const e of selectedEmails) if (e && !existing.includes(e)) existing.push(e)
      return existing.join('; ')
    })
    setContactsModalOpen(false)
    setSelectedEmails([])
  }

  async function handleOutlookClick() {
    if (!graphLinked) {
      connectOutlook()
      return
    }
    await fetchGraphContacts()
    setContactsModalOpen(true)
  }

    // Inicializar tamaño del visor cuando se seleccione un archivo por primera vez.
    useEffect(() => {
      if (!viewerRef.current) return
      if (viewerSize) return
      const rect = viewerRef.current.getBoundingClientRect()
      const defaultH = rect.height || Math.round(window.innerHeight * 0.7)
      const defaultW = rect.width || Math.round((viewerRef.current.parentElement?.clientWidth || window.innerWidth) * 0.9)
      setViewerSize({ width: Math.max(400, Math.round(defaultW)), height: Math.max(200, Math.round(defaultH)) })
    }, [selectedFile, viewerSize])

    function startResize(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
      e.preventDefault?.()
      // coordenadas iniciales desde evento de ratón o táctil
      let startX = 0
      let startY = 0
      if ('touches' in e && e.touches && e.touches[0]) {
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
      } else {
        // React.MouseEvent tiene clientX/clientY
        startX = (e as React.MouseEvent).clientX
        startY = (e as React.MouseEvent).clientY
      }

      const startW = viewerSize?.width ?? (viewerRef.current?.offsetWidth ?? 600)
      const startH = viewerSize?.height ?? (viewerRef.current?.offsetHeight ?? 400)

      function onMove(ev: MouseEvent | TouchEvent) {
        let clientX = 0, clientY = 0
        if ('touches' in ev && ev.touches && ev.touches[0]) {
          clientX = ev.touches[0].clientX
          clientY = ev.touches[0].clientY
        } else {
          clientX = (ev as MouseEvent).clientX
          clientY = (ev as MouseEvent).clientY
        }
        const dx = clientX - startX
        const dy = clientY - startY
        const minW = 300; const minH = 150
        const maxW = Math.max(window.innerWidth - 100, minW); const maxH = Math.max(window.innerHeight - 100, minH)
        let newW = Math.round(startW + dx); let newH = Math.round(startH + dy)
        newW = Math.min(Math.max(newW, minW), maxW); newH = Math.min(Math.max(newH, minH), maxH)
        setViewerSize({ width: newW, height: newH })
        // evitar comportamiento por defecto en touch para que no haga scroll la página
        if ('preventDefault' in ev) ev.preventDefault()
      }

      function onUp() {
        window.removeEventListener('mousemove', onMove as EventListener)
        window.removeEventListener('mouseup', onUp as EventListener)
        window.removeEventListener('touchmove', onMove as EventListener)
        window.removeEventListener('touchend', onUp as EventListener)
      }

      window.addEventListener('mousemove', onMove as EventListener)
      window.addEventListener('mouseup', onUp as EventListener)
      window.addEventListener('touchmove', onMove as EventListener, { passive: false })
      window.addEventListener('touchend', onUp as EventListener)
    }

    // Toggle full screen for the viewer element (uses Fullscreen API with small vendor fallbacks)
    function toggleFullScreen() {
      const el = viewerRef.current as (HTMLElement & {
        webkitRequestFullscreen?: () => void
        mozRequestFullScreen?: () => void
        msRequestFullscreen?: () => void
      }) | null
      if (!el) return

      const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        mozFullScreenElement?: Element | null
        msFullscreenElement?: Element | null
        webkitExitFullscreen?: () => void
        mozCancelFullScreen?: () => void
        msExitFullscreen?: () => void
      }

      const isFS = !!(document.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)

      if (!isFS) {
        // guardar tamaño actual para restaurar al salir
        prevSizeRef.current = viewerSize
        // Preferir métodos estándar, usar vendor-prefixed si hace falta
        const req = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el) || el.mozRequestFullScreen?.bind(el) || el.msRequestFullscreen?.bind(el)
        if (req) {
          try {
            req()
          } catch {
            // Si falla, aplicar pseudo-fullscreen por CSS
            el.classList.add('fullscreen')
            setFullScreen(true)
            document.body.style.overflow = 'hidden'
          }
        } else {
          el.classList.add('fullscreen')
          setFullScreen(true)
          document.body.style.overflow = 'hidden'
        }
      } else {
        const exit = document.exitFullscreen?.bind(document) || doc.webkitExitFullscreen?.bind(document) || doc.mozCancelFullScreen?.bind(document) || doc.msExitFullscreen?.bind(document)
        if (exit) {
          try {
            exit()
          } catch {
            if (viewerRef.current) viewerRef.current.classList.remove('fullscreen')
            setFullScreen(false)
            document.body.style.overflow = ''
          }
        } else {
          if (viewerRef.current) viewerRef.current.classList.remove('fullscreen')
          setFullScreen(false)
          document.body.style.overflow = ''
        }
      }
    }

    // Escuchar cambios de fullscreen para actualizar estado y restaurar tamaño
    useEffect(() => {
      function onFSChange() {
        const doc = document as Document & {
          webkitFullscreenElement?: Element | null
          mozFullScreenElement?: Element | null
          msFullscreenElement?: Element | null
        }
        const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement
        const isFS = !!fsEl
        setFullScreen(isFS)
        if (viewerRef.current) {
          if (isFS) {
            viewerRef.current.classList.add('fullscreen')
            document.body.style.overflow = 'hidden'
          } else {
            viewerRef.current.classList.remove('fullscreen')
            document.body.style.overflow = ''
            if (prevSizeRef.current) {
              setViewerSize(prevSizeRef.current)
              prevSizeRef.current = null
            }
          }
        }
      }

      document.addEventListener('fullscreenchange', onFSChange)
      document.addEventListener('webkitfullscreenchange', onFSChange)
      document.addEventListener('mozfullscreenchange', onFSChange)
      document.addEventListener('MSFullscreenChange', onFSChange)
      return () => {
        document.removeEventListener('fullscreenchange', onFSChange)
        document.removeEventListener('webkitfullscreenchange', onFSChange)
        document.removeEventListener('mozfullscreenchange', onFSChange)
        document.removeEventListener('MSFullscreenChange', onFSChange)
      }
    }, [])

  async function loadPath(rel: string) {
    setError(null)
    setFileContent(null)
    setSelectedFile(null)
    setLoading(true)
      try {
        const res = await fetch('/api/project/list?path=' + encodeURIComponent(rel), { credentials: 'include' })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j && j.error ? String(j.error) : res.statusText)
        }
      const j = await res.json()
      setEntries(j.entries || [])
      setCurrentPath(j.path || '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setEntries([])
    } finally { setLoading(false) }
  }

  // Asegurar la carga de la build completa (con soporte de estilos) desde CDN.
  async function ensureXLSXFull() {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    if (typeof window === 'undefined') return null
    const w = window as any
    if (w.__XLSX_FULL_LOADED && w.XLSX) return w.XLSX
    // Intentar usar la instancia ya disponible si parece completa
    if (w.XLSX && w.XLSX.write && w.XLSX.utils && w.XLSX.utils.encode_cell) {
      if (w.XLSX.__isFull) { w.__XLSX_FULL_LOADED = true; return w.XLSX }
    }

    return new Promise((resolve, reject) => {
      try {
        // Cargar la build completa desde CDN (incluye soporte de estilos)
        const s = document.createElement('script')
        // Usar xlsx-js-style desde jsdelivr (fork con soporte real de estilos de celda)
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
        s.async = true
        s.onload = () => {
          // xlsx-js-style expone XLSXStyle en window; normalizar a window.XLSX
          const w = window as any
          if (!w.XLSX && w.XLSXStyle) w.XLSX = w.XLSXStyle
          w.__XLSX_FULL_LOADED = true
          resolve(w.XLSXStyle || w.XLSX)
        }
        s.onerror = (e2) => reject(e2)
        document.head.appendChild(s)
      } catch (e2) { reject(e2) }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async function openFile(pathRel: string) {
    setError(null)
    setLoading(true)
    setLoadingFile(true)
    try {
      // Si es spreadsheet, descargar como binario y parsear con SheetJS
      if (isSpreadsheet(pathRel)) {
        setSpreadsheetRows(null)
        const res = await fetch('/api/project/download?path=' + encodeURIComponent(pathRel), { credentials: 'include' })
        if (!res.ok) {
          const t = await res.text().catch(() => res.statusText)
          throw new Error(t || res.statusText)
        }
        const ab = await res.arrayBuffer()
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const XLSX = await ensureXLSX() as any
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!XLSX) throw new Error('No se pudo cargar la librería para previsualizar XLSX')
        const data = new Uint8Array(ab)
        // cellStyles:true para extraer colores/fills al leer archivos existentes
        const wb = XLSX.read(data, { type: 'array', cellStyles: true })
        workbookRef.current = wb
        const names = wb.SheetNames || []
        setSheetNames(names)
        const first = names[0]
        if (first) {
          const ws = wb.Sheets[first]
          const rows = (XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]).map(r => r.map(c => (c === undefined || c === null) ? '' : String(c)))
          // Extraer estilos de celdas (si existen) y mapearlos a formato CSS (#RRGGBB)
          const styleMap: Record<string, { bg?: string; color?: string }> = {}
          /* eslint-disable @typescript-eslint/no-explicit-any */
          try {
            const keys = Object.keys(ws || {})
            for (const k of keys) {
              if (!k || k[0] === '!') continue
              const cell = (ws as any)[k]
              if (cell && cell.s) {
                const dec = XLSX.utils.decode_cell(k)
                const r = dec.r; const c = dec.c
                let bg: string | undefined
                let color: string | undefined
                // xlsx-js-style pone los fills directamente en cell.s (cell.s.fgColor)
                // en lugar de anidados en cell.s.fill.fgColor — se prueban ambas rutas
                const fgColor =
                  (cell.s.fgColor && cell.s.fgColor.rgb)
                    ? cell.s.fgColor.rgb
                    : (cell.s.fill && cell.s.fill.fgColor && cell.s.fill.fgColor.rgb)
                      ? cell.s.fill.fgColor.rgb
                      : null
                if (fgColor) {
                  const rgb = String(fgColor)
                  // Formato puede ser RRGGBB (6 chars) o AARRGGBB (8 chars); quitar alpha si existe
                  const hex = rgb.length === 8 ? rgb.slice(2) : rgb
                  if (hex.toLowerCase() !== 'ffffff' && hex.toLowerCase() !== '000000') {
                    bg = `#${hex}`
                  } else {
                    bg = `#${hex}`
                  }
                }
                // Mismo patrón para color de texto: cell.s.color.rgb o cell.s.font.color.rgb
                const fontColor =
                  (cell.s.color && cell.s.color.rgb)
                    ? cell.s.color.rgb
                    : (cell.s.font && cell.s.font.color && cell.s.font.color.rgb)
                      ? cell.s.font.color.rgb
                      : null
                if (fontColor) {
                  const rgb2 = String(fontColor)
                  const hex2 = rgb2.length === 8 ? rgb2.slice(2) : rgb2
                  color = `#${hex2}`
                }
                if (bg || color) styleMap[`${r}:${c}`] = { bg, color }
              }
            }
          } catch { /* ignore style extraction errors */ }
          /* eslint-enable @typescript-eslint/no-explicit-any */
          setSpreadsheetStyles(styleMap)
          setSpreadsheetRows(rows as string[][])
          setLoadingFile(false)
        } else {
          setSpreadsheetRows([[]])
        }
        setFileContent('')
        setSelectedFile(pathRel)
        setPreview(false)
        return
      }

      // Fallback: archivo de texto (MD, código, etc.)
      const res = await fetch('/api/project/file?path=' + encodeURIComponent(pathRel), { credentials: 'include' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j && j.error ? String(j.error) : res.statusText)
      }
      const j = await res.json()
      setSpreadsheetRows(null)
      setFileContent(j.content ?? '')
      setSelectedFile(j.path ?? pathRel)
      setPreview(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setFileContent(null)
      setSelectedFile(null)
      setSpreadsheetRows(null)
    } finally { setLoading(false); setLoadingFile(false) }
  }

  async function saveFile() {
    if (!selectedFile) return
    // Si es spreadsheet, usar el flujo binario de guardado
    if (isSpreadsheet(selectedFile)) {
      await saveSpreadsheet()
      return
    }
    if (fileContent === null) return
    setSaving(true)
    setError(null)
    try {
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      let csrf = getCsrfToken()
      // Si no existe token CSRF accesible, solicitarlo al servidor (establece cookie y/o devuelve token)
      if (!csrf) {
        try {
          const r = await fetch('/api/csrf-token', { credentials: 'include' })
          if (r.ok) {
            const j = await r.json().catch(() => ({}))
            if (j && typeof j === 'object' && j['csrfToken']) csrf = j['csrfToken']
            // Guardar en localStorage como fallback para entornos donde la cookie es bloqueada
            try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      if (csrf) headers['X-CSRF-Token'] = csrf
      const res = await fetch('/api/project/file', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ path: selectedFile, content: fileContent })
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j && j.error ? String(j.error) : res.statusText)
      }
      setSavedMessage('Guardado')
      setTimeout(() => setSavedMessage(null), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // --- Email compose / send (server-side) ---------------------------------
  function openEmailModal() {
    if (!selectedFile) {
      setError('Seleccione un archivo antes de enviar por email')
      return
    }
    setEmailTo('')
    setEmailCc('')
    const name = selectedFile ? selectedFile.split('/').pop() : 'archivo'
    setEmailSubject(`Envío: ${name}`)
    setEmailBody(`Adjunto: ${name}\n\n`)
    setEmailError(null)
    setShowEmailModal(true)
  }

  async function sendEmail() {
    if (!selectedFile) return setEmailError('No hay archivo seleccionado')
    if (!emailTo) return setEmailError('Ingrese al menos un destinatario')
    setSendingEmail(true)
    setEmailError(null)
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const payload: any = { to: emailTo, subject: emailSubject || '', text: emailBody || '', attachments: [selectedFile] }
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (emailCc) payload.cc = emailCc
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      const csrf = getCsrfToken()
      if (csrf) headers['X-CSRF-Token'] = csrf
      const res = await fetch('/api/send-email', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j && j.error ? String(j.error) : res.statusText)
      }
      setEmailSentMessage('Enviado')
      setTimeout(() => setEmailSentMessage(null), 3000)
      setShowEmailModal(false)
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : String(err))
    } finally {
      setSendingEmail(false)
    }
  }

  // Guardar hoja de cálculo: actualiza el workbook en memoria y envía binario al servidor
  async function saveSpreadsheet() {
    if (!selectedFile) return
    setSaving(true)
    setError(null)
      try {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        let XLSX = await ensureXLSX() as any
        // Cargar la build completa si hace falta para soporte de estilos en la escritura
        try {
          const full = await (ensureXLSXFull as any)()
          if (full) XLSX = full
        } catch {
          // si falla al cargar la build completa, seguimos con la instancia disponible
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const names = (workbookRef.current as any).SheetNames || []
      const sheetIndex = Math.max(0, Math.min((activeSheetIndex || 0), names.length - 1))
      const sheetName = names[sheetIndex] || 'Sheet1'
      // Reconstruir la hoja desde spreadsheetRows
      const aoa = (spreadsheetRows && spreadsheetRows.map(r => r.slice())) || [[]]
      const newWs = XLSX.utils.aoa_to_sheet(aoa)
      // Aplicar estilos de celdas locales al worksheet antes de escribir
      try {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        for (const k of Object.keys(spreadsheetStyles || {})) {
          const [rr, cc] = k.split(':').map(s => Number(s))
          if (Number.isNaN(rr) || Number.isNaN(cc)) continue
          const addr = XLSX.utils.encode_cell({ r: rr, c: cc })
          if (!newWs[addr]) newWs[addr] = { t: 's', v: '' }
          const st = (spreadsheetStyles as Record<string, { bg?: string; color?: string }>)[k]
          const sObj: any = {}
          if (st && st.bg) {
            const hex = st.bg.replace(/^#/, '').toUpperCase()
            const argb = hex.length === 6 ? 'FF' + hex : hex
            // bgColor:{indexed:64} es necesario para que Excel reconozca el fill sólido (OOXML spec)
            sObj.fill = { patternType: 'solid', fgColor: { rgb: argb }, bgColor: { indexed: 64 } }
          }
          if (st && st.color) {
            const hex2 = st.color.replace(/^#/, '').toUpperCase()
            sObj.font = { color: { rgb: (hex2.length === 6 ? 'FF' + hex2 : hex2) } }
          }
          if (Object.keys(sObj).length) newWs[addr].s = sObj
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      } catch {
        /* ignore style application errors */
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      // Reconstruir un nuevo workbook con la instancia actual de XLSX (full build)
      // para asegurarnos de que las tablas de estilos se generen correctamente.
      const origWb = (workbookRef.current as any) || { SheetNames: [], Sheets: {} }
      const newWb: any = XLSX.utils.book_new()
      for (const nm of names) {
        let wsToAppend: any
        if (nm === sheetName) {
          wsToAppend = newWs
        } else {
          // Reconstruir las demás hojas como AOA para evitar problemas de compatibilidad
          try {
            const oldWs = origWb.Sheets[nm]
            const rowsOther = XLSX.utils.sheet_to_json(oldWs, { header: 1 }) || []
            wsToAppend = XLSX.utils.aoa_to_sheet(rowsOther)
          } catch {
            // Si falla la reconstrucción, intentar copiar la hoja original tal cual
            wsToAppend = (origWb.Sheets && origWb.Sheets[nm]) || XLSX.utils.aoa_to_sheet([[]])
          }
        }
        XLSX.utils.book_append_sheet(newWb, wsToAppend, nm)
      }
      // Reemplazar el workbook en memoria por el nuevo construido con la full build
      workbookRef.current = newWb
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array', cellStyles: true })

      // Enviar ArrayBuffer/Uint8Array directamente
      const url = '/api/project/upload?path=' + encodeURIComponent(selectedFile)
      const headers: Record<string,string> = {}
      let csrf = getCsrfToken()
      if (!csrf) {
        try {
          const r = await fetch('/api/csrf-token', { credentials: 'include' })
          if (r.ok) {
            const j = await r.json().catch(() => ({}))
            if (j && typeof j === 'object' && j['csrfToken']) csrf = j['csrfToken']
            try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      if (csrf) headers['X-CSRF-Token'] = csrf

      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: wbout as BufferSource
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j && j.error ? String(j.error) : res.statusText)
      }

      setSavedMessage('Guardado')
      setTimeout(() => setSavedMessage(null), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // Añadir fila al final de la hoja activa
  function addRow() {
    setSpreadsheetRows(prev => {
      const rows = prev ? prev.map(r => r.slice()) : []
      const cols = rows.reduce((m, r) => Math.max(m, r.length), 0)
      const newRow = new Array(Math.max(1, cols)).fill('')
      rows.push(newRow)
      return rows
    })
  }

  // Añadir columna al final (añade una celda vacía a cada fila)
  function addColumn() {
    setSpreadsheetRows(prev => {
      if (!prev || prev.length === 0) return [['']]
      const rows = prev.map(r => {
        const copy = r.slice()
        copy.push('')
        return copy
      })
      return rows
    })
  }

  // Agregar nueva hoja al workbook en memoria
  async function addSheet() {
    const defaultName = `Sheet${(sheetNames?.length || 0) + 1}`
    const name = window.prompt('Nombre de la nueva hoja:', defaultName)
    if (!name) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const XLSX = await ensureXLSX() as any
    if (!XLSX) return
    const wb = (workbookRef.current as any) || { SheetNames: [], Sheets: {} }
    const names = wb.SheetNames || []
    let newName = name
    let i = 1
    while (names.includes(newName)) newName = `${name}_${i++}`
    names.push(newName)
    wb.SheetNames = names
    wb.Sheets[newName] = XLSX.utils.aoa_to_sheet([[]])
    workbookRef.current = wb
    setSheetNames([...names])
    setActiveSheetIndex(names.length - 1)
    setSpreadsheetRows([[]])
    setSpreadsheetStyles({})
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // Renombrar la hoja activa
  function renameSheet() {
    if (!sheetNames) return
    const oldName = sheetNames[activeSheetIndex] || ''
    const newName = window.prompt('Nuevo nombre de hoja:', oldName)
    if (!newName || newName === oldName) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const wb = (workbookRef.current as any)
    if (!wb) return
    if (wb.SheetNames.includes(newName)) {
      alert('Ya existe una hoja con ese nombre')
      return
    }
    wb.Sheets[newName] = wb.Sheets[oldName]
    delete wb.Sheets[oldName]
    wb.SheetNames[activeSheetIndex] = newName
    setSheetNames([...wb.SheetNames])
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // Establecer estilo para una celda en el mapa local
  function setCellStyle(r: number, c: number, style: { bg?: string; color?: string } | null) {
    const key = `${r}:${c}`
    setSpreadsheetStyles(prev => {
      const copy = { ...prev }
      if (!style) {
        delete copy[key]
      } else {
        copy[key] = { ...(copy[key] || {}), ...(style || {}) }
      }
      return copy
    })
  }

  function applyBg(color?: unknown) {
    // Accept optional color param (string) or be used as onClick handler
    const chosen = (typeof color === 'string') ? color as string : undefined
    if (!selectedCell) return
    const bg = chosen || cellBg
    setCellStyle(selectedCell.r, selectedCell.c, { bg })
  }

  function applyColor(color?: unknown) {
    // Accept optional color param (string) or be used as onClick handler
    const chosen = (typeof color === 'string') ? color as string : undefined
    if (!selectedCell) return
    const col = chosen || cellColor
    setCellStyle(selectedCell.r, selectedCell.c, { color: col })
  }

  function clearStyle() {
    if (!selectedCell) return
    setCellStyle(selectedCell.r, selectedCell.c, null)
  }

  // Cerrar la paleta si el usuario hace click fuera
  useEffect(() => {
    if (!paletteOpenFor) return
    function onDocClick(e: MouseEvent) {
      if (!paletteRef.current) return
      const tgt = e.target as Node
      if (!paletteRef.current.contains(tgt)) setPaletteOpenFor(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [paletteOpenFor])

  function isMarkdown(filename: string | null) {
    return !!filename && /\.(md|markdown)$/i.test(filename)
  }

  function isSpreadsheet(filename: string | null) {
    return !!filename && /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(filename)
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function renderMarkdown(md: string) {
    if (!md) return ''
    // Extraer bloques de código con lenguaje opcional, p.ej. ```js ... ``` o ```mermaid ... ```
    const codeBlocks: Array<{ lang: string; content: string }> = []
    const placeholder = (i: number) => `@@CODEBLOCK${i}@@`
    // \r?\n para manejar saltos de línea CRLF (Windows) y LF (Unix)
    let tmp = md.replace(/```(\w+)?\r?\n([\s\S]*?)```/g, (_m, lang, content) => {
      const idx = codeBlocks.push({ lang: lang || '', content: content.replace(/\r\n/g, '\n').replace(/\r/g, '\n') }) - 1
      return placeholder(idx)
    })

    // Escape del resto del contenido
    tmp = escapeHtml(tmp)

    // Encabezados
    tmp = tmp.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
    tmp = tmp.replace(/^##### (.*)$/gm, '<h5>$1</h5>')
    tmp = tmp.replace(/^#### (.*)$/gm, '<h4>$1</h4>')
    tmp = tmp.replace(/^### (.*)$/gm, '<h3>$1</h3>')
    tmp = tmp.replace(/^## (.*)$/gm, '<h2>$1</h2>')
    tmp = tmp.replace(/^# (.*)$/gm, '<h1>$1</h1>')

    // Bold / italic (bold first)
    tmp = tmp.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    tmp = tmp.replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Inline code
    tmp = tmp.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Links
    tmp = tmp.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

    // Simple lists (lines starting with - or *)
    tmp = tmp.replace(/(^|\n)[ \t]*[-*] +(.*)/g, '$1<li>$2</li>')
    // Wrap consecutive <li> groups with <ul>
    tmp = tmp.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (m) => {
      if (m.trim().startsWith('<li>')) return `<ul>${m}</ul>`
      return m
    })

    // Paragraphs: convertir dobles saltos de línea en párrafos
    tmp = tmp.split(/\n{2,}/).map(part => {
      if (part.trim().startsWith('<h') || part.trim().startsWith('<ul') || part.trim().startsWith('<pre') || part.trim().startsWith('<li') || part.trim().startsWith('<p')) return part
      return `<p>${part.replace(/\n/g, '<br/>')}</p>`
    }).join('\n')

    // Reinsertar bloques de código; si el bloque es de tipo `mermaid` lo dejamos como
    // un contenedor <div class="mermaid">...</div> para que la librería lo renderice.
    tmp = tmp.replace(/@@CODEBLOCK(\d+)@@/g, (_m, idx) => {
      const cb = codeBlocks[Number(idx)]
      if (!cb) return ''
      if (cb.lang && cb.lang.toLowerCase() === 'mermaid') {
        // Guardar el código en data-mermaid; el div se deja vacío para que
        // mermaid v10/v11 lo rellene con el SVG renderizado en el useEffect.
        // El código se pone como atributo base64 para evitar problemas con
        // caracteres especiales HTML dentro del valor del atributo.
        const encoded = btoa(unescape(encodeURIComponent(cb.content)))
        return `<div class="mermaid" data-mermaid="${encoded}"></div>`
      }
      return `<pre><code>${escapeHtml(cb.content)}</code></pre>`
    })

    return tmp
  }

  async function createNewFile() {
    const input = window.prompt('Nombre del nuevo archivo (solo nombre o subruta relativa):', 'nuevo.txt')
    if (!input) return
    const name = String(input).trim()
    setLoading(true)
    setError(null)
    try {
      // Construir la ruta final dentro de la carpeta seleccionada
      const base = currentPath ? currentPath.replace(/\/$/, '') : ''
      const finalPath = base ? `${base}/${name.replace(/^\/+/, '')}` : name.replace(/^\/+/, '')

      // Si el archivo a crear es una hoja de cálculo, generar un XLSX vacío
      if (isSpreadsheet(finalPath)) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const XLSX = await ensureXLSX() as any
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!XLSX) throw new Error('No se pudo cargar la librería XLSX')

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([[]])
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        const url = '/api/project/upload?path=' + encodeURIComponent(finalPath)
        const headers: Record<string,string> = {}
        let csrf = getCsrfToken()
        if (!csrf) {
          try {
            const r = await fetch('/api/csrf-token', { credentials: 'include' })
            if (r.ok) {
              const j = await r.json().catch(() => ({}))
              if (j && typeof j === 'object' && j['csrfToken']) csrf = j['csrfToken']
              try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
            }
          } catch { /* ignore */ }
        }
        if (csrf) headers['X-CSRF-Token'] = csrf

        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: wbout as BufferSource
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j && j.error ? String(j.error) : res.statusText)
        }

        // Abrir el archivo recién creado dentro de la carpeta correspondiente
        const dirParts = finalPath.split('/').filter(Boolean)
        const dir = dirParts.length > 1 ? dirParts.slice(0, -1).join('/') : ''
        await loadPath(dir)
        await openFile(finalPath)
        return
      }

      // Fallback: crear archivo de texto (comportamiento previo)
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      let csrf = getCsrfToken()
      if (!csrf) {
        try {
          const r = await fetch('/api/csrf-token', { credentials: 'include' })
          if (r.ok) {
            const j = await r.json().catch(() => ({}))
            if (j && typeof j === 'object' && j['csrfToken']) csrf = j['csrfToken']
            try { if (csrf && window && window.localStorage) window.localStorage.setItem('ssmm_csrf', csrf) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      if (csrf) headers['X-CSRF-Token'] = csrf

      const res = await fetch('/api/project/file', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ path: finalPath, content: '' })
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j && j.error ? String(j.error) : res.statusText)
      }

      // Abrir el archivo recién creado dentro de la carpeta correspondiente
      const dirParts = finalPath.split('/').filter(Boolean)
      const dir = dirParts.length > 1 ? dirParts.slice(0, -1).join('/') : ''
      await loadPath(dir)
      await openFile(finalPath)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Cargar dinámicamente Mermaid si hace falta y devolver el objeto global
  async function ensureMermaid() {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    if (typeof window === 'undefined') return null
    const w = window as any
    if (w.mermaid) return w.mermaid
    // Primero intentar cargar desde node_modules (producción)
    try {
      // Dynamic import para que Vite haga code-splitting
      const mod = await import('mermaid')
      const mm = (mod && (mod.default || mod)) as any
      if (mm && typeof mm.initialize === 'function') mm.initialize({ startOnLoad: false })
      w.mermaid = mm
      return mm
    } catch {
      // Fallback: cargar desde CDN si el import falla (ej. en entornos where node_modules aren't available)
      return new Promise((resolve, reject) => {
        try {
          const s = document.createElement('script')
          s.src = 'https://unpkg.com/mermaid@9/dist/mermaid.min.js'
          s.async = true
          s.onload = () => {
            try {
              const mm = (window as any).mermaid
              if (mm && typeof mm.initialize === 'function') mm.initialize({ startOnLoad: false })
              resolve(mm)
            } catch { resolve((window as any).mermaid) }
          }
          s.onerror = (e2) => reject(e2)
          document.head.appendChild(s)
        } catch (e2) { reject(e2) }
      })
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

      // Cargar SheetJS (preferir xlsx-js-style) dinámicamente con fallback CDN
      async function ensureXLSX() {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        if (typeof window === 'undefined') return null
        const w = window as any
        // Si ya está la instancia específica, devolverla
        if (w.XLSXStyle) return w.XLSXStyle

        // Intentar importar 'xlsx-js-style' primero (soporte real de estilos)
        try {
          const mod = await import('xlsx-js-style')
          const XLSX = (mod && (mod.default || mod)) as any
          w.XLSXStyle = XLSX
          w.XLSX = XLSX
          return XLSX
        } catch {
          // Si falló la importación, continuar con alternativas
          // Si ya existe una instancia cargada en window, usarla como último recurso
          if (w.XLSXStyle) return w.XLSXStyle
          if (w.XLSX) {
            console.warn('Using fallback window.XLSX which may not support cell styles properly')
            return w.XLSX
          }
          // Intentar cargar xlsx-js-style desde CDN
          return new Promise((resolve, reject) => {
            try {
              const s = document.createElement('script')
              s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
              s.async = true
              s.onload = () => {
                const w2 = window as any
                if (!w2.XLSX && w2.XLSXStyle) w2.XLSX = w2.XLSXStyle
                resolve(w2.XLSXStyle || w2.XLSX)
              }
              s.onerror = (e2) => reject(e2)
              document.head.appendChild(s)
            } catch (e2) { reject(e2) }
          })
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }

  // Cuando se active preview, renderizar bloques mermaid.
  // Estrategia:
  //   1. dangerouslySetInnerHTML genera <div class="mermaid" data-mermaid="BASE64"></div> (vacíos).
  //   2. Este useEffect corre DESPUÉS del commit del DOM; decodifica el atributo base64,
  //      pone el código como textContent del div y llama a mermaid.run({ nodes }) (API v10/v11).
  //   3. Si mermaid.run no existe (v9 CDN), cae a mermaidAPI.render.
  useEffect(() => {
    if (!preview) return
    let cancelled = false
    ;(async () => {
      try {
        // Pequeño yield para asegurar que React terminó el paint del DOM
        await new Promise(r => setTimeout(r, 50))
        if (cancelled) return

        const container = document.getElementById('md-preview')
        if (!container) return
        const mermaidEls = Array.from(container.querySelectorAll<HTMLElement>('.mermaid'))
        if (mermaidEls.length === 0) return

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const mermaid = await ensureMermaid() as any
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!mermaid || cancelled) return

        mermaid.initialize({ startOnLoad: false, theme: 'default' })

        // Decodificar el código guardado en data-mermaid (base64) y ponerlo como textContent
        // para que mermaid.run lo encuentre limpio sin SVG previo.
        for (const el of mermaidEls) {
          const encoded = el.getAttribute('data-mermaid')
          if (encoded) {
            try {
              const code = decodeURIComponent(escape(atob(encoded)))
              // Limpiar el div y dejar solo el código de texto plano
              el.innerHTML = ''
              el.textContent = code
            } catch { /* ignorar errores de decodificación */ }
          }
        }

        if (cancelled) return

        // mermaid.run() es la API recomendada en v10/v11 para renderizar nodos concretos
        if (typeof mermaid.run === 'function') {
          await mermaid.run({ nodes: mermaidEls })
        } else if (typeof mermaid.init === 'function') {
          // Fallback v9
          mermaid.init(undefined, mermaidEls)
        }
      } catch (e) {
        console.warn('mermaid: error al renderizar', e)
      }
    })()
    return () => { cancelled = true }
  }, [preview, fileContent, selectedFile])

  function goUp() {
    if (!currentPath) return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    loadPath(parts.join('/'))
  }

  const breadcrumbs = [ { name: '/', path: '' } ].concat(
    currentPath ? currentPath.split('/').map((p, i, arr) => ({ name: p, path: arr.slice(0, i + 1).join('/') })) : []
  )

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">Ver proyecto</h1>
        <p className="text-sm text-gray-500 mb-4">Navegador de archivos del repositorio. Útil en desarrollo.</p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="mb-3 text-xs text-gray-500 flex items-center gap-2">
            <button onClick={() => loadPath('')} className="text-blue-600 hover:underline">raíz</button>
            <button
              onClick={goUp}
              disabled={!currentPath}
              className="p-2 bg-gray-200 text-sm rounded hover:bg-gray-300 disabled:opacity-50 flex items-center justify-center"
              title="Subir"
              aria-label="Subir"
            >
              <FiCornerUpLeft className="w-4 h-4" />
            </button>
            <button
              onClick={createNewFile}
              className="p-2 bg-gray-200 text-sm rounded hover:bg-gray-300 flex items-center justify-center"
              title="Nuevo archivo"
              aria-label="Nuevo archivo"
            >
              <FiPlus className="w-4 h-4" />
            </button>
            <div className="ml-auto text-gray-400">{loading ? 'Cargando…' : currentPath || '/'}</div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 border-r pr-3">
              <div className="mb-2 text-xs text-gray-600">Ruta</div>
              <div className="flex flex-wrap gap-1 mb-3">
                {breadcrumbs.map((b, idx) => (
                  <button key={idx} onClick={() => loadPath(b.path)} className="text-blue-600 text-sm hover:underline">{b.name}</button>
                ))}
              </div>

              <div className="text-sm text-gray-700 font-medium mb-2">Entradas</div>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto font-mono text-sm">
                {entries.map((e) => (
                  <div key={e.path} className="p-2 hover:bg-gray-50 rounded flex items-center justify-between">
                    <div>
                      <button onClick={() => e.isDirectory ? loadPath(e.path) : openFile(e.path)} className="text-left">
                        <span className={e.isDirectory ? 'text-indigo-600 font-medium' : 'text-gray-800'}>
                          {e.isDirectory ? '📁 ' : '📄 '}{e.name}
                        </span>
                      </button>
                    </div>
                    <div className="text-xs text-gray-400">{e.isDirectory ? 'dir' : (e.size != null ? `${e.size} B` : '')}</div>
                  </div>
                ))}
                {!loading && entries.length === 0 && (<div className="text-gray-400 text-sm p-2">Vacío</div>)}
              </div>
            </div>

            <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-700">Visor de archivo</div>
                    {(entries.length > 0 || selectedFile || currentPath) && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={goUp}
                          disabled={!currentPath}
                          title="Subir"
                          aria-label="Subir"
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 flex items-center justify-center"
                        >
                          <FiCornerUpLeft className="w-4 h-4" />
                        </button>

                        <button
                          onClick={createNewFile}
                          title="Nuevo archivo"
                          aria-label="Nuevo archivo"
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                        >
                          <FiPlus className="w-4 h-4" />
                        </button>

                        {selectedFile && (
                          <a
                            className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                            href={'/api/project/download?path=' + encodeURIComponent(selectedFile)}
                            title="Descargar"
                            aria-label="Descargar"
                          >
                            <FiDownload className="w-4 h-4" />
                          </a>
                        )}

                        {isMarkdown(selectedFile) && (
                          <button
                            onClick={() => setPreview(p => !p)}
                            disabled={saving}
                            title={preview ? 'Editar' : 'Previsualizar'}
                            aria-label={preview ? 'Editar' : 'Previsualizar'}
                            className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-60 flex items-center justify-center"
                          >
                            {preview ? <FiEdit className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                          </button>
                        )}

                        <button
                          onClick={toggleFullScreen}
                          title={fullScreen ? 'Salir pantalla completa' : 'Pantalla completa'}
                          aria-label="Pantalla completa"
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                        >
                          {fullScreen ? <FiMinimize className="w-4 h-4" /> : <FiMaximize className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => openEmailModal()}
                          title="Enviar por email"
                          aria-label="Enviar por email"
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                        >
                          <FiMail className="w-4 h-4" />
                        </button>

                        <button
                          onClick={saveFile}
                          disabled={saving}
                          title="Guardar"
                          aria-label="Guardar"
                          className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center"
                        >
                          <FiSave className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => selectedFile && openFile(selectedFile)}
                          disabled={saving}
                          title="Cancelar"
                          aria-label="Cancelar"
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-60 flex items-center justify-center"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

              <div
                id="file-viewer"
                ref={viewerRef}
                className="border rounded p-3 bg-gray-50 text-sm flex flex-col relative"
                style={{ width: viewerSize ? `${viewerSize.width}px` : '100%', height: viewerSize ? `${viewerSize.height}px` : '70vh' }}
              >
                {loadingFile && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60">
                    <svg className="animate-spin h-8 w-8 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <div className="text-sm text-gray-700 mt-2">Cargando archivo…</div>
                  </div>
                )}

                {error && <div className="text-red-600 mb-2">{error}</div>}
                {!selectedFile && <div className="text-gray-500">Selecciona un archivo para ver su contenido</div>}

                {selectedFile && fileContent !== null && (
                  <>
                    <div className="mb-2 text-xs text-gray-500">
                      <div className="truncate max-w-full">{selectedFile}</div>
                      {savedMessage && <div className="text-sm text-green-600">{savedMessage}</div>}
                    </div>

                    <div className="resizer" onMouseDown={startResize} onTouchStart={startResize} role="separator" aria-label="Redimensionar visor" title="Arrastrar para redimensionar" />

                    <div className="flex-1 min-h-0">
                      {isSpreadsheet(selectedFile) ? (
                        <div id="xlsx-editor" className="w-full h-full bg-white p-2 rounded flex flex-col">
                          <div className="mb-2 flex items-center gap-2">
                            <label className="text-xs text-gray-500">Hoja:</label>
                            <select value={activeSheetIndex} onChange={(e) => setActiveSheetIndex(Number(e.target.value))} className="text-sm p-1 border rounded bg-white">
                              {sheetNames && sheetNames.map((n, i) => <option key={n} value={i}>{n}</option>)}
                            </select>
                            <div className="ml-2 flex items-center gap-2">
                              <button onClick={addRow} title="Agregar fila" aria-label="Agregar fila" className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"><FiPlus className="w-4 h-4" /></button>
                              <button onClick={addColumn} title="Agregar columna" aria-label="Agregar columna" className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"><span className="text-sm">↔</span></button>
                              <button onClick={addSheet} title="Agregar hoja" aria-label="Agregar hoja" className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"><span className="text-sm">📄</span></button>
                              <button onClick={renameSheet} title="Renombrar hoja" aria-label="Renombrar hoja" className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"><FiEdit className="w-4 h-4" /></button>
                            </div>

                            <div className="ml-2 relative" ref={paletteRef}>
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => setPaletteOpenFor(prev => prev === 'bg' ? null : 'bg')}
                                  title="Fondo"
                                  aria-label="Fondo"
                                  className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                                >
                                  <span className="w-4 h-4 inline-block border" style={{ backgroundColor: spreadsheetStyles[`${selectedCell?.r || 0}:${selectedCell?.c || 0}`]?.bg || cellBg }} />
                                </button>
                                <button
                                  onClick={() => setPaletteOpenFor(prev => prev === 'color' ? null : 'color')}
                                  title="Color de texto"
                                  aria-label="Color de texto"
                                  className="p-2 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center"
                                >
                                  <span className="w-4 h-4 inline-flex items-center justify-center border" style={{ color: spreadsheetStyles[`${selectedCell?.r || 0}:${selectedCell?.c || 0}`]?.color || cellColor, fontWeight: 700 }}>A</span>
                                </button>
                              </div>

                              {paletteOpenFor && (
                                <div className="absolute z-50 mt-2 p-2 bg-white border rounded shadow w-64" style={{ right: 0 }}>
                                  <div className="grid grid-cols-8 gap-1">
                                    {themeColors.map(c => (
                                      <button
                                        key={`t-${c}`}
                                        onClick={() => { if (paletteOpenFor === 'bg') { applyBg(c) } else { applyColor(c) } setPaletteOpenFor(null) }}
                                        className="w-6 h-6 rounded-sm border"
                                        style={{ backgroundColor: c }}
                                      />
                                    ))}
                                  </div>
                                  <div className="mt-2 grid grid-cols-8 gap-1">
                                    {standardColors.map(c => (
                                      <button
                                        key={`s-${c}`}
                                        onClick={() => { if (paletteOpenFor === 'bg') { applyBg(c) } else { applyColor(c) } setPaletteOpenFor(null) }}
                                        className="w-6 h-6 rounded-sm border"
                                        style={{ backgroundColor: c }}
                                      />
                                    ))}
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      onClick={() => { if (!selectedCell) return; clearStyle(); setPaletteOpenFor(null) }}
                                      className="text-xs px-2 py-1 bg-gray-100 rounded"
                                    >Sin relleno</button>
                                    <button
                                      onClick={() => { moreColorInputRef.current?.click() }}
                                      className="text-xs px-2 py-1 bg-gray-100 rounded"
                                    >Más colores...</button>
                                  </div>
                                  <input ref={moreColorInputRef} type="color" style={{ display: 'none' }} onChange={(e) => {
                                    const v = e.target.value
                                    if (paletteOpenFor === 'bg') applyBg(v)
                                    else applyColor(v)
                                    setPaletteOpenFor(null)
                                  }} />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="overflow-auto flex-1 min-h-0">
                            {spreadsheetRows ? (
                              <div className="w-full h-full overflow-auto">
                                <table className="min-w-full border-collapse table-fixed text-sm"><tbody>
                                  {spreadsheetRows.map((row, rIdx) => (
                                    <tr key={rIdx} className="align-top">
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} className={`border border-gray-200 p-1 align-top whitespace-pre-wrap ${selectedCell && selectedCell.r === rIdx && selectedCell.c === cIdx ? 'ring-2 ring-blue-400' : ''}`} contentEditable suppressContentEditableWarning onClick={() => { setSelectedCell({ r: rIdx, c: cIdx }); const key = `${rIdx}:${cIdx}`; const st = spreadsheetStyles[key]; setCellBg(st?.bg || '#ffffff'); setCellColor(st?.color || '#000000') }} onBlur={(e) => { const text = (e.currentTarget.textContent ?? ''); setSpreadsheetRows(prev => { if (!prev) return prev; const copy = prev.map(r => r.slice()); while (copy.length <= rIdx) copy.push([]); while (copy[rIdx].length <= cIdx) copy[rIdx].push(''); copy[rIdx][cIdx] = text; return copy }) }} style={{ backgroundColor: spreadsheetStyles[`${rIdx}:${cIdx}`]?.bg, color: spreadsheetStyles[`${rIdx}:${cIdx}`]?.color }}>{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody></table>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 p-2">Sin contenido</div>
                            )}
                          </div>
                        </div>
                      ) : isMarkdown(selectedFile) && preview ? (
                        <div id="md-preview" className="prose max-w-full h-full overflow-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent ?? '') }} />
                      ) : (
                        <textarea value={fileContent ?? ''} onChange={(e) => setFileContent(e.target.value)} className="w-full h-full font-mono text-sm p-2 border rounded bg-white resize-none overflow-auto" />
                      )}
                    </div>
                  </>
                )}
              </div>

              {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded shadow-lg p-4 w-full max-w-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-medium">Enviar por email</h3>
                      <button className="p-1 rounded hover:bg-gray-100" onClick={() => setShowEmailModal(false)}>Cerrar</button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <label className="text-xs text-gray-600">Para (separar con ;)</label>
                      <input className="border p-2 rounded" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="correo@ejemplo.com" />
                      <label className="text-xs text-gray-600">CC</label>
                      <input className="border p-2 rounded" value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="cc@ejemplo.com" />
                      <label className="text-xs text-gray-600">Asunto</label>
                      <input className="border p-2 rounded" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                      <label className="text-xs text-gray-600">Mensaje</label>
                      <textarea className="border p-2 rounded h-32" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />

                      <div className="text-sm text-gray-700">Adjunto: {selectedFile}</div>

                      <div className="flex items-center gap-2 mt-3">
                        <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => sendEmail()} disabled={sendingEmail}>{sendingEmail ? 'Enviando…' : 'Enviar'}</button>
                        <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => { handleOutlookClick() }}>{graphLinked ? 'Seleccionar desde Outlook' : 'Conectar Outlook'}</button>
                        <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => setShowEmailModal(false)}>Cancelar</button>
                      </div>

                      {emailError && <div className="text-sm text-red-600 mt-2">{emailError}</div>}
                      {emailSentMessage && <div className="text-sm text-green-600 mt-2">{emailSentMessage}</div>}
                    </div>
                  </div>
                </div>
              )}

              {contactsModalOpen && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded shadow-lg p-4 w-full max-w-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-medium">Contactos de Outlook</h3>
                      <button className="p-1 rounded hover:bg-gray-100" onClick={() => setContactsModalOpen(false)}>Cerrar</button>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      {loadingContacts ? (
                        <div className="text-sm text-gray-600 p-2">Cargando contactos…</div>
                      ) : contacts.length === 0 ? (
                        <div className="text-sm text-gray-600 p-2">No se encontraron contactos.</div>
                      ) : (
                        <div className="space-y-2">
                          {contacts.map(c => (
                            <label key={c.id} className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded">
                              <input type="checkbox" className="mt-1" value={c.emails[0] || ''} onChange={(e) => toggleSelectedEmail(e.target.value, e.target.checked)} />
                              <div>
                                <div className="font-medium">{c.name || '(sin nombre)'}</div>
                                <div className="text-xs text-gray-500">{(c.emails || []).join(', ')}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 justify-end">
                      <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => addSelectedContacts()}>Agregar seleccionados</button>
                      <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => setContactsModalOpen(false)}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
