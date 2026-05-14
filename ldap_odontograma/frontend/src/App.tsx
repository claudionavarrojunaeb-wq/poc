import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login      from "./Login.tsx";
import ResetPassword from "./ResetPassword.tsx";
import Dashboard  from "./dashboard.tsx";
import SendEmail  from "./SendEmail.tsx";
import VerLog     from "./VerLog.tsx";
import VerProyecto from "./verproyecto.tsx";
import ProtectedRoute from "./ProtectedRoute.tsx";
import CargaCsv from "./cargacsv.tsx";

import EstadisticasLog from "./components/EstadisticasLog";
import Odontograma from "./components/Odontograma";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<Login />} />
        <Route path="/login"      element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/send-email" element={<ProtectedRoute><SendEmail /></ProtectedRoute>} />
        <Route path="/logs"       element={<ProtectedRoute><VerLog /></ProtectedRoute>} />
        <Route path="/verproyecto" element={<ProtectedRoute><VerProyecto /></ProtectedRoute>} />
        <Route path="/cargacsv" element={<ProtectedRoute><CargaCsv /></ProtectedRoute>} />
        <Route path="/estadisticas-log" element={<ProtectedRoute><EstadisticasLog /></ProtectedRoute>} />
        <Route path="/odontograma" element={<ProtectedRoute><Odontograma /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

