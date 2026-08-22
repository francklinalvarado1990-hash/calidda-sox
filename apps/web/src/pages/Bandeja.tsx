import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fecha, diasHasta, nombreMes } from '../lib/formato';
import { Cargando, EstadoControl, Tarjeta, Vacio } from '../components/ui';
import type { EstadoEjecucion } from '../lib/tipos';

interface ItemBandeja {
  id: string; codigoControl: string; nombreControl: string;
  estado: EstadoEjecucion; fechaLimite: string; marcadoPendiente: boolean;
  periodo: { id: string; anio: number; mes: number; empresa: { codigo: string } };
}
interface Respuesta { porHacer: ItemBandeja[]; porRevisar: ItemBandeja[]; porAprobar: ItemBandeja[] }

function Lista({ items, vacio }: { items: ItemBandeja[]; vacio: string }) {
  if (!items.length) return <Vacio texto={vacio} />;
  return (
    <div className="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Control</th><th>Periodo</th><th>Estado</th><th className="num">Vence</th></tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const dias = diasHasta(i.fechaLimite);
            return (
              <tr key={i.id} className={dias < 0 ? 'fila-alerta' : undefined}>
                <td>
                  <Link to={`/ejecuciones/${i.id}`}><strong>{i.codigoControl}</strong></Link>
                  <div className="mudo" style={{ fontSize: 12 }}>{i.nombreControl}</div>
                </td>
                <td>
                  {nombreMes(i.periodo.mes)} {i.periodo.anio}
                  <div className="mudo" style={{ fontSize: 11.5 }}>{i.periodo.empresa.codigo}</div>
                </td>
                <td>
                  <EstadoControl estado={i.estado} />
                  {i.marcadoPendiente && <div className="mudo" style={{ fontSize: 11 }}>arrastrado</div>}
                </td>
                <td className="num">
                  {fecha(i.fechaLimite)}
                  <div className={dias < 0 ? '' : 'mudo'} style={{ fontSize: 11.5 }}>
                    {dias < 0 ? `${Math.abs(dias)} d de atraso` : dias === 0 ? 'vence hoy' : `en ${dias} d`}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Bandeja personal: lo unico que el usuario tiene que atender hoy. */
export default function Bandeja() {
  const { data, isLoading } = useQuery({
    queryKey: ['bandeja'],
    queryFn: () => api<Respuesta>('/ejecuciones/bandeja/mia'),
  });

  if (isLoading || !data) return <Cargando />;

  const total = data.porHacer.length + data.porRevisar.length + data.porAprobar.length;

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Mi bandeja</h1>
          <p>
            {total === 0
              ? 'No tiene controles pendientes de atención.'
              : `${total} control(es) esperan una acción suya.`}
          </p>
        </div>
      </div>

      <div className="pila">
        <Tarjeta titulo={`Por ejecutar (${data.porHacer.length})`} subtitulo="Controles asignados a usted que aún no ha enviado a revisión">
          <Lista items={data.porHacer} vacio="No tiene controles por ejecutar." />
        </Tarjeta>

        <Tarjeta titulo={`Por revisar (${data.porRevisar.length})`} subtitulo="Controles que otros enviaron y esperan su revisión">
          <Lista items={data.porRevisar} vacio="No tiene controles por revisar." />
        </Tarjeta>

        <Tarjeta titulo={`Por aprobar (${data.porAprobar.length})`} subtitulo="Controles revisados que esperan su aprobación como dueño">
          <Lista items={data.porAprobar} vacio="No tiene controles por aprobar." />
        </Tarjeta>
      </div>
    </>
  );
}
