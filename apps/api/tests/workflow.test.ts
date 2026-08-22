import { describe, expect, it } from 'vitest';
import {
  accionesDisponibles,
  estaCompleto,
  siguienteEstado,
  type ContextoTransicion,
} from '../src/core/workflow.js';
import { ErrorApp } from '../src/core/errores.js';

const PREPARADOR = 'u-prep';
const REVISOR = 'u-rev';
const OWNER = 'u-own';

const ctx = (over: Partial<ContextoTransicion> = {}): ContextoTransicion => ({
  estadoActual: 'EN_EJECUCION',
  accion: 'ENVIAR',
  usuarioId: PREPARADOR,
  rol: 'PREPARADOR',
  config: { requiereRevision: true, requiereAprobacionOwner: true },
  actores: { asignadoAId: PREPARADOR, revisorId: REVISOR, ownerId: OWNER },
  ...over,
});

describe('flujo completo de aprobacion', () => {
  it('preparador -> revision -> owner -> cerrado', () => {
    const envio = siguienteEstado(ctx());
    expect(envio.estadoNuevo).toBe('EN_REVISION');

    const revision = siguienteEstado(
      ctx({ estadoActual: 'EN_REVISION', accion: 'APROBAR', usuarioId: REVISOR, rol: 'REVISOR' }),
    );
    expect(revision.estadoNuevo).toBe('APROBADO');
    expect(revision.paso).toBe('REVISION');

    const aprobacion = siguienteEstado(
      ctx({ estadoActual: 'APROBADO', accion: 'APROBAR', usuarioId: OWNER, rol: 'CONTROL_OWNER' }),
    );
    expect(aprobacion.estadoNuevo).toBe('CERRADO');
    expect(aprobacion.paso).toBe('APROBACION_OWNER');
  });

  it('cierra directo cuando el control no exige revision ni aprobacion', () => {
    const r = siguienteEstado(
      ctx({ config: { requiereRevision: false, requiereAprobacionOwner: false } }),
    );
    expect(r.estadoNuevo).toBe('CERRADO');
  });

  it('salta la revision pero exige la aprobacion del dueno', () => {
    const r = siguienteEstado(
      ctx({ config: { requiereRevision: false, requiereAprobacionOwner: true } }),
    );
    expect(r.estadoNuevo).toBe('APROBADO');
  });

  it('el rechazo devuelve el control al preparador y exige comentario', () => {
    const r = siguienteEstado(
      ctx({
        estadoActual: 'EN_REVISION', accion: 'RECHAZAR', usuarioId: REVISOR, rol: 'REVISOR',
        comentario: 'Falta el sustento de la partida conciliatoria de S/ 12,000.',
      }),
    );
    expect(r.estadoNuevo).toBe('OBSERVADO');

    expect(() =>
      siguienteEstado(
        ctx({ estadoActual: 'EN_REVISION', accion: 'RECHAZAR', usuarioId: REVISOR, rol: 'REVISOR' }),
      ),
    ).toThrow(/motivo de la observacion/i);
  });

  it('un control observado puede reenviarse a revision', () => {
    const r = siguienteEstado(ctx({ estadoActual: 'OBSERVADO' }));
    expect(r.estadoNuevo).toBe('EN_REVISION');
  });

  it('un control vencido sigue siendo regularizable', () => {
    const r = siguienteEstado(ctx({ estadoActual: 'VENCIDO' }));
    expect(r.estadoNuevo).toBe('EN_REVISION');
  });
});

describe('segregacion de funciones', () => {
  it('el preparador no puede revisar su propio control', () => {
    expect(() =>
      siguienteEstado(
        ctx({ estadoActual: 'EN_REVISION', accion: 'APROBAR', usuarioId: PREPARADOR, rol: 'REVISOR' }),
      ),
    ).toThrow(/no puede revisarlo/i);
  });

  it('el revisor no puede aprobar como dueno del control', () => {
    expect(() =>
      siguienteEstado(
        ctx({ estadoActual: 'APROBADO', accion: 'APROBAR', usuarioId: REVISOR, rol: 'CONTROL_OWNER' }),
      ),
    ).toThrow(/no puede aprobarlo como dueno/i);
  });

  it('el preparador tampoco puede aprobar como dueno', () => {
    expect(() =>
      siguienteEstado(
        ctx({ estadoActual: 'APROBADO', accion: 'APROBAR', usuarioId: PREPARADOR, rol: 'CONTROL_OWNER' }),
      ),
    ).toThrow(/no puede aprobarlo como dueno/i);
  });

  it('devuelve un error 403 tipado, no un error generico', () => {
    try {
      siguienteEstado(
        ctx({ estadoActual: 'EN_REVISION', accion: 'APROBAR', usuarioId: PREPARADOR, rol: 'REVISOR' }),
      );
      throw new Error('deberia haber fallado');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorApp);
      expect((e as ErrorApp).status).toBe(403);
    }
  });
});

