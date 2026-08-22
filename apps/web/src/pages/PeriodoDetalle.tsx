import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, descargar, ErrorApi } from '../lib/api';
import { fecha, nombreMes, nombrePersona, diasHasta } from '../lib/formato';
import { usePuede } from '../lib/sesion';
import { Aviso, Cargando, EstadoControl, EstadoDelPeriodo, Kpi, Modal, Tarjeta, Vacio } from '../components/ui';
import type { EjecucionLista, Pagina, Periodo } from '../lib/tipos';

interface ResultadoCierre {
  estado: string; marcadosPendientes: number; correosEnviados: number;
  responsablesIncumplidos: { nombre: string; email: string; controles: unknown[] }[];
}

export default function PeriodoDetalle() {
  const { id = '' } = useParams();
  const puede = usePuede();
  const qc = useQueryClient();
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState('');
  const [aviso, setAviso] = useState<{ tono: string; texto: string } | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('');

  const { data: periodo } = useQuery({ queryKey: ['periodo', id], queryFn: () => api<Periodo>(`/periodos/${id}`) });
  const { data: ejecuciones, isLoading } = useQuery({
    queryKey: ['ejecuciones', id, filtroEstado],
    queryFn: () => api<Pagina<EjecucionLista>>(`/ejecuciones?periodoId=${id}&tamano=200${filtroEstado ? `&estado=${filtroEstado}` : ''}`),
  });

  const cerrar = useMutation({
    mutationFn: (forzar: boolean) =>
      api<ResultadoCierre>(`/periodos/${id}/cerrar`, { metodo: 'POST', cuerpo: { forzar, nota: nota || undefined } }),
    onSuccess: (r) => {
      setCerrando(false);
      setNota('');
      const nombres = r.responsablesIncumplidos.map((x) => `${x.nombre} (${x.controles.length})`).join(', ');
      setAviso({
        tono: r.marcadosPendientes ? 'aviso' : 'ok',
        texto: r.marcadosPendientes
          ? `Periodo cerrado con ${r.marcadosPendientes} control(es) marcado(s) como pendientes. Se enviaron ${r.correosEnviados} correos. Responsables que no cerraron: ${nombres}.`
          : `Periodo cerrado con la totalidad de los controles completos. Se enviaron ${r.correosEnviados} correos de resumen.`,
      });
      void qc.invalidateQueries({ queryKey: ['periodo', id] });
      void qc.invalidateQueries({ queryKey: ['ejecuciones', id] });
    },
    onError: (e: Error) => {
      // Un 409 aquí significa "quedan controles abiertos": se ofrece forzar.
      if (e instanceof ErrorApi && e.status === 409) setCerrando(true);
      setAviso({ tono: 'critico', texto: e.message });
    },
  });

  if (!periodo) return <Cargando />;
  const r = periodo.resumen;
  const estaCerrado = periodo.estado === 'CERRADO' || periodo.estado === 'CERRADO_CON_PENDIENTES';

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>{nombreMes(periodo.mes)} {periodo.anio} · {periodo.empresa.nombre}</h1>
          <p className="fila">
            <EstadoDelPeriodo estado={periodo.estado} />
            <span className="mudo">
              Apertura: {fecha(periodo.fechaApertura)} · Límite de cierre: {fecha(periodo.fechaLimiteCierre)}
              {periodo.fechaCierre && ` · Cerrado: ${fecha(periodo.fechaCierre)}`}
            </span>
          </p>
        </div>
        <div className="fila">
          <button className="btn" onClick={() => void descargar(`/reportes/periodo/${id}/excel`)}>
            Exportar a Excel
          </button>
          {puede.gestionarPeriodos && !estaCerrado && (
            <button
              className="btn btn--primario"
              onClick={() => (r.puedeCerrarse ? cerrar.mutate(false) : setCerrando(true))}
              disabled={cerrar.isPending}
            >
              Cerrar periodo
            </button>
          )}
        </div>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {periodo.notaCierre && (
        <Aviso tono="aviso"><strong>Nota de cierre:</strong> {periodo.notaCierre}</Aviso>
      )}

      <div className="pila">
        <div className="rejilla rejilla--kpi">
          <Kpi etiqueta="Avance" valor={`${r.porcentajeAvance}%`} pie={`${r.completos} de ${r.total}`} medidor={r.porcentajeAvance} />
          <Kpi etiqueta="Cerrados" valor={r.cerrados} pie={`${r.noAplica} marcados como no aplica`} />
          <Kpi etiqueta="Abiertos" valor={r.abiertos} pie="Bloquean el cierre del periodo" tono={r.abiertos ? 'critico' : undefined} />
          <Kpi etiqueta="⚠ Vencidos" valor={r.vencidos} pie="Fuera de la fecha límite" tono={r.vencidos ? 'critico' : undefined} />
        </div>

        <Tarjeta
          titulo={`Controles del periodo (${ejecuciones?.total ?? 0})`}
          acciones={
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 200 }}>
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_EJECUCION">En ejecución</option>
              <option value="EN_REVISION">En revisión</option>
              <option value="OBSERVADO">Observado</option>
              <option value="APROBADO">Aprobado por revisor</option>
              <option value="CERRADO">Cerrado</option>
              <option value="NO_APLICA">No aplica</option>
              <option value="VENCIDO">Vencido</option>
            </select>
          }
        >
          {isLoading ? <Cargando /> : !ejecuciones?.datos.length ? (
            <Vacio texto="No hay controles con ese filtro." />
          ) : (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Control</th><th>Proceso</th><th>Responsable</th><th>Estado</th>
                    <th className="num">Evid.</th><th className="num">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {ejecuciones.datos.map((e) => {
                    const dias = diasHasta(e.fechaLimite);
                    const alerta = e.estado === 'VENCIDO' || e.marcadoPendiente;
                    return (
                      <tr key={e.id} className={alerta ? 'fila-alerta' : undefined}>
                        <td>
                          <Link to={`/ejecuciones/${e.id}`}><strong>{e.codigoControl}</strong></Link>
                          {e.control.esClave && <span className="mudo" style={{ fontSize: 11 }}> · clave</span>}
                          <div className="mudo" style={{ fontSize: 12 }}>{e.nombreControl}</div>
                          {e.marcadoPendiente && (
                            <div style={{ fontSize: 11.5, color: 'var(--critico)' }}>
                              ⚠ Marcado pendiente al cierre ({e.diasAtrasoAlCierre ?? 0} días hábiles de atraso)
                            </div>
                          )}
                        </td>
                        <td>{e.control.proceso.nombre}</td>
                        <td>{nombrePersona(e.asignadoA)}</td>
                        <td><EstadoControl estado={e.estado} /></td>
                        <td className="num">{e._count.evidencias}</td>
                        <td className="num">
                          {fecha(e.fechaLimite)}
                          {!['CERRADO', 'NO_APLICA'].includes(e.estado) && (
                            <div className={dias < 0 ? '' : 'mudo'} style={{ fontSize: 11.5 }}>
                              {dias < 0 ? `${Math.abs(dias)} d atraso` : `en ${dias} d`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      {cerrando && (
        <Modal
          titulo="Cerrar periodo con controles pendientes"
          onCerrar={() => setCerrando(false)}
          pie={
            <>
              <button className="btn" onClick={() => setCerrando(false)}>Cancelar</button>
              <button
                className="btn btn--peligro"
                disabled={nota.trim().length < 15 || cerrar.isPending}
                onClick={() => cerrar.mutate(true)}
              >
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar dejando pendientes'}
              </button>
            </>
          }
        >
          <Aviso tono="critico">
            Quedan <strong>{r.abiertos} control(es)</strong> sin completar. Al cerrar:
            <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
              <li>Cada control abierto queda marcado como pendiente, con sus días de atraso.</li>
              <li>El periodo se registra como <strong>Cerrado con pendientes</strong>.</li>
              <li>Se envía un resumen a la Gerencia y a los responsables, nombrando a quienes no cerraron.</li>
            </ul>
          </Aviso>
          <div className="campo">
            <label htmlFor="nota">Sustento del cierre con pendientes</label>
            <textarea
              id="nota" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: Se cierra por requerimiento de reporte a casa matriz. Los controles pendientes se regularizan en el periodo siguiente."
            />
            <small>Mínimo 15 caracteres. Queda registrado en la pista de auditoría y en el correo de cierre.</small>
          </div>
        </Modal>
      )}
    </>
  );
}
