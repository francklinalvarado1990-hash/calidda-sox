import { describe, expect, it } from 'vitest';
import { aplicaEnPeriodo, ocurrenciasEsperadas } from '../src/utils/frecuencia.js';

describe('aplicaEnPeriodo', () => {
  it('instancia los controles sub-mensuales todos los meses', () => {
    for (const f of ['DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL'] as const) {
      for (let mes = 1; mes <= 12; mes += 1) {
        expect(aplicaEnPeriodo(f, 1, mes), `${f} mes ${mes}`).toBe(true);
      }
    }
  });

  it('respeta el mes ancla en los controles trimestrales', () => {
    // Ancla en marzo: aplica en marzo, junio, septiembre y diciembre.
    const aplica = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      aplicaEnPeriodo('TRIMESTRAL', 3, m),
    );
    expect(aplica).toEqual([3, 6, 9, 12]);
  });

  it('maneja anclas que obligan a envolver el ano', () => {
    // Ancla en noviembre, trimestral: nov, feb, may, ago.
    const aplica = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      aplicaEnPeriodo('TRIMESTRAL', 11, m),
    );
    expect(aplica).toEqual([2, 5, 8, 11]);
  });

  it('aplica los semestrales dos veces al ano', () => {
    const aplica = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      aplicaEnPeriodo('SEMESTRAL', 6, m),
    );
    expect(aplica).toEqual([6, 12]);
  });

  it('aplica el control anual solo en su mes', () => {
    expect(aplicaEnPeriodo('ANUAL', 12, 12)).toBe(true);
    expect(aplicaEnPeriodo('ANUAL', 12, 11)).toBe(false);
  });

  it('no instancia automaticamente los controles eventuales', () => {
    for (let mes = 1; mes <= 12; mes += 1) expect(aplicaEnPeriodo('EVENTUAL', 1, mes)).toBe(false);
  });

  it('normaliza un mes ancla invalido a enero en lugar de fallar', () => {
    expect(aplicaEnPeriodo('TRIMESTRAL', 0, 1)).toBe(true);
    expect(aplicaEnPeriodo('TRIMESTRAL', 99, 4)).toBe(true);
  });
});

describe('ocurrenciasEsperadas', () => {
  it('un control diario espera una ocurrencia por dia habil', () => {
    expect(ocurrenciasEsperadas('DIARIA', 21)).toBe(21);
  });
  it('un control mensual espera una sola ocurrencia', () => {
    expect(ocurrenciasEsperadas('MENSUAL', 21)).toBe(1);
  });
  it('un control eventual no tiene cantidad esperada', () => {
    expect(ocurrenciasEsperadas('EVENTUAL', 21)).toBeNull();
  });
});
