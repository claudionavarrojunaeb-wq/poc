// frontend/src/components/EstadisticasLog.tsx
// Panel de estadísticas y gráficos para la tabla log.
// Usa únicamente Tailwind CSS (ya instalado en el proyecto) y react-chartjs-2.

import React, { useEffect, useState } from "react";
import {
  Bar,
  Pie,
  Line,
} from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from "chart.js";

// Registro global de los módulos de Chart.js que se van a usar
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Colores para el gráfico de torta
const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

// Tipo de un registro de log tal como lo devuelve el backend
interface LogRow {
  logid:          number | string;
  logusuariosid:  string | null;
  logkey:         number | null;
  logfecha:       string | null;
  loghora:        string | null;
  logobjeto:      string | null;
  logdescripcion: string | null;
  logip:          string | null;
}

// Tarjeta de estadística reutilizable (reemplaza antd <Statistic>)
const StatCard: React.FC<{ title: string; value: number | string }> = ({ title, value }) => (
  <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1">
    {/* Título de la métrica */}
    <span className="text-sm text-gray-500 font-medium">{title}</span>
    {/* Valor destacado */}
    <span className="text-3xl font-bold text-blue-600">{value}</span>
  </div>
);

// Contenedor de tarjeta de gráfico (reemplaza antd <Card>)
const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-3">
    <span className="text-base font-semibold text-gray-700">{title}</span>
    {children}
  </div>
);

// Componente principal del panel
const EstadisticasLog: React.FC = () => {
  // Estado principal: registros cargados desde la API
  const [data, setData] = useState<LogRow[]>([]);
  // Estado de carga para mostrar spinner mientras se obtienen datos
  const [loading, setLoading] = useState(true);
  // Estado de error en caso de fallo de red
  const [error, setError] = useState<string | null>(null);

  // Al montar el componente, se solicitan los datos al backend
  useEffect(() => {
    fetch("/api/log/stats", { credentials: "include" })
      .then((res) => {
        // Si el servidor devuelve error HTTP, lanzar excepción legible
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: LogRow[]) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  // ─── Cálculo de agregados ────────────────────────────────────────────────────

  // Total de registros
  const totalRegistros = data.length;

  // Conteo por objeto (logobjeto): { "LOGIN": 5, "LOGOUT": 3, ... }
  const porObjeto = data.reduce<Record<string, number>>((acc, row) => {
    const k = row.logobjeto ?? "(sin objeto)";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // Conteo por IP
  const porIP = data.reduce<Record<string, number>>((acc, row) => {
    const k = row.logip ?? "(sin IP)";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // Conteo por usuario
  const porUsuario = data.reduce<Record<string, number>>((acc, row) => {
    const k = row.logusuariosid ?? "(sin usuario)";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // Top-5 usuarios más activos (para tabla resumida)
  const topUsuarios = Object.entries(porUsuario)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Agrupar eventos por fecha (solo YYYY-MM-DD) para el gráfico de línea
  const porFecha = data.reduce<Record<string, number>>((acc, row) => {
    const fecha = row.logfecha ? row.logfecha.slice(0, 10) : "(sin fecha)";
    acc[fecha] = (acc[fecha] || 0) + 1;
    return acc;
  }, {});
  // Ordenar fechas ascendentemente para el eje X del gráfico de línea
  const fechasOrdenadas = Object.keys(porFecha).sort();

  // ─── Configuración de datos de gráficos ─────────────────────────────────────

  // Gráfico de barras: eventos por objeto
  const barData = {
    labels: Object.keys(porObjeto),
    datasets: [{
      label: "Eventos por objeto",
      data: Object.values(porObjeto),
      backgroundColor: "#3b82f6",
      borderRadius: 4,
    }],
  };

  // Gráfico de torta: distribución por IP
  const pieData = {
    labels: Object.keys(porIP),
    datasets: [{
      data: Object.values(porIP),
      backgroundColor: PIE_COLORS,
    }],
  };

  // Gráfico de línea: evolución diaria de eventos
  const lineData = {
    labels: fechasOrdenadas,
    datasets: [{
      label: "Eventos por día",
      data: fechasOrdenadas.map((f) => porFecha[f]),
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59,130,246,0.15)",
      fill: true,
      tension: 0.35,
      pointRadius: 4,
    }],
  };

  // Gráfico de barras horizontal: top usuarios
  const barUsuariosData = {
    labels: Object.keys(porUsuario),
    datasets: [{
      label: "Acciones por usuario",
      data: Object.values(porUsuario),
      backgroundColor: "#10b981",
      borderRadius: 4,
    }],
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Spinner de carga mientras se obtienen datos
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-blue-500 text-lg font-semibold">
        Cargando estadísticas...
      </div>
    );
  }

  // Mensaje de error si la carga falló
  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-base">
        Error al cargar datos: {error}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Título del panel */}
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Panel de Estadísticas — Tabla Log</h1>

      {/* Fila 1: tarjetas de resumen numérico */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total de registros" value={totalRegistros} />
        <StatCard title="Usuarios únicos"    value={Object.keys(porUsuario).length} />
        <StatCard title="IPs únicas"         value={Object.keys(porIP).length} />
      </div>

      {/* Fila 2: gráfico de barras (por objeto) y torta (por IP) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Eventos por objeto">
          <Bar
            data={barData}
            options={{ responsive: true, plugins: { legend: { display: false } } }}
          />
        </ChartCard>
        <ChartCard title="Distribución por IP">
          <Pie
            data={pieData}
            options={{ responsive: true }}
          />
        </ChartCard>
      </div>

      {/* Fila 3: gráfico de línea (evolución diaria) */}
      <div className="mb-6">
        <ChartCard title="Evolución diaria de eventos">
          <Line
            data={lineData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } },
            }}
          />
        </ChartCard>
      </div>

      {/* Fila 4: gráfico de barras de usuarios + tabla top 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Acciones por usuario">
          <Bar
            data={barUsuariosData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              indexAxis: "y" as const,
            }}
          />
        </ChartCard>

        {/* Tabla resumen: top 5 usuarios más activos */}
        <ChartCard title="Top 5 usuarios más activos">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Usuario</th>
                <th className="pb-2 text-right">Eventos</th>
              </tr>
            </thead>
            <tbody>
              {topUsuarios.map(([usuario, count]) => (
                <tr key={usuario} className="border-b last:border-0">
                  <td className="py-1 font-mono text-gray-700">{usuario}</td>
                  <td className="py-1 text-right font-bold text-blue-600">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  );
};

export default EstadisticasLog;

/*
Documentación didáctica:
- StatCard: tarjeta de resumen reutilizable, reemplaza antd <Statistic> con Tailwind puro.
- ChartCard: contenedor de gráfico con título, reemplaza antd <Card>.
- El useEffect dispara el fetch a /api/log/stats al montar el componente.
- Los agregados (porObjeto, porIP, porUsuario, porFecha) se calculan con reduce sobre el array de datos.
- Los datasets de Chart.js se arman a partir de esos agregados.
- Se muestran 4 gráficos: barras por objeto, torta por IP, línea temporal y barras horizontales por usuario.
- La tabla top-5 muestra los usuarios con más acciones de forma directa.
- Si el fetch falla, se muestra un mensaje de error en lugar del panel.
*/
