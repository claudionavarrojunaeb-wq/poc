/**
 * frontend/src/dashboard.tsx
 * --------------------------
 * Página de ejemplo (Dashboard) para la aplicación.
 *
 * Propósito:
 * - Proveer una vista inicial con métricas de ejemplo, un gráfico mínimo
 *   y una lista de actividades recientes para servir como plantilla.
 * - Servir de destino después del login y punto de lanzamiento para
 *   enlaces rápidos (por ejemplo al visor de logs `frontend/src/VerLog.tsx`).
 *
 * Convenciones y documentación interna:
 * - Este archivo contiene comentarios detallados para cumplir la regla
 *   del proyecto "documentalo todo". Explican la intención, los datos
 *   mock y las decisiones simples de implementación.
 */

import { useEffect, useState } from 'react'
import { getCsrfToken } from './csrf'
import { Link, useNavigate } from 'react-router-dom'

// -----------------------------
// Helpers y componentes pequeños
// -----------------------------

/**
 * formatDate
 * Formatea un timestamp (ms) a una cadena legible para mostrar en la UI.
 * - Entrada: número (timestamp ms) o ISO string aceptable por Date.
 * - Salida: cadena con fecha y hora local (ej. "06/05/2026 18:00:00").
 */
function formatDate(ts: number | string): string {
	const d = new Date(ts)
	return d.toLocaleString()
}

/**
 * Sparkline
 * Componente SVG muy sencillo que dibuja una línea a partir de una serie
 * de valores numéricos. No pretende sustituir a librerías de gráficos,
 * solo ofrecer una representación visual de tendencia sin dependencias.
 *
 * Props:
 * - data: number[] — serie de valores
 * - width, height: dimensiones del SVG
 */
