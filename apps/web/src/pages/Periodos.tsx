import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fecha, nombreMes } from '../lib/formato';
import { usePuede } from '../lib/sesion';
import { Aviso, Cargando, EstadoDelPeriodo, Modal, Tarjeta, Vacio } from '../components/ui';
import type { Empresa, Periodo } from '../lib/tipos';

export default function Periodos() {
  const puede = usePuede();
  const qc = useQueryClient();
  const [abriendo, setAbriendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: string; texto: string } | null>(null);

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: () => api<Empresa[]>('/catalogos/empresas') });
  const { data: periodos, isLoading } = useQuery({ queryKey: ['periodos'], queryFn: () => api<Periodo[]>('/periodos?limite=36') });

  const ahora = new Date();
  const [form, setForm] = useState({ empresaId: '', anio: ahora.getFullYear(), mes: ahora.getMonth() + 1, notificar: true });

  const abrir = useMutation({
    mutationFn: () => api<{ ejecucionesCreadas: number; controlesOmitidos: number; correosEnviados: number }>('/periodos/abrir', { metodo: 'POST', cuerpo: form }),
    onSuccess: (r) => {
      setAbriendo(false);
      setMensaje({
        tono: 'ok',
        texto: `Periodo abierto: ${r.ejecucionesCreadas} control(es) instanciado(s), ${r.controlesOmitidos} omitido(s) por frecuencia, ${r.correosEnviados} correo(s) de apertura enviado(s).`,
      });
      void qc.invalidateQueries({ queryKey: ['periodos'] });
    },
    onError: (e: Error) => setMensaje({ tono: 'critico', texto: e.message }),
  });

  if (isLoading) return <Cargando />;

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Periodos de control</h1>
          <p>Cada periodo es un mes contable. Al abrirlo se genera la lista de controles según su frecuencia.</p>
        </div>
        {puede.gestionarPeriodos && (
          <button className="btn btn--primario" onClick={() => { setForm((f) => ({ ...f, empresaId: empresas?.[0]?.id ?? '' })); setAbriendo(true); }}>
            Abrir periodo
          </button>
        )}
      </div>

      {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}

      <Tarjeta>
        {!periodos?.length ? (
          <Vacio texto="Todavía no se ha aperturado ningún periodo." />
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th><th>Empresa</th><th>Estado</th>
                  <th className="num">Controles</th><th className="num">Completos</th>
                  <th className="num">Pendientes</th><th className="num">Avance</th>
                  <th>Límite</th><th>Cierre</th><th></th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id} className={p.estado === 'CERRADO_CON_PENDIENTES' ? 'fila-alerta' : undefined}>
                    <td><strong>{nombreMes(p.mes)} {p.anio}</strong></td>
                    <td>{p.empresa.nombre}</td>
                    <td><EstadoDelPeriodo estado={p.estado} /></td>
                    <td className="num">{p.resumen.total}</td>
                    <td className="num">{p.resumen.completos}</td>
                    <td className="num">{p.resumen.abiertos}</td>
                    <td className="num"><strong>{p.resumen.porcentajeAvance}%</strong></td>
                    <td>{fecha(p.fechaLimiteCierre)}</td>
                    <td>{fecha(p.fechaCierre)}</td>
                    <td><Link to={`/periodos/${p.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {abriendo && (
        <Modal
          titulo="Abrir periodo mensual"
          onCerrar={() => setAbriendo(false)}
          pie={
            <>
              <button className="btn" onClick={() => setAbriendo(false)}>Cancelar</button>
              <button className="btn btn--primario" disabled={!form.empresaId || abrir.isPending} onClick={() => abrir.mutate()}>
                {abrir.isPending ? 'Abriendo…' : 'Abrir periodo'}
              </button>
            </>
          }
        >
          <Aviso tono="info">
            Se creará una ejecución por cada control activo que aplique al mes según su frecuencia,
            con su fecha límite calculada en días hábiles, y se notificará a cada responsable.
            Si el periodo ya existe, solo se agregan los controles que falten.
          </Aviso>
          <div className="campo">
            <label htmlFor="e">Empresa</label>
            <select id="e" value={form.empresaId} onChange={(ev) => setForm({ ...form, empresaId: ev.target.value })}>
              {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="fila">
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="a">Año</label>
              <input id="a" type="number" value={form.anio} onChange={(ev) => setForm({ ...form, anio: Number(ev.target.value) })} />
            </div>
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="m">Mes</label>
              <select id="m" value={form.mes} onChange={(ev) => setForm({ ...form, mes: Number(ev.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{nombreMes(i + 1)}</option>)}
              </select>
            </div>
          </div>
          <label className="fila" style={{ fontSize: 13.5 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.notificar} onChange={(ev) => setForm({ ...form, notificar: ev.target.checked })} />
            Enviar correo de apertura a cada responsable
          </label>
        </Modal>
      )}
    </>
  );
}
