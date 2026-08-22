import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { MAX_PAGE_SIZE } from '../../config/constantes.js';
import { accionesDisponibles } from '../../core/workflow.js';
import { cargarEjecucion, ejecutarAccion, guardarAvance } from './servicio.js';

const ESTADOS = [
  'PENDIENTE', 'EN_EJECUCION', 'EN_REVISION', 'OBSERVADO',
  'APROBADO', 'CERRADO', 'NO_APLICA', 'VENCIDO',
] as const;
const RESULTADOS = ['EFECTIVO', 'EFECTIVO_CON_OBSERVACIONES', 'DEFICIENTE', 'NO_APLICA'] as const;
const ACCIONES = ['ENVIAR', 'APROBAR', 'RECHAZAR', 'REASIGNAR', 'REABRIR', 'MARCAR_NO_APLICA'] as const;

const actorDe = (req: { usuario?: { id: string; email: string; rol: never } }) => ({
  id: req.usuario!.id,
  email: req.usuario!.email,
  rol: req.usuario!.rol,
});

export default async function rutasEjecuciones(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.exigir('ejecucion.leer') }, async (req) => {
    const q = z
      .object({
        periodoId: z.string().optional(),
        empresaId: z.string().optional(),
        estado: z.enum(ESTADOS).optional(),
        asignadoAId: z.string().optional(),
        /** `mios=true` filtra por lo que le toca hacer al usuario en sesion. */
        mios: z.enum(['true', 'false']).optional(),
        soloPendientes: z.enum(['true', 'false']).optional(),
        marcadoPendiente: z.enum(['true', 'false']).optional(),
        buscar: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        tamano: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
      })
      .parse(req.query);

    const usuarioId = req.usuario!.id;
    const where: Prisma.EjecucionWhereInput = {
      ...(q.periodoId ? { periodoId: q.periodoId } : {}),
      ...(q.empresaId ? { periodo: { empresaId: q.empresaId } } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.asignadoAId ? { asignadoAId: q.asignadoAId } : {}),
      ...(q.marcadoPendiente ? { marcadoPendiente: q.marcadoPendiente === 'true' } : {}),
      ...(q.soloPendientes === 'true' ? { estado: { notIn: ['CERRADO', 'NO_APLICA'] } } : {}),
      ...(q.mios === 'true'
        ? { OR: [{ asignadoAId: usuarioId }, { revisorId: usuarioId }, { ownerId: usuarioId }] }
        : {}),
      ...(q.buscar
        ? {
            OR: [
              { codigoControl: { contains: q.buscar, mode: 'insensitive' } },
              { nombreControl: { contains: q.buscar, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, datos] = await prisma.$transaction([
      prisma.ejecucion.count({ where }),
      prisma.ejecucion.findMany({
        where,
        select: {
          id: true, codigoControl: true, nombreControl: true, estado: true, resultado: true,
          fechaLimite: true, fechaCierre: true, marcadoPendiente: true, diasAtrasoAlCierre: true,
          asignadoAId: true, revisorId: true, ownerId: true,
          asignadoA: { select: { id: true, nombres: true, apellidos: true, email: true } },
          control: { select: { esClave: true, frecuencia: true, proceso: { select: { nombre: true } } } },
          periodo: { select: { id: true, anio: true, mes: true, estado: true, empresa: { select: { codigo: true, nombre: true } } } },
          _count: { select: { evidencias: true, deficiencias: true } },
        },
        orderBy: [{ fechaLimite: 'asc' }, { codigoControl: 'asc' }],
        skip: (q.pagina - 1) * q.tamano,
        take: q.tamano,
      }),
    ]);

    return {
      total,
      pagina: q.pagina,
      tamano: q.tamano,
      datos: datos.map((e) => ({
        ...e,
        accionesDisponibles: accionesDisponibles(e.estado, req.usuario!.rol, usuarioId, {
          asignadoAId: e.asignadoAId,
          revisorId: e.revisorId,
          ownerId: e.ownerId,
        }),
      })),
    };
  });

  app.get('/:id', { preHandler: app.exigir('ejecucion.leer') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const ejecucion = await cargarEjecucion(id);
    return {
      ...ejecucion,
      accionesDisponibles: accionesDisponibles(ejecucion.estado, req.usuario!.rol, req.usuario!.id, {
        asignadoAId: ejecucion.asignadoAId,
        revisorId: ejecucion.revisorId,
        ownerId: ejecucion.ownerId,
      }),
    };
  });

  app.patch('/:id', { preHandler: app.exigir('ejecucion.ejecutar') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = z
      .object({
        conclusion: z.string().optional(),
        resultado: z.enum(RESULTADOS).optional(),
        muestraTamano: z.number().int().min(0).nullable().optional(),
        excepciones: z.number().int().min(0).nullable().optional(),
      })
      .parse(req.body);
    return guardarAvance(id, datos, actorDe(req as never));
  });

  app.post('/:id/accion', { preHandler: app.exigir('ejecucion.ejecutar') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = z
      .object({
        accion: z.enum(ACCIONES),
        comentario: z.string().optional(),
        resultado: z.enum(RESULTADOS).optional(),
        nuevoAsignadoId: z.string().optional(),
      })
      .parse(req.body);

    return ejecutarAccion(id, datos.accion, actorDe(req as never), {
      comentario: datos.comentario,
      resultado: datos.resultado,
      nuevoAsignadoId: datos.nuevoAsignadoId,
    });
  });

  /** Bandeja personal: lo que el usuario en sesion tiene que atender hoy. */
  app.get('/bandeja/mia', { preHandler: app.autenticar }, async (req) => {
    const usuarioId = req.usuario!.id;
    const [porHacer, porRevisar, porAprobar] = await prisma.$transaction([
      prisma.ejecucion.findMany({
        where: {
          asignadoAId: usuarioId,
          estado: { in: ['PENDIENTE', 'EN_EJECUCION', 'OBSERVADO', 'VENCIDO'] },
          periodo: { estado: { in: ['ABIERTO', 'EN_CIERRE'] } },
        },
        select: bandejaSelect,
        orderBy: { fechaLimite: 'asc' },
      }),
      prisma.ejecucion.findMany({
        where: { revisorId: usuarioId, estado: 'EN_REVISION' },
        select: bandejaSelect,
        orderBy: { fechaLimite: 'asc' },
      }),
      prisma.ejecucion.findMany({
        where: { ownerId: usuarioId, estado: 'APROBADO' },
        select: bandejaSelect,
        orderBy: { fechaLimite: 'asc' },
      }),
    ]);
    return { porHacer, porRevisar, porAprobar };
  });
}

const bandejaSelect = {
  id: true, codigoControl: true, nombreControl: true, estado: true, fechaLimite: true,
  marcadoPendiente: true,
  periodo: { select: { id: true, anio: true, mes: true, empresa: { select: { codigo: true } } } },
} satisfies Prisma.EjecucionSelect;
