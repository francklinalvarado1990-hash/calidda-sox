import { DateTime } from 'luxon';
import type { EstadoEjecucion, EstadoPeriodo } from './tipos';

const ZONA = 'America/Lima';

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const nombreMes = (mes: number): string => MESES[mes - 1] ?? String(mes);

export const fecha = (iso: string | null | undefined): string =>
  iso ? DateTime.fromISO(iso, { zone: ZONA }).toFormat('dd/MM/yyyy') : '—';

export const fechaHora = (iso: string | null | undefined): string =>
  iso ? DateTime.fromISO(iso, { zone: ZONA }).toFormat('dd/MM/yyyy HH:mm') : '—';

/** Dias calendario que faltan (negativo si ya vencio). */
export const diasHasta = (iso: string): number =>
  Math.ceil(DateTime.fromISO(iso, { zone: ZONA }).diff(DateTime.now().setZone(ZONA), 'days').days);

export const tamano = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const nombrePersona = (p: { nombres: string; apellidos: string } | null | undefined): string =>
  p ? `${p.nombres} ${p.apellidos}` : 'Sin asignar';

/**
 * Tono visual de cada estado. El tono acompana SIEMPRE a la etiqueta de texto:
 * la informacion nunca se codifica solo por color.
 */
export const TONO_ESTADO: Record<EstadoEjecucion, { texto: string; tono: string; icono: string }> = {
  PENDIENTE:    { texto: 'Pendiente',      tono: 'neutro',  icono: '○' },
  EN_EJECUCION: { texto: 'En ejecución',   tono: 'info',    icono: '◐' },
  EN_REVISION:  { texto: 'En revisión',    tono: 'info',    icono: '◑' },
  OBSERVADO:    { texto: 'Observado',      tono: 'aviso',   icono: '!' },
  APROBADO:     { texto: 'Aprob. revisor', tono: 'info',    icono: '◕' },
  CERRADO:      { texto: 'Cerrado',        tono: 'ok',      icono: '✓' },
  NO_APLICA:    { texto: 'No aplica',      tono: 'neutro',  icono: '—' },
  VENCIDO:      { texto: 'Vencido',        tono: 'critico', icono: '⚠' },
};

export const TONO_PERIODO: Record<EstadoPeriodo, { texto: string; tono: string; icono: string }> = {
  PLANIFICADO:            { texto: 'Planificado',            tono: 'neutro',  icono: '○' },
  ABIERTO:                { texto: 'Abierto',                tono: 'info',    icono: '◐' },
  EN_CIERRE:              { texto: 'En cierre',              tono: 'aviso',   icono: '⏳' },
  CERRADO:                { texto: 'Cerrado',                tono: 'ok',      icono: '✓' },
  CERRADO_CON_PENDIENTES: { texto: 'Cerrado con pendientes', tono: 'critico', icono: '⚠' },
};

export const TONO_SEVERIDAD: Record<string, string> = {
  OBSERVACION: 'neutro',
  DEFICIENCIA: 'aviso',
  DEFICIENCIA_SIGNIFICATIVA: 'serio',
  DEBILIDAD_MATERIAL: 'critico',
};

export const ETIQUETA_SEVERIDAD: Record<string, string> = {
  OBSERVACION: 'Observación',
  DEFICIENCIA: 'Deficiencia',
  DEFICIENCIA_SIGNIFICATIVA: 'Deficiencia significativa',
  DEBILIDAD_MATERIAL: 'Debilidad material',
};

export const ETIQUETA_ACCION: Record<string, string> = {
  ENVIAR: 'Enviar a revisión',
  APROBAR: 'Aprobar',
  RECHAZAR: 'Observar y devolver',
  REASIGNAR: 'Reasignar',
  REABRIR: 'Reabrir',
  MARCAR_NO_APLICA: 'Marcar como no aplica',
};

export const ETIQUETA_ROL: Record<string, string> = {
  ADMIN: 'Administrador',
  SOX_MANAGER: 'Líder SOX',
  CONTROL_OWNER: 'Dueño de control',
  REVISOR: 'Revisor',
  PREPARADOR: 'Preparador',
  AUDITOR: 'Auditor (solo lectura)',
};
