import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ETIQUETA_ROL } from '../lib/formato';
import { usePuede, useSesion } from '../lib/sesion';

interface Bandeja { porHacer: unknown[]; porRevisar: unknown[]; porAprobar: unknown[] }

export default function Layout() {
  const { usuario, salir } = useSesion();
  const puede = usePuede();

  const { data: bandeja } = useQuery({
    queryKey: ['bandeja'],
    queryFn: () => api<Bandeja>('/ejecuciones/bandeja/mia'),
    refetchInterval: 120_000,
  });

  const pendientes =
    (bandeja?.porHacer.length ?? 0) + (bandeja?.porRevisar.length ?? 0) + (bandeja?.porAprobar.length ?? 0);

  const enlace = ({ isActive }: { isActive: boolean }) => `lateral__link${isActive ? ' activo' : ''}`;

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral__marca">
          <strong>Controles SOX</strong>
          <span>Cálidda · Cálidda Energía</span>
        </div>

        <nav className="lateral__nav">
          <div className="lateral__grupo">Operación</div>
          <NavLink to="/" end className={enlace}>Tablero</NavLink>
          <NavLink to="/bandeja" className={enlace}>
            Mi bandeja
            {pendientes > 0 && <span className="conteo">{pendientes}</span>}
          </NavLink>
          <NavLink to="/periodos" className={enlace}>Periodos</NavLink>
          <NavLink to="/pendientes" className={enlace}>Pendientes arrastrados</NavLink>

          <div className="lateral__grupo">Gobierno</div>
          <NavLink to="/controles" className={enlace}>Matriz de controles</NavLink>
          <NavLink to="/deficiencias" className={enlace}>Deficiencias</NavLink>
          {puede.verAuditoria && <NavLink to="/auditoria" className={enlace}>Auditoría</NavLink>}
          {puede.gestionarUsuarios && <NavLink to="/usuarios" className={enlace}>Usuarios</NavLink>}
        </nav>

        <div className="lateral__pie">
          <strong>{usuario?.nombres} {usuario?.apellidos}</strong>
          <div className="mudo" style={{ fontSize: 11.5 }}>{usuario && ETIQUETA_ROL[usuario.rol]}</div>
          <button className="btn btn--sm" style={{ marginTop: 8, width: '100%' }} onClick={() => void salir()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