describe('transiciones invalidas', () => {
  it('no se aprueba un control que nadie envio', () => {
    expect(() =>
      siguienteEstado(ctx({ estadoActual: 'PENDIENTE', accion: 'APROBAR', rol: 'REVISOR' })),
    ).toThrow(/no hay una aprobacion pendiente/i);
  });

  it('no se envia a revision un control ya cerrado', () => {
    expect(() => siguienteEstado(ctx({ estadoActual: 'CERRADO' }))).toThrow(/no se puede enviar/i);
  });

  it('solo el lider SOX reabre un control', () => {
    expect(() =>
      siguienteEstado(ctx({ estadoActual: 'CERRADO', accion: 'REABRIR', rol: 'PREPARADOR', comentario: 'x' })),
    ).toThrow(/solo el lider sox/i);

    const r = siguienteEstado(
      ctx({
        estadoActual: 'CERRADO', accion: 'REABRIR', rol: 'SOX_MANAGER',
        comentario: 'Se detecto que la evidencia cargada corresponde a otro periodo.',
      }),
    );
    expect(r.estadoNuevo).toBe('EN_EJECUCION');
  });

  it('marcar no aplica exige sustento y rol adecuado', () => {
    expect(() =>
      siguienteEstado(ctx({ accion: 'MARCAR_NO_APLICA', rol: 'CONTROL_OWNER', usuarioId: OWNER })),
    ).toThrow(/sustentar por escrito/i);

    expect(() =>
      siguienteEstado(ctx({ accion: 'MARCAR_NO_APLICA', rol: 'PREPARADOR', comentario: 'no hubo operaciones' })),
    ).toThrow(/solo el dueno del control/i);

    const r = siguienteEstado(
      ctx({
        accion: 'MARCAR_NO_APLICA', rol: 'CONTROL_OWNER', usuarioId: OWNER,
        comentario: 'No hubo obras concluidas en el periodo, confirmado por Ingenieria.',
      }),
    );
    expect(r.estadoNuevo).toBe('NO_APLICA');
  });
});

describe('estados completos', () => {
  it('cerrado y no aplica cuentan como completos', () => {
    expect(estaCompleto('CERRADO')).toBe(true);
    expect(estaCompleto('NO_APLICA')).toBe(true);
  });

  it('vencido y aprobado no cuentan como completos', () => {
    expect(estaCompleto('VENCIDO')).toBe(false);
    expect(estaCompleto('APROBADO')).toBe(false);
    expect(estaCompleto('EN_REVISION')).toBe(false);
  });
});

describe('accionesDisponibles', () => {
  const actores = { asignadoAId: PREPARADOR, revisorId: REVISOR, ownerId: OWNER };

  it('el preparador solo puede enviar', () => {
    expect(accionesDisponibles('EN_EJECUCION', 'PREPARADOR', PREPARADOR, actores)).toEqual(['ENVIAR']);
  });

  it('el revisor puede aprobar u observar cuando esta en revision', () => {
    const acciones = accionesDisponibles('EN_REVISION', 'REVISOR', REVISOR, actores);
    expect(acciones).toContain('APROBAR');
    expect(acciones).toContain('RECHAZAR');
  });

  it('no ofrece aprobar al preparador aunque tenga rol de revisor', () => {
    expect(accionesDisponibles('EN_REVISION', 'REVISOR', PREPARADOR, actores)).toEqual([]);
  });

  it('el lider SOX puede reabrir un control cerrado', () => {
    expect(accionesDisponibles('CERRADO', 'SOX_MANAGER', 'u-sox', actores)).toContain('REABRIR');
  });

  it('el auditor no tiene ninguna accion disponible', () => {
    expect(accionesDisponibles('EN_REVISION', 'AUDITOR', 'u-aud', actores)).toEqual([]);
  });
});
