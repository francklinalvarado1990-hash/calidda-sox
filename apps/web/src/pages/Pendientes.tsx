import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fecha, nombreMes, nombrePersona } from '../lib/formato';
import { Aviso, Cargando, EstadoControl, Tarjeta, Vacio } from '../components/ui';
import type { EstadoEjecucion, PersonaBreve } from '../lib/tipos';

interface Arrastrado {
  id: string; codigoControl: string; nombreControl: string; estado: EstadoEjecucion;
  fechaLimite: string; motivoPendiente: string | null; diasAtrasoAlCierre: number | null;
  asignadoA: PersonaBreve | null;
  periodo: { id: string; anio: number; mes: number; empresa: { codigo: string; nombre: string } };
}

/**
 * Controles que quedaron marcados al cerrar un periodo con pendientes.
 * Esta es la lista que impide que un incumplimiento se pierda de vista.
 */
export default function Pendientes() {
  const { data, isLoading } = useQuery({
    queryKey: ['arrastrados'],
    queryFn: () => api<Arrastrado[]>('/periodos/pendientes/arrastrados'),
  });

  if (isLoading) return <Cargando />;

  const porResponsable = new Map<string, Arrastrado[]>();
  for (const a of data ?? []) {
    const clave = a.asignadoA?.email ?? 'sin-asignar';
    porResponsable.set(clave, [...(porResponsable.get(clave) ?? []), a]);
  }

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Controles pendientes arrastrados</h1>
          <p>Controles marcados al cerrar un periodo y que aún no se han regularizado.</p>
        </div>
      </div>

      {!data?.length ? (
        <Aviso tono="ok">No hay controles arrastrados: todos los periodos cerraron completos.</Aviso>
      ) : (
        <div className="pila">
          <Aviso tono="critico">
            <strong>{data.length} control(es)</strong> quedaron marcados como pendientes en periodos ya cerrados,
            distribuidos entre {porResponsable.size} responsable(s).
          </Aviso>

          <Tarjeta titulo="Detalle">
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Control</th><th>Periodo</th><th>Responsable</th>
                    <th>Estado</th><th className="num">Venció</th><th className="num">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} className="fila-alerta">
                      <td>
                        <Link to={`/ejecuciones/${a.id}`}><strong>{a.codigoControl}</strong></Link>
                        <div className="mudo" style={{ fontSize: 12 }}>{a.nombreControl}</div>
                      </td>
                      <td>
                        {nombreMes(a.periodo.mes)} {a.periodo.anio}
                        <div className="mudo" style={{ fontSize: 11.5 }}>{a.periodo.empresa.codigo}</div>
                      </td>
                      <td>{nombrePersona(a.asignadoA)}</td>
                      <td><EstadoControl estado={a.estado} /></td>
                      <td className="num">{fecha(a.fechaLimite)}</td>
                      <td className="num"><strong>{a.diasAtrasoAlCierre ?? 0} d</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </div>
      )}
      {data?.length === 0 && <Vacio texto="Sin pendientes." />}
    </>
  );
}
