import type { Frecuencia } from '@prisma/client';

/** Cada cuantos meses se repite el control. `null` = no es multi-mensual. */
const PASO_MESES: Partial<Record<Frecuencia, number>> = {
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  CUATRIMESTRAL: 4,
  SEMESTRAL: 6,
};

/**
 * Determina si un control debe instanciarse en el periodo (anio, mes).
 *
 * - Frecuencias sub-mensuales (diaria, semanal, quincenal) se instancian una vez
 *   por mes: la ejecucion mensual documenta todas las ocurrencias del periodo,
 *   que es como se sustenta ante el auditor externo.
 * - Multi-mensuales usan `mesAncla` (1-12) para fijar el calendario.
 * - EVENTUAL no se instancia automaticamente: se crea a demanda.
 */
export function aplicaEnPeriodo(
  frecuencia: Frecuencia,
  mesAncla: number,
  mes: number,
): boolean {
  switch (frecuencia) {
    case 'DIARIA':
    case 'SEMANAL':
    case 'QUINCENAL':
    case 'MENSUAL':
      return true;
    case 'ANUAL':
      return mes === normalizarMes(mesAncla);
    case 'EVENTUAL':
      return false;
    default: {
      const paso = PASO_MESES[frecuencia];
      if (!paso) return false;
      const delta = mes - normalizarMes(mesAncla);
      return ((delta % paso) + paso) % paso === 0;
    }
  }
}

const normalizarMes = (m: number): number => {
  const n = Math.trunc(m);
  return n >= 1 && n <= 12 ? n : 1;
};

/**
 * Ocurrencias esperadas del control dentro de un mes. Sirve para validar que el
 * preparador sustente la cantidad correcta de evidencias (p. ej. 20-23 dias
 * habiles en un control diario) y para dimensionar la muestra.
 */
export function ocurrenciasEsperadas(
  frecuencia: Frecuencia,
  diasHabilesDelMes: number,
): number | null {
  switch (frecuencia) {
    case 'DIARIA':
      return diasHabilesDelMes;
    case 'SEMANAL':
      return 4;
    case 'QUINCENAL':
      return 2;
    case 'MENSUAL':
      return 1;
    case 'EVENTUAL':
      return null;
    default:
      return 1;
  }
}

export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  DIARIA: 'Diaria',
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  CUATRIMESTRAL: 'Cuatrimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  EVENTUAL: 'Eventual',
};
