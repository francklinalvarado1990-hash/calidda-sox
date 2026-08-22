import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, descargar } from '../lib/api';
import { ETIQUETA_ACCION, fecha, fechaHora, nombreMes, nombrePersona, tamano, TONO_ESTADO } from '../lib/formato';
import { Aviso, Cargando, EstadoControl, Modal, Tarjeta, Vacio } from '../components/ui';
import type { Accion, EjecucionDetalle as Detalle } from '../lib/tipos';

const RESULTADOS = [
  { v: 'EFECTIVO', t: 'Efectivo' },
  { v: 'EFECTIVO_CON_OBSERVACIONES', t: 'Efectivo con observaciones' },
  { v: 'DEFICIENTE', t: 'Deficiente' },
  { v: 'NO_APLICA', t: 'No aplica' },
];

const EXIGE_COMENTARIO: Accion[] = ['RECHAZAR', 'REABRIR', 'MARCAR_NO_APLICA'];

export default function EjecucionDetalle() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [accionAbierta, setAccionAbierta] = useState<Accion | null>(null);
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState<{ tono: string; texto: string } | null>(null);
  const [borrador, setBorrador] = useState<{ conclusion: string; resultado: string; muestraTamano: string; excepciones: string } | null>(null);

  const { data: e, isLoading } = useQuery({
    queryKey: ['ejecucion', id],
    queryFn: async () => {
      const d = await api<Detalle>(`/ejecuciones/${id}`);
      setBorrador((b) => b ?? {
        conclusion: d.conclusion ?? '',
        resultado: d.resultado ?? '',
        muestraTamano: d.muestraTamano?.toString() ?? '',
        excepciones: d.excepciones?.toString() ?? '',
      });
      return d;
    },
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['ejecucion', id] });
    void qc.invalidateQueries({ queryKey: ['bandeja'] });
  };

  const guardar = useMutation({
    mutationFn: () =>
      api(`/ejecuciones/${id}`, {
        metodo: 'PATCH',
        cuerpo: {
          conclusion: borrador?.conclusion,
          resultado: borrador?.resultado || undefined,
          muestraTamano: borrador?.muestraTamano ? Number(borrador.muestraTamano) : null,
          excepciones: borrador?.excepciones ? Number(borrador.excepciones) : null,
        },
      }),
    onSuccess: () => { setAviso({ tono: 'ok', texto: 'Avance guardado.' }); refrescar(); },
    onError: (err: Error) => setAviso({ tono: 'critico', texto: err.message }),
  });

  const accionar = useMutation({
    mutationFn: (accion: Accion) =>
      api(`/ejecuciones/${id}/accion`, {
        metodo: 'POST',
        cuerpo: { accion, comentario: comentario || undefined, resultado: borrador?.resultado || undefined },
      }),
    onSuccess: (_r, accion) => {
      setAccionAbierta(null);
      setComentario('');
      setAviso({ tono: 'ok', texto: `Acción registrada: ${ETIQUETA_ACCION[accion]}.` });
      refrescar();
    },
    onError: (err: Error) => setAviso({ tono: 'critico', texto: err.message }),
  });

  const subir = useMutation({
    mutationFn: async (archivo: File) => {
      const fd = new FormData();
      fd.append('archivo', archivo);
      return api(`/ejecuciones/${id}/evidencias`, { metodo: 'POST', formData: fd });
    },
    onSuccess: () => { setAviso({ tono: 'ok', texto: 'Evidencia adjuntada.' }); refrescar(); },
    onError: (err: Error) => setAviso({ tono: 'critico', texto: err.message }),
  });

  if (isLoading || !e || !borrador) return <Cargando />;

  const editable = !['CERRADO', 'NO_APLICA'].includes(e.estado) &&
    !['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(e.periodo.estado);

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>{e.codigoControl} · {e.nombreControl}</h1>
          <p className="fila">
            <EstadoControl estado={e.estado} />
            <span className="mudo">
              <Link to={`/periodos/${e.periodo.id}`}>{nombreMes(e.periodo.mes)} {e.periodo.anio}</Link>
              {' · '}{e.periodo.empresa.nombre} · {e.control.proceso.nombre}
              {e.control.esClave && ' · control clave'}
            </span>
          </p>
        </div>
        <div className="fila">
          {e.accionesDisponibles.map((a) => (
            <button
              key={a}
              className={`btn ${a === 'APROBAR' ? 'btn--exito' : a === 'RECHAZAR' ? 'btn--peligro' : a === 'ENVIAR' ? 'btn--primario' : ''}`}
              onClick={() => (EXIGE_COMENTARIO.includes(a) ? setAccionAbierta(a) : accionar.mutate(a))}
              disabled={accionar.isPending}
            >
              {ETIQUETA_ACCION[a]}
            </button>
          ))}
        </div>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {e.marcadoPendiente && (
        <Aviso tono="critico">
          <strong>⚠ Marcado como pendiente al cierre del periodo.</strong>{' '}
          {e.motivoPendiente} {e.diasAtrasoAlCierre !== null && `Atraso: ${e.diasAtrasoAlCierre} días hábiles.`}
        </Aviso>
      )}
      {!editable && e.periodo.estado.startsWith('CERRADO') && (
        <Aviso tono="aviso">El periodo está cerrado. Solicite su reapertura al líder SOX para registrar cambios.</Aviso>
      )}

      <div className="rejilla rejilla--2">
        <div className="pila">
          <Tarjeta titulo="Ejecución del control">
            <div className="campo">
              <label htmlFor="res">Resultado</label>
              <select
                id="res" value={borrador.resultado} disabled={!editable}
                onChange={(ev) => setBorrador({ ...borrador, resultado: ev.target.value })}
              >
                <option value="">— Seleccione —</option>
                {RESULTADOS.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
              </select>
            </div>
            <div className="fila">
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="mu">Tamaño de muestra</label>
                <input id="mu" type="number" min={0} value={borrador.muestraTamano} disabled={!editable}
                  onChange={(ev) => setBorrador({ ...borrador, muestraTamano: ev.target.value })} />
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="ex">Excepciones detectadas</label>
                <input id="ex" type="number" min={0} value={borrador.excepciones} disabled={!editable}
                  onChange={(ev) => setBorrador({ ...borrador, excepciones: ev.target.value })} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="con">Conclusión</label>
              <textarea
                id="con" value={borrador.conclusion} disabled={!editable}
                onChange={(ev) => setBorrador({ ...borrador, conclusion: ev.target.value })}
                placeholder="Describa el trabajo realizado, el alcance revisado y la conclusión sobre la efectividad del control."
              />
            </div>
            {editable && (
              <button className="btn btn--primario" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar avance'}
              </button>
            )}
          </Tarjeta>

          <Tarjeta
            titulo={`Evidencias (${e.evidencias.length})`}
            subtitulo="Cada archivo se sella con su hash SHA-256; la evidencia no se sobrescribe ni se elimina."
            acciones={
              editable ? (
                <>
                  <input
                    ref={archivoRef} type="file" hidden
                    onChange={(ev) => { const f = ev.target.files?.[0]; if (f) subir.mutate(f); ev.target.value = ''; }}
                  />
                  <button className="btn btn--sm" onClick={() => archivoRef.current?.click()} disabled={subir.isPending}>
                    {subir.isPending ? 'Subiendo…' : 'Adjuntar'}
                  </button>
                </>
              ) : undefined
            }
          >
            {!e.evidencias.length ? (
              <Vacio texto="Aún no se ha adjuntado evidencia." />
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead><tr><th>Archivo</th><th>Subido por</th><th className="num">Tamaño</th><th></th></tr></thead>
                  <tbody>
                    {e.evidencias.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <strong>{ev.nombreArchivo}</strong>
                          <div className="mono mudo">SHA-256 {ev.sha256.slice(0, 24)}…</div>
                        </td>
                        <td>
                          {nombrePersona(ev.subidoPor)}
                          <div className="mudo" style={{ fontSize: 11.5 }}>{fechaHora(ev.subidoEn)}</div>
                        </td>
                        <td className="num">{tamano(ev.tamanoBytes)}</td>
                        <td>
                          <button className="btn btn--sm" onClick={() => void descargar(`/evidencias/${ev.id}/descargar`, ev.nombreArchivo)}>
                            Descargar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {e.control.evidenciaRequerida && (
              <Aviso tono="info"><strong>Evidencia requerida:</strong> {e.control.evidenciaRequerida}</Aviso>
            )}
          </Tarjeta>
        </div>

        <div className="pila">
          <Tarjeta titulo="Definición del control">
            <p style={{ fontSize: 13.5, marginTop: 0 }}>{e.control.descripcion}</p>
            <div className="tabla-envoltura">
              <table>
                <tbody>
                  <tr><th style={{ width: 150 }}>Responsable</th><td>{nombrePersona(e.asignadoA)}</td></tr>
                  <tr><th>Fecha límite</th><td>{fecha(e.fechaLimite)}</td></tr>
                  <tr><th>Frecuencia</th><td>{e.control.frecuencia}</td></tr>
                  <tr><th>Tipo</th><td>{e.control.tipo} · {e.control.naturaleza}</td></tr>
                  <tr><th>Aserciones</th><td>{e.control.aserciones.join(', ') || '—'}</td></tr>
                  <tr>
                    <th>Flujo de aprobación</th>
                    <td>
                      Preparación
                      {e.control.requiereRevision && ' → Revisión'}
                      {e.control.requiereAprobacionOwner && ' → Aprobación del dueño'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Bitácora de aprobación" subtitulo="Registro inmutable de cada transición del workflow">
            {!e.aprobaciones.length ? (
              <Vacio texto="Todavía no hay movimientos registrados." />
            ) : (
              <ul className="linea-tiempo">
                {e.aprobaciones.map((a) => (
                  <li key={a.id}>
                    <span className="linea-tiempo__marca" />
                    <div className="linea-tiempo__cuerpo">
                      <strong>{ETIQUETA_ACCION[a.accion] ?? a.accion}</strong>
                      {' — '}
                      {TONO_ESTADO[a.estadoAnterior].texto} → {TONO_ESTADO[a.estadoNuevo].texto}
                      {a.comentario && <div style={{ marginTop: 3 }}>«{a.comentario}»</div>}
                      <div className="linea-tiempo__meta">
                        {nombrePersona(a.usuario)} · {fechaHora(a.creadoEn)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {e.deficiencias.length > 0 && (
            <Tarjeta titulo={`Deficiencias (${e.deficiencias.length})`}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {e.deficiencias.map((d) => (
                  <li key={d.id}><strong>{d.codigo}</strong> · {d.severidad} · {d.estado}<br />{d.descripcion}</li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>

      {accionAbierta && (
        <Modal
          titulo={ETIQUETA_ACCION[accionAbierta] ?? accionAbierta}
          onCerrar={() => setAccionAbierta(null)}
          pie={
            <>
              <button className="btn" onClick={() => setAccionAbierta(null)}>Cancelar</button>
              <button
                className="btn btn--primario"
                disabled={comentario.trim().length < 10 || accionar.isPending}
                onClick={() => accionar.mutate(accionAbierta)}
              >
                Confirmar
              </button>
            </>
          }
        >
          <div className="campo">
            <label htmlFor="com">
              {accionAbierta === 'RECHAZAR' ? 'Motivo de la observación' :
               accionAbierta === 'REABRIR' ? 'Motivo de la reapertura' :
               'Sustento de por qué el control no aplica en este periodo'}
            </label>
            <textarea id="com" value={comentario} onChange={(ev) => setComentario(ev.target.value)} />
            <small>Mínimo 10 caracteres. Queda en la bitácora y se envía por correo al responsable.</small>
          </div>
        </Modal>
      )}
    </>
  );
}
