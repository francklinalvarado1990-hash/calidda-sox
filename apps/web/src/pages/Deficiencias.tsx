import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ETIQUETA_SEVERIDAD, fecha, nombrePersona, TONO_SEVERIDAD } from '../lib/formato';
import { Aviso, Cargando, Insignia, Tarjeta, Vacio } from '../components/ui';
import type { PersonaBreve } from '../lib/tipos';

interface Deficiencia {
  id: string; codigo: string; severidad: string; estado: string;
  descripcion: string; planAccion: string | null;
  fechaCompromiso: string | null; fechaCierre: string | null;
  responsable: PersonaBreve | null;
  ejecucion: {
    id: string; codigoControl: string; nombreControl: string;
    periodo: { anio: number; mes: number; empresa: { codigo: string; nombre: string } };
  };
}

export default function Deficiencias() {
  const [estado, setEstado] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['deficiencias', estado],
    queryFn: () => api<Deficiencia[]>(`/deficiencias${estado ? `?estado=${estado}` : ''}`),
  });

  const vencidas = (data ?? []).filter(
    (d) => d.fechaCompromiso && new Date(d.fechaCompromiso) < new Date() && !['CERRADA', 'ACEPTADA'].includes(d.estado),
  );

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Deficiencias y planes de acción</h1>
          <p>Hallazgos identificados en la ejecución de controles, con su remediación y responsable.</p>
        </div>
        <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
          <label htmlFor="est">Estado</label>
          <select id="est" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todas</option>
            <option value="ABIERTA">Abierta</option>
            <option value="EN_REMEDIACION">En remediación</option>
            <option value="EN_VALIDACION">En validación</option>
            <option value="CERRADA">Cerrada</option>
            <option value="ACEPTADA">Aceptada</option>
          </select>
        </div>
      </div>

      {vencidas.length > 0 && (
        <Aviso tono="critico">
          <strong>{vencidas.length} deficiencia(s)</strong> superaron su fecha compromiso sin cerrarse.
        </Aviso>
      )}

      <Tarjeta>
        {isLoading ? <Cargando /> : !data?.length ? (
          <Vacio texto="No hay deficiencias registradas con ese filtro." />
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Severidad</th><th>Control</th><th>Descripción</th>
                  <th>Responsable</th><th>Compromiso</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const vencida = vencidas.some((v) => v.id === d.id);
                  return (
                    <tr key={d.id} className={vencida ? 'fila-alerta' : undefined}>
                      <td><strong>{d.codigo}</strong></td>
                      <td>
                        <Insignia tono={TONO_SEVERIDAD[d.severidad] ?? 'neutro'}>
                          {ETIQUETA_SEVERIDAD[d.severidad] ?? d.severidad}
                        </Insignia>
                      </td>
                      <td>
                        <Link to={`/ejecuciones/${d.ejecucion.id}`}>{d.ejecucion.codigoControl}</Link>
                        <div className="mudo" style={{ fontSize: 11.5 }}>
                          {d.ejecucion.periodo.empresa.codigo} · {d.ejecucion.periodo.mes}/{d.ejecucion.periodo.anio}
                        </div>
                      </td>
                      <td style={{ maxWidth: 340 }}>
                        {d.descripcion}
                        {d.planAccion && <div className="mudo" style={{ fontSize: 12 }}><strong>Plan:</strong> {d.planAccion}</div>}
                      </td>
                      <td>{nombrePersona(d.responsable)}</td>
                      <td>
                        {fecha(d.fechaCompromiso)}
                        {vencida && <div style={{ fontSize: 11.5, color: 'var(--critico)' }}>⚠ vencida</div>}
                      </td>
                      <td>{d.estado.replace(/_/g, ' ').toLowerCase()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
