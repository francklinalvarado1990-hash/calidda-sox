export type Rol = 'ADMIN' | 'SOX_MANAGER' | 'CONTROL_OWNER' | 'REVISOR' | 'PREPARADOR' | 'AUDITOR';

export type EstadoEjecucion =
  | 'PENDIENTE' | 'EN_EJECUCION' | 'EN_REVISION' | 'OBSERVADO'
  | 'APROBADO' | 'CERRADO' | 'NO_APLICA' | 'VENCIDO';

export type EstadoPeriodo =
  | 'PLANIFICADO' | 'ABIERTO' | 'EN_CIERRE' | 'CERRADO' | 'CERRADO_CON_PENDIENTES';

export type Accion = 'ENVIAR' | 'APROBAR' | 'RECHAZAR' | 'REASIGNAR' | 'REABRIR' | 'MARCAR_NO_APLICA';

export interface Empresa { id: string; codigo: string; nombre: string; _count?: { controles: number } }

export interface UsuarioSesion {
  id: string; email: string; nombres: string; apellidos: string; cargo?: string | null;
  rol: Rol; mfaHabilitado: boolean; debeCambiarPwd: boolean; debeConfigurarMfa?: boolean;
  empresas: Empresa[];
}

export interface PersonaBreve { id: string; nombres: string; apellidos: string; email: string }

export interface ResumenPeriodo {
  total: number; cerrados: number; noAplica: number; completos: number;
  abiertos: number; vencidos: number; porEstado: Record<string, number>;
  porcentajeAvance: number; deficienciasAbiertas: number; puedeCerrarse: boolean;
}

export interface Periodo {
  id: string; anio: number; mes: number; estado: EstadoPeriodo;
  fechaApertura: string | null; fechaLimiteCierre: string | null; fechaCierre: string | null;
  notaCierre: string | null; empresa: Empresa; resumen: ResumenPeriodo;
}

export interface EjecucionLista {
  id: string; codigoControl: string; nombreControl: string;
  estado: EstadoEjecucion; resultado: string | null;
  fechaLimite: string; fechaCierre: string | null;
  marcadoPendiente: boolean; diasAtrasoAlCierre: number | null;
  asignadoA: PersonaBreve | null;
  control: { esClave: boolean; frecuencia: string; proceso: { nombre: string } };
  periodo: { id: string; anio: number; mes: number; estado: EstadoPeriodo; empresa: { codigo: string; nombre: string } };
  _count: { evidencias: number; deficiencias: number };
  accionesDisponibles: Accion[];
}

export interface Evidencia {
  id: string; nombreArchivo: string; descripcion: string | null; mimeType: string;
  tamanoBytes: number; sha256: string; subidoEn: string;
  subidoPor: { id: string; nombres: string; apellidos: string };
}

export interface Aprobacion {
  id: string; paso: string; accion: string; comentario: string | null;
  estadoAnterior: EstadoEjecucion; estadoNuevo: EstadoEjecucion; creadoEn: string;
  usuario: PersonaBreve;
}

export interface EjecucionDetalle {
  id: string; codigoControl: string; nombreControl: string;
  estado: EstadoEjecucion; resultado: string | null; conclusion: string | null;
  muestraTamano: number | null; excepciones: number | null;
  fechaLimite: string; fechaCierre: string | null;
  marcadoPendiente: boolean; motivoPendiente: string | null; diasAtrasoAlCierre: number | null;
  asignadoAId: string | null; revisorId: string | null; ownerId: string | null;
  asignadoA: PersonaBreve | null;
  control: {
    id: string; codigo: string; nombre: string; descripcion: string;
    procedimiento: string | null; evidenciaRequerida: string | null;
    frecuencia: string; tipo: string; naturaleza: string; esClave: boolean;
    aserciones: string[]; requiereRevision: boolean; requiereAprobacionOwner: boolean;
    proceso: { codigo: string; nombre: string };
  };
  periodo: { id: string; anio: number; mes: number; estado: EstadoPeriodo; empresa: Empresa };
  evidencias: Evidencia[];
  aprobaciones: Aprobacion[];
  deficiencias: { id: string; codigo: string; severidad: string; estado: string; descripcion: string }[];
  accionesDisponibles: Accion[];
}

export interface Control {
  id: string; codigo: string; nombre: string; descripcion: string; riesgo: string | null;
  tipo: string; naturaleza: string; frecuencia: string; esClave: boolean;
  aserciones: string[]; diasHabilesPlazo: number; activo: boolean; version: number;
  empresa: Empresa; proceso: { id: string; codigo: string; nombre: string };
  owner: PersonaBreve | null; preparador: PersonaBreve | null; revisor: PersonaBreve | null;
}

export interface Pagina<T> { total: number; pagina: number; tamano: number; datos: T[] }
