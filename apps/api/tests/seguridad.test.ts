import { describe, expect, it } from 'vitest';
import { hashPassword, validarPolitica, verificarPassword } from '../src/core/seguridad.js';
import { sanear } from '../src/core/auditoria.js';
import { tienePermiso } from '../src/core/permisos.js';

describe('hash de contrasenas', () => {
  it('verifica la contrasena correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('Cl4ve.Segura!2026');
    expect(await verificarPassword('Cl4ve.Segura!2026', hash)).toBe(true);
    expect(await verificarPassword('Cl4ve.Segura!2025', hash)).toBe(false);
  });

  it('genera hashes distintos para la misma contrasena (sal aleatoria)', async () => {
    const a = await hashPassword('Cl4ve.Segura!2026');
    const b = await hashPassword('Cl4ve.Segura!2026');
    expect(a).not.toBe(b);
  });

  it('no revienta ante un hash con formato invalido', async () => {
    expect(await verificarPassword('x', 'formato-corrupto')).toBe(false);
    expect(await verificarPassword('x', '')).toBe(false);
  });
});

describe('politica de contrasenas', () => {
  it('acepta una contrasena que cumple todos los requisitos', () => {
    expect(validarPolitica('Calidda.Sox.2026!')).toEqual([]);
  });

  it('rechaza contrasenas debiles indicando cada falla', () => {
    expect(validarPolitica('corta1!')).toContain('Debe tener al menos 12 caracteres.');
    expect(validarPolitica('todominusculas1!')).toContain('Debe incluir al menos una mayuscula.');
    expect(validarPolitica('SINMINUSCULAS1!')).toContain('Debe incluir al menos una minuscula.');
    expect(validarPolitica('SinNumerosAqui!')).toContain('Debe incluir al menos un numero.');
    expect(validarPolitica('SinEspeciales123')).toContain('Debe incluir al menos un caracter especial.');
  });
});

describe('saneamiento de la pista de auditoria', () => {
  it('enmascara los campos sensibles', () => {
    const saneado = sanear({
      email: 'usuario@calidda.com.pe',
      passwordHash: 'scrypt$abc$def',
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    }) as Record<string, unknown>;

    expect(saneado.email).toBe('usuario@calidda.com.pe');
    expect(saneado.passwordHash).toBe('***');
    expect(saneado.mfaSecret).toBe('***');
  });

  it('enmascara tambien en objetos anidados', () => {
    const saneado = sanear({ usuario: { nombres: 'Ana', passwordHash: 'x' } }) as Record<
      string,
      Record<string, unknown>
    >;
    expect(saneado.usuario?.passwordHash).toBe('***');
    expect(saneado.usuario?.nombres).toBe('Ana');
  });
});

describe('matriz de permisos', () => {
  it('el auditor solo lee', () => {
    expect(tienePermiso('AUDITOR', 'control.leer')).toBe(true);
    expect(tienePermiso('AUDITOR', 'auditoria.leer')).toBe(true);
    expect(tienePermiso('AUDITOR', 'control.escribir')).toBe(false);
    expect(tienePermiso('AUDITOR', 'periodo.cerrar')).toBe(false);
    expect(tienePermiso('AUDITOR', 'evidencia.subir')).toBe(false);
  });

  it('el preparador no puede gobernar la matriz ni los periodos', () => {
    expect(tienePermiso('PREPARADOR', 'evidencia.subir')).toBe(true);
    expect(tienePermiso('PREPARADOR', 'control.escribir')).toBe(false);
    expect(tienePermiso('PREPARADOR', 'periodo.abrir')).toBe(false);
    expect(tienePermiso('PREPARADOR', 'ejecucion.aprobar')).toBe(false);
  });

  it('solo el administrador gestiona usuarios', () => {
    expect(tienePermiso('ADMIN', 'usuario.escribir')).toBe(true);
    expect(tienePermiso('SOX_MANAGER', 'usuario.escribir')).toBe(false);
  });
});
