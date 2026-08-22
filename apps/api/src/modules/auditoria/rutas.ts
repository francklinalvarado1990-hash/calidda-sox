import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { MAX_PAGE_SIZE } from '../../config/constantes.js';

/**
 * Consulta de la pista de auditoria. Solo lectura por diseno: no existe endpoint
 * de modificacion ni de borrado, ni siquiera para el rol ADMIN.
 */
export default async function rutasAuditoria(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.exigir('auditoria.leer') }, async (req) => {
    const q = z
      .object({
        accion: z.string().optional(),
        entidad: z.string().optional(),
        entidadId: z.string().optional(),
        usuarioId: z.string().optional(),
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        tamano: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(100),
      })
      .parse(req.query);

    const where: Prisma.AuditLogWhereInput = {
      ...(q.accion ? { accion: { startsWith: q.accion } } : {}),
      ...(q.entidad ? { entidad: q.entidad } : {}),
      ...(q.entidadId ? { entidadId: q.entidadId } : {}),
      ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
      ...(q.desde || q.hasta
        ? { creadoEn: { ...(q.desde ? { gte: q.desde } : {}), ...(q.hasta ? { lte: q.hasta } : {}) } }
        : {}),
    };

    const [total, datos] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { usuario: { select: { id: true, nombres: true, apellidos: true, email: true } } },
        orderBy: { creadoEn: 'desc' },
        skip: (q.pagina - 1) * q.tamano,
        take: q.tamano,
      }),
    ]);
    return { total, pagina: q.pagina, tamano: q.tamano, datos };
  });

  /** Historial completo de una entidad: la vista que pide el auditor externo. */
  app.get('/entidad/:entidad/:id', { preHandler: app.exigir('auditoria.leer') }, async (req) => {
    const { entidad, id } = z.object({ entidad: z.string(), id: z.string() }).parse(req.params);
    return prisma.auditLog.findMany({
      where: { entidad, entidadId: id },
      include: { usuario: { select: { nombres: true, apellidos: true, email: true } } },
      orderBy: { creadoEn: 'asc' },
    });
  });

  /** Bitacora de correos enviados: evidencia de que se notifico al responsable. */
  app.get('/recordatorios', { preHandler: app.exigir('auditoria.leer') }, async (req) => {
    const q = z
      .object({
        ejecucionId: z.string().optional(),
        periodoId: z.string().optional(),
        estado: z.enum(['PENDIENTE', 'ENVIADO', 'ERROR']).optional(),
        tamano: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(100),
      })
      .parse(req.query);

    return prisma.recordatorio.findMany({
      where: {
        ...(q.ejecucionId ? { ejecucionId: q.ejecucionId } : {}),
        ...(q.periodoId ? { periodoId: q.periodoId } : {}),
        ...(q.estado ? { estado: q.estado } : {}),
      },
      select: {
        id: true, tipo: true, destinatario: true, asunto: true, estado: true,
        error: true, enviadoEn: true, creadoEn: true,
      },
      orderBy: { creadoEn: 'desc' },
      take: q.tamano,
    });
  });
}
