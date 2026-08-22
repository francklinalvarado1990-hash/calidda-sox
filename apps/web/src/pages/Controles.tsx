import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, descargar } from '../lib/api';
import { nombrePersona } from '../lib/formato';
import { Cargando, Insignia, Tarjeta, Vacio } from '../components/ui';
import type { Control, Empresa, Pagina } from '../lib/tipos';

/** Matriz de riesgos y controles. Es la fuente de la que nace cada periodo. */
export default function Controles() {
  const [empresaId, setEmpresaId] = useState('');
  const [buscar, setBuscar] = useState('');
  const [soloClave, setSoloClave] = useState(false);

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: () => api<Empresa[]>('/catalogos/empresas') });

  const params = new URLSearchParams({ tamano: '200' });
  if (empresaId) params.set('empresaId', empresaId);
  if (buscar) params.set('buscar', buscar);
  if (soloClave) params.set('esClave', 'true');

  const { data, isLoading } = useQuery({
    queryKey: ['controles', empresaId, buscar, soloClave],
    queryFn: () => api<Pagina<Control>>(`/controles?${params.toString()}`),
  });

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Matriz de controles</h1>
          <p>Definición maestra. Cada cambio genera una versión trazable con su sustento.</p>
        </div>
        <button className="btn" onClick={() => void descargar(`/reportes/matriz/excel${empresaId ? `?empresaId=${empresaId}` : ''}`)}>
          Exportar matriz
        </button>
      </div>

      <div className="filtros">
        <div className="campo">
          <label htmlFor="emp">Empresa</label>
          <select id="emp" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas</option>
            {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div className="campo" style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="q">Buscar</label>
          <input id="q" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Código, nombre o descripción" />
        </div>
        <label className="fila" style={{ fontSize: 13.5, paddingBottom: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={soloClave} onChange={(e) => setSoloClave(e.target.checked)} />
          Solo controles clave
        </label>
      </div>

      <Tarjeta>
        {isLoading ? <Cargando /> : !data?.datos.length ? (
          <Vacio texto="No se encontraron controles con esos filtros." />
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Control</th><th>Proceso</th><th>Frecuencia</th>
                  <th>Tipo</th><th>Preparador</th><th>Revisor</th><th>Dueño</th>
                  <th className="num">Plazo</th><th className="num">Ver.</th>
                </tr>
              </thead>
              <tbody>
                {data.datos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.codigo}</strong>
                      {c.esClave && <div><Insignia tono="info">clave</Insignia></div>}
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      {c.nombre}
                      <div className="mudo" style={{ fontSize: 12 }}>{c.descripcion.slice(0, 130)}…</div>
                    </td>
                    <td>{c.proceso.nombre}</td>
                    <td>{c.frecuencia}</td>
                    <td>{c.tipo}<div className="mudo" style={{ fontSize: 11.5 }}>{c.naturaleza}</div></td>
                    <td>{nombrePersona(c.preparador)}</td>
                    <td>{nombrePersona(c.revisor)}</td>
                    <td>{nombrePersona(c.owner)}</td>
                    <td className="num">{c.diasHabilesPlazo} d</td>
                    <td className="num">v{c.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