function Sparkline({ data = [], width = 120, height = 32 }: { data?: number[]; width?: number; height?: number }) {
	if (!data || data.length === 0) return null
	const max = Math.max(...data)
	const min = Math.min(...data)
	const len = data.length
	const step = width / (len - 1 || 1)
	const points = data
		.map((v, i) => {
			const x = i * step
			const y = height - ((v - min) / (max - min || 1)) * height
			return `${x},${y}`
		})
		.join(' ')

	// SVG simple con polyline para la línea
	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="inline-block align-middle">
			<polyline
				fill="none"
				stroke="#3b82f6"
				strokeWidth="2"
				points={points}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

// -----------------------------
// Componente principal: Dashboard
// -----------------------------

/**
 * Dashboard
 * Componente principal exportado por este módulo. Implementa una UI estática
 * / mock con los elementos siguientes:
 * - Cabecera con título y acciones rápidas
 * - Tres métricas resumidas en tarjetas
 * - Un "gráfico" sparkline que representa la serie de actividad
 * - Un listado de actividades recientes con estados (login, email, error)
 *
 * Notas de diseño:
 * - Los datos son mock (estáticos) para que el componente sea autónomo.
 * - En producción, sustituir `fetch` y llamadas a API en lugar de los mocks.
 */
export default function Dashboard() {
	// Tipos locales para las estructuras de estado
	type Metrics = { users: number; activeSessions: number; errorsToday: number; activitySeries: number[] }
	type Activity = { id: number; ts: number; text: string; type: 'login' | 'email' | 'error' | 'other' }

	// Estado de métricas: objeto simple que agrupa números y la serie
	// - `users`: total de usuarios registrados
	// - `activeSessions`: número aproximado de sesiones activas ahora
	// - `errorsToday`: contador de errores detectados hoy
	// - `activitySeries`: array con últimas N observaciones para sparkline
	const [metrics, setMetrics] = useState<Metrics>({
		users: 1245,
		activeSessions: 87,
		errorsToday: 2,
		activitySeries: [5, 9, 7, 12, 10, 8, 11, 14],
	})

	const navigate = useNavigate()

	// Timestamp de la "última actualización" mostrado en la UI.
	// Se inicializa perezosamente y se actualiza junto con las métricas
	// para evitar llamar a `Date.now()` directamente durante el render.
	const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now())

	// Actividades recientes: lista mock con `id`, `ts` y `text`.
	// Tipos conocidos: 'login', 'email', 'error' → usados para color
	// Estado de actividades; no necesitamos el setter en este componente
	const [activities] = useState<Activity[]>(() => [
		{ id: 1, ts: Date.now() - 1000 * 60 * 5, text: 'Usuario claudio.navarro inició sesión', type: 'login' },
		{ id: 2, ts: Date.now() - 1000 * 60 * 60, text: 'Envió correo desde /api/send-email', type: 'email' },
		{ id: 3, ts: Date.now() - 1000 * 60 * 60 * 5, text: 'Error: conexión LDAP fallida (fallback usado)', type: 'error' },
	])

	// Efecto de ejemplo: simula cambios periódicos en la métrica
	useEffect(() => {
		const id = setInterval(() => {
			setMetrics((m) => ({
				...m,
				activeSessions: Math.max(0, m.activeSessions + (Math.random() > 0.5 ? 1 : -1)),
				activitySeries: [...m.activitySeries.slice(1), Math.round(5 + Math.random() * 15)],
			}))
			// Registrar el timestamp de la actualización para mostrar en la UI
			setLastUpdated(Date.now())
		}, 20000)
		return () => clearInterval(id)
	}, [])

	// -----------------------------
	// Render
	// -----------------------------
	return (
		<main className="min-h-screen bg-gray-50 p-6">
			<div className="max-w-6xl mx-auto">

				{/* Cabecera: título y acciones */}
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-2xl font-semibold text-gray-800">Dashboard de ejemplo</h1>
						<p className="text-sm text-gray-500">Resumen rápido de métricas y actividad reciente.</p>
					</div>

					<div className="flex gap-2">
						<Link to="/logs" className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded text-sm text-blue-600 hover:bg-blue-50">
							Ver logs
						</Link>
						<Link to="/verproyecto" className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded text-sm text-blue-600 hover:bg-blue-50">
							Ver proyecto
						</Link>
						<button onClick={async () => {
							try {
								const headers: Record<string,string> = {}
								const csrf = getCsrfToken()
								if (csrf) headers['X-CSRF-Token'] = csrf
								await fetch('/api/logout', { method: 'POST', credentials: 'include', headers })
							} catch {
								/* ignore */
							}
							try { if (window && window.localStorage) window.localStorage.removeItem('ssmm_csrf') } catch { /* ignore */ }
							navigate('/login')
						}} className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-700 hover:bg-gray-50">Cerrar sesión</button>
						<button className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Acción</button>
					</div>
				</div>

				{/* Tarjetas de métricas */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
					<div className="p-4 bg-white rounded shadow-sm border">
						<div className="text-xs text-gray-500">Usuarios</div>
						<div className="flex items-end justify-between">
							<div className="text-2xl font-bold text-gray-800">{metrics.users.toLocaleString()}</div>
							<div className="text-xs text-gray-400">Totales</div>
						</div>
					</div>

					<div className="p-4 bg-white rounded shadow-sm border">
						<div className="text-xs text-gray-500">Sesiones activas</div>
						<div className="flex items-end justify-between">
							<div className="text-2xl font-bold text-gray-800">{metrics.activeSessions}</div>
							<div className="text-xs text-gray-400">Ahora</div>
						</div>
						<div className="mt-2"><Sparkline data={metrics.activitySeries} /></div>
					</div>

					<div className="p-4 bg-white rounded shadow-sm border">
						<div className="text-xs text-gray-500">Errores hoy</div>
						<div className="flex items-end justify-between">
							<div className="text-2xl font-bold text-red-600">{metrics.errorsToday}</div>
							<div className="text-xs text-gray-400">Revisar</div>
						</div>
						<div className="mt-2"><Link to="/logs" className="text-xs text-red-600 hover:underline">Ir a visor de errores</Link></div>
					</div>
				</div>

				{/* Zona principal: gráfico y actividades recientes */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<section className="lg:col-span-2 p-4 bg-white rounded shadow-sm border min-h-45">
						<h2 className="text-sm font-medium text-gray-700 mb-2">Actividad (últimas 8 mediciones)</h2>
						<div className="flex items-center gap-4">
							<div className="flex-1">
								<Sparkline data={metrics.activitySeries} width={600} height={120} />
							</div>
							<div className="w-40 text-sm text-gray-500">
								<div className="text-xs">Última actualización:</div>
								<div className="font-mono text-gray-700">{formatDate(lastUpdated)}</div>
							</div>
						</div>
					</section>

					<aside className="p-4 bg-white rounded shadow-sm border">
						<h3 className="text-sm font-medium text-gray-700 mb-3">Actividad reciente</h3>
						<ul className="space-y-3 text-sm">
							{activities.map((a) => (
								<li key={a.id} className="flex items-start gap-3">
									<span className={`inline-block w-2 h-2 mt-1 rounded-full ${a.type === 'error' ? 'bg-red-500' : a.type === 'login' ? 'bg-green-500' : 'bg-blue-500'}`} />
									<div>
										<div className="text-gray-800">{a.text}</div>
										<div className="text-xs text-gray-400">{formatDate(a.ts)}</div>
									</div>
								</li>
							))}
						</ul>
					</aside>
				</div>
			</div>
		</main>
	)
}

