import type { Rol } from '@prisma/client';
import { prohibido } from './errores.js';

/**
 * Matriz de permisos por rol. Explicita a proposito: en una revision SOX se debe
 * poder responder "quien puede hacer que" leyendo un solo archivo.
 */
export const PERMISOS = {
  'usuario.leer': ['ADMIN', 'SOX_MANAGER', 'AUDITOR'],
  'usuario.escribir': ['ADMIN'],
  'usuario.rol.asignar': ['ADMIN'],
  'control.leer': ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER', 'REVISOR', 'PREPARADOR', 'AUDITOR'],
  'control.escribir': ['ADMIN', 'SOX_MANAGER'],
  'periodo.abrir': ['ADMIN', 'SOX_MANAGER'],
  'periodo.cerrar': ['ADMIN', 'SOX_MANAGER'],
  'ejecucion.leer': ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER', 'REVISOR', 'PREPARADOR', 'AUDITOR'],
  'ejecucion.ejecutar': ['ADMIN', 'SOX_MANAGER', 'PREPARADOR', 'CONTROL_OWNER', 'REVISOR'],
  'ejecucion.revisar': ['ADMIN', 'SOX_MANAGER', 'REVISOR', 'CONTROL_OWNER'],
  'ejecucion.aprobar': ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER'],
  'ejecucion.reasignar': ['ADMIN', 'SOX_MANAGER'],
  'ejecucion.reabrir': ['ADMIN', 'SOX_MANAGER'],
  'evidencia.subir': ['ADMIN', 'SOX_MANAGER', 'PREPARADOR', 'CONTROL_OWNER', 'REVISOR'],
  'evidencia.anular': ['ADMIN', 'SOX_MANAGER'],
  'deficiencia.escribir': ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER'],
  'auditoria.leer': ['ADMIN', 'SOX_MANAGER', 'AUDITOR'],
  'config.escribir': ['ADMIN', 'SOX_MANAGER'],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export const tienePermiso = (rol: Rol, permiso: Permiso): boolean =>
  (PERMISOS[permiso] as readonly Rol[]).includes(rol);

export function exigirPermiso(rol: Rol, permiso: Permiso): void {
  if (!tienePermiso(rol, permiso)) {
    throw prohibido(`El rol ${rol} no tiene el permiso "${permiso}".`);
  }
}

/** Roles que solo observan: nunca deben poder mutar datos. */
export const ROLES_SOLO_LECTURA: readonly Rol[] = ['AUDITOR'];
