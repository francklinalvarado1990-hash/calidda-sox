import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, guardarToken, hayToken } from './api';
import type { UsuarioSesion } from './tipos';

interface Sesion {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  entrar: (email: string, password: string, codigoMfa?: string) => Promise<UsuarioSesion>;
  salir: () => Promise<void>;
  refrescarUsuario: () => Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescarUsuario = useCallback(async () => {
    try {
      setUsuario(await api<UsuarioSesion>('/auth/yo'));
    } catch {
      setUsuario(null);
      guardarToken(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (hayToken()) await refrescarUsuario();
      setCargando(false);
    })();
  }, [refrescarUsuario]);

  const entrar = useCallback(async (email: string, password: string, codigoMfa?: string) => {
    const r = await api<{ accessToken: string; usuario: UsuarioSesion }>('/auth/login', {
      metodo: 'POST',
      cuerpo: { email, password, ...(codigoMfa ? { codigoMfa } : {}) },
    });
    guardarToken(r.accessToken);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const salir = useCallback(async () => {
    await api('/auth/logout', { metodo: 'POST' }).catch(() => undefined);
    guardarToken(null);
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, entrar, salir, refrescarUsuario }),
    [usuario, cargando, entrar, salir, refrescarUsuario],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Sesion {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return ctx;
}

/** Permisos de interfaz. La autorizacion real siempre la impone el API. */
export function usePuede() {
  const { usuario } = useSesion();
  const rol = usuario?.rol;
  return {
    gobernarMatriz: rol === 'ADMIN' || rol === 'SOX_MANAGER',
    gestionarPeriodos: rol === 'ADMIN' || rol === 'SOX_MANAGER',
    gestionarUsuarios: rol === 'ADMIN',
    verAuditoria: rol === 'ADMIN' || rol === 'SOX_MANAGER' || rol === 'AUDITOR',
    soloLectura: rol === 'AUDITOR',
  };
}
