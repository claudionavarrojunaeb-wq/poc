# Documentación detallada de frontend/src/dashboard.tsx

## Código fuente

```tsx
/**
 * frontend/src/dashboard.tsx
 * --------------------------
 * Página de ejemplo (Dashboard) para la aplicación.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function formatDate(ts: number | string): string {
	const d = new Date(ts)
	return d.toLocaleString()
}

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

	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
			<polyline fill="none" stroke="#3b82f6" strokeWidth={2} points={points} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export default function Dashboard() {
	type Metrics = { users: number; activeSessions: number; errorsToday: number; activitySeries: number[] }
	type Activity = { id: number; ts: number; text: string; type: 'login' | 'email' | 'error' | 'other' }

	const [metrics, setMetrics] = useState<Metrics>({
		users: 1245,
		activeSessions: 87,
		errorsToday: 2,
		activitySeries: [5, 9, 7, 12, 10, 8, 11, 14],
	})

	const [activities, _setActivities] = useState<Activity[]>([
		{ id: 1, ts: Date.now() - 1000 * 60 * 5, text: 'Usuario claudio.navarro inició sesión', type: 'login' },
		{ id: 2, ts: Date.now() - 1000 * 60 * 60, text: 'Envió correo desde /api/send-email', type: 'email' },
		{ id: 3, ts: Date.now() - 1000 * 60 * 60 * 5, text: 'Error: conexión LDAP fallida (fallback usado)', type: 'error' },
	])

	useEffect(() => {
		const id = setInterval(() => {
			setMetrics((m) => ({
				...m,
				activeSessions: Math.max(0, m.activeSessions + (Math.random() > 0.5 ? 1 : -1)),
				activitySeries: [...m.activitySeries.slice(1), Math.round(5 + Math.random() * 15)],
			}))
		}, 20000)
		return () => clearInterval(id)
	}, [])

	return (
		<main className="min-h-screen bg-gray-50 p-6">
			<div className="max-w-6xl mx-auto">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-2xl font-semibold text-gray-800">Dashboard de ejemplo</h1>
						<p className="text-sm text-gray-500">Resumen rápido de métricas y actividad reciente.</p>
					</div>
					<div className="flex gap-2">
						<Link to="/logs" className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded text-sm text-blue-600 hover:bg-blue-50">Ver logs</Link>
						<button className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Acción</button>
					</div>
				</div>

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

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<section className="lg:col-span-2 p-4 bg-white rounded shadow-sm border min-h-45">
						<h2 className="text-sm font-medium text-gray-700 mb-2">Actividad (últimas 8 mediciones)</h2>
						<div className="flex items-center gap-4">
							<div className="flex-1">
								<Sparkline data={metrics.activitySeries} width={600} height={120} />
							</div>
							<div className="w-40 text-sm text-gray-500">
								<div className="text-xs">Última actualización:</div>
								<div className="font-mono text-gray-700">{formatDate(Date.now())}</div>
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
```

## Explicación detallada

- Propósito: componente autónomo de ejemplo que sirve como plantilla para mostrar métricas, tendencias y actividad reciente.
- Estructura:
	- `formatDate(ts)`: helper para formatear timestamps.
	- `Sparkline(...)`: componente SVG ligero que dibuja una línea a partir de `data: number[]`.
	- `Dashboard()`: componente principal que mantiene dos estados locales:
		- `metrics: Metrics` con `users`, `activeSessions`, `errorsToday` y `activitySeries`.
		- `activities: Activity[]` con eventos mock que muestran tipo y timestamp.

### Notas de implementación y extensiones posibles
- Datos reales: sustituir los mocks por llamadas a la API (`fetch('/api/...')`) en `useEffect`.
- Gráficos: para visualizaciones más completas, integrar librerías como `recharts` o `chart.js`.
- Accesibilidad: los elementos interactivos (botones, enlaces) usan etiquetas y colores; añadir `aria-` cuando se incorporen interacciones complejas.

### Trazabilidad
- Este archivo incluye comentarios en el código para cumplir la regla de documentación del repositorio.

---

Nota: este documento puede ampliarse con ejemplos de llamadas a la API y pruebas unitarias según se requiera.
