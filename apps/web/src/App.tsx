import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Cargando } from './components/ui';
import { useSesion } from './lib/sesion';
import Ingreso from './pages/Ingreso';
import Tablero from './pages/Tablero';
import Bandeja from './pages/Bandeja';
import Periodos from './pages/Periodos';
import PeriodoDetalle from './pages/PeriodoDetalle';
import EjecucionDetalle from './pages/EjecucionDetalle';
import Controles from './pages/Controles';
import Pendientes from './pages/Pendientes';
import Deficiencias from './pages/Deficiencias';
import Usuarios from './pages/Usuarios';
import Auditoria from './pages/Auditoria';

export default function App() {
  const { usuario, cargando } = useSesion();

  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Ingreso />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Tablero />} />
          <Route path="/bandeja" element={<Bandeja />} />
          <Route path="/periodos" element={<Periodos />} />
          <Route path="/periodos/:id" element={<PeriodoDetalle />} />
          <Route path="/ejecuciones/:id" element={<EjecucionDetalle />} />
          <Route path="/controles" element={<Controles />} />
          <Route path="/pendientes" element={<Pendientes />} />
          <Route path="/deficiencias" element={<Deficiencias />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
