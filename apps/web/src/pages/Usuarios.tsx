import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ETIQUETA_ROL, fechaHora } from '../lib/formato';
import { Aviso, Cargando, Insignia, Modal, Tarjeta, Vacio } from '../components/ui';
import type { Empresa, Pagina, Rol } from '../lib/tipos';

interface UsuarioFila {
  id: string; email: string; nombres: string; apellidos: string; cargo: string | null;
  rol: Rol; activo: boolean; mfaHabilitado: boolean; ultimoLogin: string | null;
  empresas: Empresa[];
}

const ROLES: Rol[] = ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER', 'REVISOR', 'PREPARADOR', 'AUDITOR'];

export default function Usuarios() {
  const qc = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: string; texto: string } | null>(null);
  const [form, setForm] = useState({ email: '', nombres: '', apellidos: '', cargo: '', rol: 'PREPARADOR' as Rol, empresaIds: [] as string[] });

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: () => api<Empresa[]>('/catalogos/empresas') });
  const { data, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Pagina<UsuarioFila>>('/usuarios?tamano=200') });

  const crear = useMutation({
    mutationFn: () => api<{ passwordTemporal?: string }>('/usuarios', { metodo: 'POST', cuerpo: form }),
    onSuccess: (r) => {
      setCreando(false);
      setAviso({
        tono: 'ok',
        texto: `Usuario creado. Contraseña temporal: ${r.passwordTemporal ?? '(definida)'} — entréguela por un canal seguro; deberá cambiarla al ingresar.`,
      });
      setForm({ email: '', nombres: '', apellidos: '', cargo: '', rol: 'PREPARADOR', empresaIds: [] });
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (e: Error) => setAviso({ tono: 'critico', texto: e.message }),
  });

  const alternar = useMutation({
    mutationFn: (u: UsuarioFila) => api(`/usuarios/${u.id}`, { metodo: 'PATCH', cuerpo: { activo: !u.activo } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (e: Error) => setAviso({ tono: 'critico', texto: e.message }),
  });

  const resetear = useMutation({
    mutationFn: (id: string) => api<{ passwordTemporal: string }>(`/usuarios/${id}/reset-password`, { metodo: 'POST' }),
    onSuccess: (r) => setAviso({ tono: 'aviso', texto: `Contraseña restablecida. Temporal: ${r.passwordTemporal}` }),
    onError: (e: Error) => setAviso({ tono: 'critico', texto: e.message }),
  });

  return (
    <>
      <div className="encabezado">
        <div className="encabezado__texto">
          <h1>Usuarios y roles</h1>
          <p>El rol determina qué puede hacer cada persona. Desactivar revoca las sesiones abiertas de inmediato.</p>
        </div>
        <button className="btn btn--primario" onClick={() => { setForm((f) => ({ ...f, empresaIds: empresas?.map((e) => e.id) ?? [] })); setCreando(true); }}>
          Nuevo usuario
        </button>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <Tarjeta>
        {isLoading ? <Cargando /> : !data?.datos.length ? <Vacio texto="No hay usuarios." /> : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr><th>Usuario</th><th>Rol</th><th>Empresas</th><th>MFA</th><th>Último ingreso</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {data.datos.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nombres} {u.apellidos}</strong>
                      <div className="mudo" style={{ fontSize: 12 }}>{u.email}{u.cargo && ` · ${u.cargo}`}</div>
                    </td>
                    <td>{ETIQUETA_ROL[u.rol]}</td>
                    <td className="mudo" style={{ fontSize: 12 }}>{u.empresas.map((e) => e.codigo).join(', ')}</td>
                    <td>
                      {u.mfaHabilitado
                        ? <Insignia tono="ok"><span aria-hidden="true">✓</span>Activo</Insignia>
                        : <Insignia tono="neutro"><span aria-hidden="true">—</span>Sin MFA</Insignia>}
                    </td>
                    <td className="mudo" style={{ fontSize: 12 }}>{fechaHora(u.ultimoLogin)}</td>
                    <td>
                      {u.activo
                        ? <Insignia tono="ok"><span aria-hidden="true">✓</span>Activo</Insignia>
                        : <Insignia tono="critico"><span aria-hidden="true">✕</span>Inactivo</Insignia>}
                    </td>
                    <td>
                      <div className="fila">
                        <button className="btn btn--sm" onClick={() => alternar.mutate(u)}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button className="btn btn--sm" onClick={() => resetear.mutate(u.id)}>Restablecer clave</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {creando && (
        <Modal
          titulo="Nuevo usuario"
          onCerrar={() => setCreando(false)}
          pie={
            <>
              <button className="btn" onClick={() => setCreando(false)}>Cancelar</button>
              <button className="btn btn--primario" disabled={!form.email || !form.nombres || !form.empresaIds.length || crear.isPending} onClick={() => crear.mutate()}>
                Crear
              </button>
            </>
          }
        >
          <div className="campo">
            <label htmlFor="em">Correo corporativo</label>
            <input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="fila">
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="no">Nombres</label>
              <input id="no" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
            </div>
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="ap">Apellidos</label>
              <input id="ap" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="ca">Cargo</label>
            <input id="ca" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="ro">Rol</label>
            <select id="ro" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
              {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Empresas con alcance</label>
            {empresas?.map((e) => (
              <label key={e.id} className="fila" style={{ fontSize: 13.5 }}>
                <input
                  type="checkbox" style={{ width: 'auto' }}
                  checked={form.empresaIds.includes(e.id)}
                  onChange={(ev) =>
                    setForm({
                      ...form,
                      empresaIds: ev.target.checked
                        ? [...form.empresaIds, e.id]
                        : form.empresaIds.filter((x) => x !== e.id),
                    })
                  }
                />
                {e.nombre}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
