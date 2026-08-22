import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fechaHora, nombrePersona } from '../lib/formato';
import { Cargando, Insignia, Tarjeta, Vacio } from '../components/ui';
import type { Pagina, PersonaBreve } from '../lib/tipos';

interface Registro {
  id: string; accion: string; entidad: string; entidadId: string | null;
  actorEmail: string | null; ip: string | null; creadoEn: string;
  usuario: PersonaBreve | null;
  antes: unknown; despues: unknown;
}
interface Correo {
  id: string; tipo: string; destinatario: string; asunto: string;
  estado: string; error: string | null; enviadoEn: string | null; creadoEn: string;
}

/** Pista de auditoria y bitacora de correos. Solo lectura por diseno. */
export default function Auditoria() {
  const [pestana, setPestana] = useState<'acciones' | 'correos'>('acciones');
  const [filtro, setFiltro] = useState('');

  const { data: registros, isLoading } = useQuery({
    queryKey: ['auditoria', filtro],
    queryFn: () => api<Pagina<Registro>>(`/auditoria?tamano=150${filtro ? `&accion=${filtro}` : ''}`),
    enabled: pestana === 'acciones',
  });
  const { data: correos } = useQuery({
    queryKey: ['correos'],
    queryFn: () => api<Correo[]>('/auditoria/recordatorios?tamano=150'),
    enabled: pestana === 'correos',
  });

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Auditoría</h1>
          <p>Registro inmutable de acciones y de las notificaciones enviadas. No existe forma de editarlo ni borrarlo.</p>
        </div>
        <div className="fila">
          <button className={`btn ${pestana === 'acciones' ? 'btn--primario' : ''}`} onClick={() => setPestana('acciones')}>Acciones</button>
          <button className={`btn ${pestana === 'correos' ? 'btn--primario' : ''}`} onClick={() => setPestana('correos')}>Correos enviados</button>
        </div>
      </div>

      {pestana === 'acciones' ? (
        <Tarjeta
          acciones={
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 220 }}>
              <option value="">Todas las acciones</option>
              <option value="auth">Autenticación</option>
              <option value="periodo">Periodos</option>
              <option value="ejecucion">Ejecución de controles</option>
              <option value="evidencia">Evidencias</option>
              <option value="control">Matriz de controles</option>
              <option value="usuario">Usuarios</option>
              <option value="deficiencia">Deficiencias</option>
            </select>
          }
        >
          {isLoading ? <Cargando /> : !registros?.datos.length ? <Vacio texto="Sin registros." /> : (
            <div className="tabla-envoltura">
              <table>
                <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Usuario</th><th>IP</th></tr></thead>
                <tbody>
                  {registros.datos.map((r) => (
                    <tr key={r.id}>
                      <td className="mudo" style={{ whiteSpace: 'nowrap' }}>{fechaHora(r.creadoEn)}</td>
                      <td><strong className="mono">{r.accion}</strong></td>
                      <td>{r.entidad}<div className="mono mudo">{r.entidadId?.slice(0, 12) ?? '—'}</div></td>
                      <td>{r.usuario ? nombrePersona(r.usuario) : (r.actorEmail ?? 'sistema')}</td>
                      <td className="mono mudo">{r.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      ) : (
        <Tarjeta subtitulo="Evidencia de que cada responsable fue notificado, con su estado de entrega.">
          {!correos?.length ? <Vacio texto="Sin correos registrados." /> : (
            <div className="tabla-envoltura">
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Destinatario</th><th>Asunto</th><th>Estado</th></tr></thead>
                <tbody>
                  {correos.map((c) => (
                    <tr key={c.id}>
                      <td className="mudo" style={{ whiteSpace: 'nowrap' }}>{fechaHora(c.enviadoEn ?? c.creadoEn)}</td>
                      <td className="mono">{c.tipo}</td>
                      <td>{c.destinatario}</td>
                      <td style={{ maxWidth: 420 }}>{c.asunto}</td>
                      <td>
                        {c.estado === 'ENVIADO'
                          ? <Insignia tono="ok"><span aria-hidden="true">✓</span>Enviado</Insignia>
                          : c.estado === 'ERROR'
                            ? <Insignia tono="critico"><span aria-hidden="true">⚠</span>Error</Insignia>
                            : <Insignia tono="neutro"><span aria-hidden="true">○</span>Pendiente</Insignia>}
                        {c.error && <div className="mudo" style={{ fontSize: 11 }}>{c.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      )}
    </>
  );
}
