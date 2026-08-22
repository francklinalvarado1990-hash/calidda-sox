import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { noEncontrado } from '../../core/errores.js';
import {
  abrirPeriodo,
  cerrarPeriodo,
  pendientesArrastrados,
  reabrirPeriodo,
  resumenPeriodo,
} from './servicio.js';

const actorDe = (req: { usuario?: { id: string; email: string } }) => ({
  id: req.usuario!.id,
  email: req.usuario!.email,
});

export default async function rutasPeriodos(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({
        empresaId: z.string().optional(),
        anio: z.coerce.number().int().optional(),
        estado: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(60).default(24),
      })
      .parse(req.query);

    const periodos = await prisma.periodo.findMany({
      where: {
        ...(q.empresaId ? { empresaId: q.empresaId } : {}),
        ...(q.anio ? { anio: q.anio } : {}),
        ...(q.estado ? { estado: q.estado as never } : {}),
      },
      include: {
        empresa: { select: { id: true, codigo: true, nombre: true } },
        _count: { select: { ejecuciones: true } },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: q.limite,
    });

    // Se adjunta el avance para pintar la lista sin una segunda llamada.
    const conResumen = await Promise.all(
      periodos.map(async (p) => ({ ...p, resumen: await resumenPeriodo(p.id) })),
    );
    return conResumen;
  });

  app.get('/:id', { preHandler: app.autenticar }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const periodo = await prisma.periodo.findUnique({
      where: { id },
      include: { empresa: true },
    });
    if (!periodo) throw noEncontrado('El periodo');
    return { ...periodo, resumen: await resumenPeriodo(id) };
  });

  app.post('/abrir', { preHandler: app.exigir('periodo.abrir') }, async (req) => {
    const datos = z
      .object({
        empresaId: z.string(),
        anio: z.number().int().min(2000).max(2100),
        mes: z.number().int().min(1).max(12),
        notificar: z.boolean().default(true),
      })
      .parse(req.body);

    return abrirPeriodo(datos.empresaId, datos.anio, datos.mes, actorDe(req), {
      notificar: datos.notificar,
    });
  });

  app.post('/:id/cerrar', { preHandler: app.exigir('periodo.cerrar') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = z
      .object({
        forzar: z.boolean().default(false),
        nota: z.string().optional(),
        notificar: z.boolean().default(true),
      })
      .parse(req.body ?? {});

    return cerrarPeriodo(id, actorDe(req), datos);
  });

  app.post('/:id/reabrir', { preHandler: app.exigir('periodo.abrir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(10) }).parse(req.body);
    return reabrirPeriodo(id, motivo, actorDe(req));
  });

  app.get('/pendientes/arrastrados', { preHandler: app.autenticar }, async (req) => {
    const { empresaId } = z.object({ empresaId: z.string().optional() }).parse(req.query);
    return pendientesArrastrados(empresaId);
  });
}
