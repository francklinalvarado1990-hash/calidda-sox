import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fecha, diasHasta, nombrePersona, nombreMes, TONO_ESTADO } from '../lib/formato';
import { Aviso, Cargando, EstadoControl, EstadoDelPeriodo, Kpi, Tarjeta, Vacio } from '../components/ui';
import { GraficoEstados, GraficoProcesos, GraficoTendencia, type BarraProceso, type PuntoTendencia } from '../components/graficos';
import type { Empresa, EstadoEjecucion, EstadoPeriodo, ResumenPeriodo } from '../lib/tipos';

interface ResumenEmpresa extends ResumenPeriodo {
  periodoId: string; empresa: Empresa; estado: EstadoPeriodo; fechaLimiteCierre: string | null;
}
interface RespuestaResumen {
  anio: number; mes: number; etiquetaPeriodo: string;
  porEmpresa: ResumenEmpresa[];
  consolidado: { total: number; completos: number; abiertos: number; vencidos: number; deficienciasAbiertas: number; porcentajeAvance: number };
}
interface ProximoVencimiento {
  id: string; codigoControl: string; nombreControl: string; estado: EstadoEjecucion; fechaLimite: string;
  asignadoA: { nombres: string; apellidos: string; email: string } | null;
  periodo: { anio: number; mes: number; empresa: { codigo: string } };
}

export default function Tablero() {
  const [empresaId, setEmpresaId] = useState('');

  const { data: empresas } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => api<Empresa[]>('/catalogos/empresas'),
  });

  const filtro = empresaId ? `?empresaId=${empresaId}` : '';

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['tablero', empresaId],
    queryFn: () => api<RespuestaResumen>(`/dashboard/resumen${filtro}`),
  });
  const { data: tendencia } = useQuery({
    queryKey: ['tendencia', empresaId],
    queryFn: () => api<PuntoTendencia[]>(`/dashboard/tendencia${filtro || '?'}${filtro ? '&' : ''}meses=12`),
  });
  const { data: procesos } = useQuery({
    queryKey: ['procesos-avance', empresaId],
    queryFn: () => api<BarraProceso[]>(`/dashboard/por-proceso?${empresaId ? `empresaId=${empresaId}` : ''}`),
  });
  const { data: proximos } = useQuery({
    queryKey: ['proximos', empresaId],
    queryFn: () => api<ProximoVencimiento[]>('/dashboard/proximos-vencimientos?dias=10'),
  });

  if (isLoading || !resumen) return <Cargando />;

  const c = resumen.consolidado;
  const estados = Object.entries(
    resumen.porEmpresa.reduce<Record<string, number>>((acc, p) => {
      for (const [estado, cantidad] of Object.entries(p.porEstado)) acc[estado] = (acc[estado] ?? 0) + cantidad;
      return acc;
    }, {}),
  )
    .map(([estado, cantidad]) => ({
      estado,
      etiqueta: TONO_ESTADO[estado as EstadoEjecucion]?.texto ?? estado,
      cantidad,
      destacar: ['VENCIDO', 'OBSERVADO', 'PENDIENTE'].includes(estado),
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Tablero de cumplimiento SOX</h1>
          <p>Periodo {resumen.etiquetaPeriodo} · Cálidda y Cálidda Energía</p>
        </div>
        <div className="campo" style={{ marginBottom: 0, minWidth: 210 }}>
          <label htmlFor="emp">Empresa</label>
          <select id="emp" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Consolidado (ambas)</option>
            {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="pila">
        <div className="rejilla rejilla--kpi">
          <Kpi
            etiqueta="Avance del periodo" valor={`${c.porcentajeAvance}%`}
            pie={`${c.completos} de ${c.total} controles completos`} medidor={c.porcentajeAvance}
          />
          <Kpi etiqueta="Controles del periodo" valor={c.total} pie="Instanciados según su frecuencia" />
          <Kpi
            etiqueta="⚠ Vencidos" valor={c.vencidos}
            pie={c.vencidos ? 'Requieren regularización inmediata' : 'Ningún control fuera de plazo'}
            tono={c.vencidos ? 'critico' : undefined}
          />
          <Kpi
            etiqueta="Deficiencias abiertas" valor={c.deficienciasAbiertas}
            pie="En remediación o validación"
            tono={c.deficienciasAbiertas ? 'critico' : undefined}
          />
        </div>

        {resumen.porEmpresa.length === 0 && (
          <Aviso tono="aviso">
            No hay un periodo abierto para {nombreMes(resumen.mes)} {resumen.anio}.{' '}
            <Link to="/periodos">Ábralo desde la sección Periodos</Link> para generar la lista de controles del mes.
          </Aviso>
        )}

        {resumen.porEmpresa.length > 0 && (
          <Tarjeta titulo="Estado por empresa">
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th><th>Estado</th><th className="num">Controles</th>
                    <th className="num">Completos</th><th className="num">Vencidos</th>
                    <th className="num">Avance</th><th>Límite de cierre</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.porEmpresa.map((p) => (
                    <tr key={p.periodoId} className={p.vencidos > 0 ? 'fila-alerta' : undefined}>
                      <td><strong>{p.empresa.nombre}</strong></td>
                      <td><EstadoDelPeriodo estado={p.estado} /></td>
                      <td className="num">{p.total}</td>
                      <td className="num">{p.completos}</td>
                      <td className="num">{p.vencidos}</td>
                      <td className="num"><strong>{p.porcentajeAvance}%</strong></td>
                      <td>{fecha(p.fechaLimiteCierre)}</td>
                      <td><Link to={`/periodos/${p.periodoId}`}>Ver detalle</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

        <div className="rejilla rejilla--2">
          <Tarjeta titulo="Cumplimiento mensual" subtitulo="Porcentaje de controles completos en cada periodo aperturado (últimos 12 meses)">
            <GraficoTendencia datos={tendencia ?? []} />
          </Tarjeta>
          <Tarjeta titulo="Avance por proceso" subtitulo="Ordenado de menor a mayor cumplimiento: arriba está el cuello de botella">
            <GraficoProcesos datos={procesos ?? []} />
          </Tarjeta>
        </div>

        <div className="rejilla rejilla--2">
          <Tarjeta titulo="Controles por estado" subtitulo="Distribución del periodo vigente">
            <GraficoEstados datos={estados} />
          </Tarjeta>

          <Tarjeta titulo="Próximos vencimientos" subtitulo="Controles abiertos que vencen en los próximos 10 días">
            {!proximos?.length ? (
              <Vacio texto="No hay vencimientos próximos." />
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr><th>Control</th><th>Responsable</th><th>Estado</th><th className="num">Vence</th></tr>
                  </thead>
                  <tbody>
                    {proximos.slice(0, 12).map((p) => {
                      const dias = diasHasta(p.fechaLimite);
                      return (
                        <tr key={p.id} className={dias < 0 ? 'fila-alerta' : undefined}>
                          <td>
                            <Link to={`/ejecuciones/${p.id}`}><strong>{p.codigoControl}</strong></Link>
                            <div className="mudo" style={{ fontSize: 12 }}>{p.nombreControl}</div>
                          </td>
                          <td>{nombrePersona(p.asignadoA)}</td>
                          <td><EstadoControl estado={p.estado} /></td>
                          <td className="num">
                            {fecha(p.fechaLimite)}
                            <div className={dias < 0 ? '' : 'mudo'} style={{ fontSize: 11.5 }}>
                              {dias < 0 ? `${Math.abs(dias)} d de atraso` : dias === 0 ? 'hoy' : `en ${dias} d`}
                            </div>
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
      </div>
    </>
  );
}
