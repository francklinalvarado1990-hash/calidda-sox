import { DateTime } from 'luxon';
import { ZONA_HORARIA } from '../config/constantes.js';

/** "Ahora" en la zona horaria del negocio. Nunca usar `new Date()` directo. */
export const ahora = (): DateTime => DateTime.now().setZone(ZONA_HORARIA);

export const aFecha = (d: Date | string | DateTime): DateTime =>
  d instanceof DateTime
    ? d.setZone(ZONA_HORARIA)
    : typeof d === 'string'
      ? DateTime.fromISO(d, { zone: ZONA_HORARIA })
      : DateTime.fromJSDate(d, { zone: ZONA_HORARIA });

/** Clave YYYY-MM-DD, util para deduplicar recordatorios por dia. */
export const claveDia = (d: DateTime = ahora()): string => d.toISODate() ?? '';

export const esFinDeSemana = (d: DateTime): boolean => d.weekday === 6 || d.weekday === 7;

/**
 * Los feriados se guardan en Postgres como DATE y el driver los devuelve como
 * medianoche UTC. Convertirlos a la zona de Lima (UTC-5) los correria un dia
 * hacia atras, asi que se leen por sus componentes UTC: un feriado es una fecha
 * de calendario, no un instante.
 */
const claveFeriado = (d: Date): string => d.toISOString().slice(0, 10);

/** Clave de calendario de una fecha ya situada en la zona del negocio. */
const claveCalendario = (d: DateTime): string => d.toISODate() ?? '';

/**
 * Suma `dias` habiles a una fecha, saltando fines de semana y feriados.
 * Se usa para derivar la fecha limite de cada control a partir del fin de mes.
 */
export function sumarDiasHabiles(desde: DateTime, dias: number, feriados: Date[] = []): DateTime {
  const setFeriados = new Set(feriados.map(claveFeriado));
  let cursor = desde.startOf('day');
  let restantes = Math.max(0, Math.trunc(dias));

  while (restantes > 0) {
    cursor = cursor.plus({ days: 1 });
    if (!esFinDeSemana(cursor) && !setFeriados.has(claveCalendario(cursor))) restantes -= 1;
  }
  return cursor.endOf('day');
}

/** Dias habiles transcurridos entre dos fechas (negativo si `hasta` es anterior). */
export function diasHabilesEntre(desde: DateTime, hasta: DateTime, feriados: Date[] = []): number {
  const setFeriados = new Set(feriados.map(claveFeriado));
  const inicio = DateTime.min(desde, hasta).startOf('day');
  const fin = DateTime.max(desde, hasta).startOf('day');
  const signo = hasta >= desde ? 1 : -1;

  let cursor = inicio;
  let total = 0;
  while (cursor < fin) {
    cursor = cursor.plus({ days: 1 });
    if (!esFinDeSemana(cursor) && !setFeriados.has(claveCalendario(cursor))) total += 1;
  }
  return total * signo;
}

/** Cantidad de dias habiles de un mes calendario. */
export function diasHabilesDelMes(anio: number, mes: number, feriados: Date[] = []): number {
  const { inicio, fin } = rangoPeriodo(anio, mes);
  return diasHabilesEntre(inicio.minus({ days: 1 }), fin.startOf('day'), feriados);
}

/** Primer y ultimo instante del periodo contable (mes calendario). */
export function rangoPeriodo(anio: number, mes: number): { inicio: DateTime; fin: DateTime } {
  const inicio = DateTime.fromObject(
    { year: anio, month: mes, day: 1 },
    { zone: ZONA_HORARIA },
  ).startOf('day');
  return { inicio, fin: inicio.endOf('month') };
}

/** Periodo inmediatamente siguiente, con salto de anio. */
export function periodoSiguiente(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

export function periodoAnterior(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export const formatoLargo = (d: Date | DateTime): string =>
  aFecha(d).setLocale('es').toFormat("dd 'de' LLLL 'de' yyyy");

export const formatoCorto = (d: Date | DateTime): string => aFecha(d).toFormat('dd/MM/yyyy');
