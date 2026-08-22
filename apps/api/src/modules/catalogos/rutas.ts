import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { auditar } from '../../core/auditoria.js';
import { PERMISOS } from '../../core/permisos.js';
import { ETIQUETA_FRECUENCIA } from '../../utils/frecuencia.js';
import { ETIQUETA_ESTADO } from '../../core/workflow.js';
import { ASERCIONES } from '../../config/constantes.js';

/** Catalogos de apoyo: empresas, procesos, feriados y diccionarios de la UI. */
export default async function rutasCatalogos(app: FastifyInstance): Promise<void> {
  app.get('/empresas', { preHandler: app.autenticar }, async () =>
    prisma.empresa.findMany({
      where: { activo: true },
      include: { _count: { select: { controles: true } } },
      orderBy: { nombre: 'asc' },
    }),
  );

  app.get('/procesos', { preHandler: app.autenticar }, async (req) => {
    const { empresaId } = z.object({ empresaId: z.string().optional() }).parse(req.query);
    return prisma.proceso.findMany({
      where: { activo: true, ...(empresaId ? { empresaId } : {}) },
      include: { subprocesos: { where: { activo: true } }, _count: { select: { controles: true } } },
      orderBy: { codigo: 'asc' },
    });
  });

  app.post('/procesos', { preHandler: app.exigir('control.escribir') }, async (req) => {
    const datos = z
      .object({
        empresaId: z.string(),
        codigo: z.string().min(2).max(20),
        nombre: z.string().min(3),
        descripcion: z.string().optional(),
        responsable: z.string().optional(),
      })
      .parse(req.body);
    const proceso = await prisma.proceso.create({ data: { ...datos, codigo: datos.codigo.toUpperCase() } });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'proceso.crear', entidad: 'Proceso', entidadId: proceso.id, despues: proceso,
    });
    return proceso;
  });

  app.get('/feriados', { preHandler: app.autenticar }, async (req) => {
    const { anio } = z.object({ anio: z.coerce.number().int().optional() }).parse(req.query);
    return prisma.feriado.findMany({
      where: anio
        ? { fecha: { gte: new Date(anio, 0, 1), lte: new Date(anio, 11, 31) } }
        : {},
      orderBy: { fecha: 'asc' },
    });
  });

  app.post('/feriados', { preHandler: app.exigir('config.escribir') }, async (req) => {
    const datos = z.object({ fecha: z.coerce.date(), nombre: z.string().min(3) }).parse(req.body);
    const feriado = await prisma.feriado.create({ data: datos });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'feriado.crear', entidad: 'Feriado', entidadId: feriado.id, despues: feriado,
    });
    return feriado;
  });

  app.delete('/feriados/:id', { preHandler: app.exigir('config.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const feriado = await prisma.feriado.delete({ where: { id } });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'feriado.eliminar', entidad: 'Feriado', entidadId: id, antes: feriado,
    });
    return { ok: true };
  });

  /** Diccionarios para poblar selects y leyendas sin duplicar textos en el front. */
  app.get('/diccionarios', { preHandler: app.autenticar }, async () => ({
    estadosEjecucion: ETIQUETA_ESTADO,
    frecuencias: ETIQUETA_FRECUENCIA,
    aserciones: ASERCIONES,
    permisosPorRol: PERMISOS,
  }));
}
