import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  diasHabilesDelMes,
  diasHabilesEntre,
  periodoAnterior,
  periodoSiguiente,
  rangoPeriodo,
  sumarDiasHabiles,
} from '../src/utils/fechas.js';
import { ZONA_HORARIA } from '../src/config/constantes.js';

const fecha = (iso: string) => DateTime.fromISO(iso, { zone: ZONA_HORARIA });

describe('sumarDiasHabiles', () => {
  it('salta el fin de semana', () => {
    // 2026-01-30 es viernes; +1 dia habil = lunes 2026-02-02.
    expect(sumarDiasHabiles(fecha('2026-01-30'), 1).toISODate()).toBe('2026-02-02');
  });

  it('salta los feriados configurados', () => {
    // 2026-07-28 y 29 son Fiestas Patrias (martes y miercoles).
    const feriados = [new Date('2026-07-28T00:00:00Z'), new Date('2026-07-29T00:00:00Z')];
    expect(sumarDiasHabiles(fecha('2026-07-27'), 1, feriados).toISODate()).toBe('2026-07-30');
  });

  it('devuelve el mismo dia cuando se suman cero dias', () => {
    expect(sumarDiasHabiles(fecha('2026-03-11'), 0).toISODate()).toBe('2026-03-11');
  });

  it('calcula la fecha limite tipica de cierre (fin de mes + 5 habiles)', () => {
    // Enero 2026 termina el sabado 31; +5 habiles = viernes 6 de febrero.
    const { fin } = rangoPeriodo(2026, 1);
    expect(sumarDiasHabiles(fin, 5).toISODate()).toBe('2026-02-06');
  });
});

describe('diasHabilesEntre', () => {
  it('cuenta solo dias habiles', () => {
    // Lunes 2026-03-02 a viernes 2026-03-06 => 4 dias habiles.
    expect(diasHabilesEntre(fecha('2026-03-02'), fecha('2026-03-06'))).toBe(4);
  });

  it('devuelve negativo cuando la fecha objetivo ya paso', () => {
    expect(diasHabilesEntre(fecha('2026-03-06'), fecha('2026-03-02'))).toBe(-4);
  });

  it('devuelve cero para el mismo dia', () => {
    expect(diasHabilesEntre(fecha('2026-03-04'), fecha('2026-03-04'))).toBe(0);
  });
});

describe('rangoPeriodo y navegacion', () => {
  it('delimita correctamente un mes de 28 dias', () => {
    const { inicio, fin } = rangoPeriodo(2026, 2);
    expect(inicio.toISODate()).toBe('2026-02-01');
    expect(fin.toISODate()).toBe('2026-02-28');
  });

  it('avanza y retrocede cruzando el cambio de ano', () => {
    expect(periodoSiguiente(2026, 12)).toEqual({ anio: 2027, mes: 1 });
    expect(periodoAnterior(2026, 1)).toEqual({ anio: 2025, mes: 12 });
  });

  it('cuenta los dias habiles de un mes', () => {
    // Marzo 2026: 31 dias, 22 dias habiles sin feriados.
    expect(diasHabilesDelMes(2026, 3)).toBe(22);
  });
});
