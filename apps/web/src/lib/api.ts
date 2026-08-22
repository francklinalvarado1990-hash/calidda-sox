export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

let accessToken: string | null = localStorage.getItem('sox_token');

export const guardarToken = (t: string | null): void => {
  accessToken = t;
  if (t) localStorage.setItem('sox_token', t);
  else localStorage.removeItem('sox_token');
};

export const hayToken = (): boolean => Boolean(accessToken);

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  formData?: FormData;
  /** Interno: evita bucles infinitos al renovar la sesion. */
  reintento?: boolean;
}

/**
 * Cliente HTTP unico. Renueva el access token de forma transparente cuando
 * expira, para que una sesion larga de trabajo no se corte a mitad de un cierre.
 */
export async function api<T = unknown>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, formData, reintento } = opciones;

  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    credentials: 'include',
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: formData ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
  });

  if (respuesta.status === 401 && !reintento && ruta !== '/auth/refresh') {
    const renovado = await renovarSesion();
    if (renovado) return api<T>(ruta, { ...opciones, reintento: true });
  }

  const texto = await respuesta.text();
  const datos = texto ? seguroJson(texto) : null;

  if (!respuesta.ok) {
    const e = datos as { error?: string; mensaje?: string; detalle?: unknown } | null;
    throw new ErrorApi(
      respuesta.status,
      e?.error ?? 'ERROR',
      e?.mensaje ?? `Error ${respuesta.status}`,
      e?.detalle,
    );
  }
  return datos as T;
}

function seguroJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

async function renovarSesion(): Promise<boolean> {
  try {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return false;
    const datos = (await r.json()) as { accessToken?: string };
    if (!datos.accessToken) return false;
    guardarToken(datos.accessToken);
    return true;
  } catch {
    return false;
  }
}

/** Descarga un archivo del API respetando la sesion actual. */
export async function descargar(ruta: string, nombreSugerido?: string): Promise<void> {
  const r = await fetch(`/api${ruta}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as { mensaje?: string } | null;
    throw new ErrorApi(r.status, 'DESCARGA', e?.mensaje ?? 'No se pudo descargar el archivo.');
  }
  const blob = await r.blob();
  const nombre =
    nombreSugerido ??
    /filename="?([^"]+)"?/.exec(r.headers.get('content-disposition') ?? '')?.[1] ??
    'archivo';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(nombre);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
