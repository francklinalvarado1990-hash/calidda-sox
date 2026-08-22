import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface EntradaAuditoria {
  usuarioId?: string | null;
  actorEmail?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/** Campos que jamas deben quedar registrados en la pista de auditoria. */
const CAMPOS_SENSIBLES = new Set([
  'passwordHash',
  'password',
  'passwordActual',
  'passwordNueva',
  'mfaSecret',
  'tokenHash',
  'refreshToken',
  'accessToken',
  'S3_SECRET_ACCESS_KEY',
]);

/** Elimina secretos antes de persistir el snapshot. */
export function sanear(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (Array.isArray(valor)) return valor.map((v) => sanear(v)) as Prisma.InputJsonValue;
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPOS_SENSIBLES.has(k)) {
        salida[k] = '***';
      } else if (v instanceof Date) {
        salida[k] = v.toISOString();
      } else if (v && typeof v === 'object') {
        salida[k] = sanear(v);
      } else {
        salida[k] = v;
      }
    }
    return salida as Prisma.InputJsonValue;
  }
  return valor as Prisma.InputJsonValue;
}

/**
 * Registra una accion en la pista de auditoria (append-only).
 * Nunca debe interrumpir la operacion de negocio: si falla, solo se loguea.
 */
export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        usuarioId: entrada.usuarioId ?? null,
        actorEmail: entrada.actorEmail ?? null,
        accion: entrada.accion,
        entidad: entrada.entidad,
        entidadId: entrada.entidadId ?? null,
        antes: sanear(entrada.antes),
        despues: sanear(entrada.despues),
        ip: entrada.ip ?? null,
        userAgent: entrada.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('[auditoria] no se pudo registrar la accion', entrada.accion, err);
  }
}
