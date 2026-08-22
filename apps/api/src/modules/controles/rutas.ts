import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { auditar, sanear } from '../../core/auditoria.js';
import { conflicto, invalido, noEncontrado } from '../../core/errores.js';
import { MAX_PAGE_SIZE } from '../../config/constantes.js';

const FRECUENCIAS = [
  'DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL',
  'TRIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'EVENTUAL',
] as const;
const TIPOS = ['PREVENTIVO', 'DETECTIVO'] as const;
const NATURALEZAS = ['MANUAL', 'AUTOMATICO', 'HIBRIDO', 'ITGC', 'IPE'] as const;

const camposControl = z.object({
  empresaId: z.string(),
  procesoId: z.string(),
  subprocesoId: z.string().nullable().optional(),
  codigo: z.string().min(3).max(40).regex(/^[A-Z0-9\-_.]+$/i, 'Use letras, numeros y guiones'),
  nombre: z.string().min(5),
  descripcion: z.string().min(20, 'Describa el control con suficiente detalle para un tercero'),
  objetivo: z.string().optional(),
  riesgo: z.string().optional(),
  tipo: z.enum(TIPOS),
  naturaleza: z.enum(NATURALEZAS),
  frecuencia: z.enum(FRECUENCIAS),
  mesAncla: z.number().int().min(1).max(12).default(1),
  esClave: z.boolean().default(false),
  aserciones: z.array(z.string()).default([]),
  cuentasContables: z.array(z.string()).default([]),
  sistemas: z.array(z.string()).default([]),
  diasHabilesPlazo: z.number().int().min(1).max(60).default(5),
  requiereRevision: z.boolean().default(true),
  requiereAprobacionOwner: z.boolean().default(true),
  ownerId: z.string().nullable().optional(),
  preparadorId: z.string().nullable().optional(),
  revisorId: z.string().nullable().optional(),
  evidenciaRequerida: z.string().optional(),
  procedimiento: z.string().optional(),
});

const incluir = {
  empresa: { select: { id: true, codigo: true, nombre: true } },
  proceso: { select: { id: true, codigo: true, nombre: true } },
  subproceso: { select: { id: true, codigo: true, nombre: true } },
  owner: { select: { id: true, nombres: true, apellidos: true, email: true } },
  preparador: { select: { id: true, nombres: true, apellidos: true, email: true } },
  revisor: { select: { id: true, nombres: true, apellidos: true, email: true } },
} satisfies Prisma.ControlInclude;

/**
 * Valida segregacion de funciones ya en la definicion del control: si el
 * preparador es la misma persona que el revisor, el control nace inauditable.
 */
function validarSoD(datos: {
  preparadorId?: string | null;
  revisorId?: string | null;
  ownerId?: string | null;
  requiereRevision?: boolean;
}): void {
  if (datos.requiereRevision === false) return;
  if (datos.preparadorId && datos.preparadorId === datos.revisorId) {
    throw invalido(
      'Segregacion de funciones: el preparador y el revisor no pueden ser la misma persona.',
    );
  }
  if (datos.revisorId && datos.revisorId === datos.ownerId) {
    throw invalido(
      'Segregacion de funciones: el revisor y el dueno del control no pueden ser la misma persona.',
    );
  }
}

export default async function rutasControles(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.exigir('control.leer') }, async (req) => {
    const q = z
      .object({
        empresaId: z.string().optional(),
        procesoId: z.string().optional(),
        frecuencia: z.enum(FRECUENCIAS).optional(),
        esClave: z.enum(['true', 'false']).optional(),
        activo: z.enum(['true', 'false']).default('true'),
        buscar: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        tamano: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
      })
      .parse(req.query);

    const where: Prisma.ControlWhereInput = {
      activo: q.activo === 'true',
      ...(q.empresaId ? { empresaId: q.empresaId } : {}),
      ...(q.procesoId ? { procesoId: q.procesoId } : {}),
      ...(q.frecuencia ? { frecuencia: q.frecuencia } : {}),
      ...(q.esClave ? { esClave: q.esClave === 'true' } : {}),
      ...(q.buscar
        ? {
            OR: [
              { codigo: { contains: q.buscar, mode: 'insensitive' } },
              { nombre: { contains: q.buscar, mode: 'insensitive' } },
              { descripcion: { contains: q.buscar, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, datos] = await prisma.$transaction([
      prisma.control.count({ where }),
      prisma.control.findMany({
        where,
        include: incluir,
        orderBy: [{ empresaId: 'asc' }, { codigo: 'asc' }],
        skip: (q.pagina - 1) * q.tamano,
        take: q.tamano,
      }),
    ]);
    return { total, pagina: q.pagina, tamano: q.tamano, datos };
  });

  app.get('/:id', { preHandler: app.exigir('control.leer') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const control = await prisma.control.findUnique({
      where: { id },
      include: {
        ...incluir,
        versiones: { orderBy: { version: 'desc' }, take: 20 },
        ejecuciones: {
          orderBy: { creadoEn: 'desc' },
          take: 12,
          select: {
            id: true, estado: true, resultado: true, fechaLimite: true, fechaCierre: true,
            periodo: { select: { anio: true, mes: true } },
          },
        },
      },
    });
    if (!control) throw noEncontrado('El control');
    return control;
  });

  app.post('/', { preHandler: app.exigir('control.escribir') }, async (req) => {
    const datos = camposControl.parse(req.body);
    validarSoD(datos);

    const codigo = datos.codigo.toUpperCase();
    const duplicado = await prisma.control.findUnique({
      where: { empresaId_codigo: { empresaId: datos.empresaId, codigo } },
    });
    if (duplicado) throw conflicto(`Ya existe el control ${codigo} en esa empresa.`);

    const control = await prisma.control.create({
      data: { ...datos, codigo, subprocesoId: datos.subprocesoId ?? null },
      include: incluir,
    });

    await prisma.controlVersion.create({
      data: {
        controlId: control.id,
        version: 1,
        snapshot: sanear(control) as Prisma.InputJsonValue,
        motivo: 'Alta del control en la matriz',
        creadoPorId: req.usuario!.id,
      },
    });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'control.crear', entidad: 'Control', entidadId: control.id, despues: control, ip: req.ip,
    });
    return control;
  });

  app.patch('/:id', { preHandler: app.exigir('control.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = camposControl.partial().extend({ motivo: z.string().min(10, 'Sustente el cambio') }).parse(req.body);
    const { motivo, ...cambios } = datos;

    const antes = await prisma.control.findUnique({ where: { id }, include: incluir });
    if (!antes) throw noEncontrado('El control');

    validarSoD({
      preparadorId: cambios.preparadorId ?? antes.preparadorId,
      revisorId: cambios.revisorId ?? antes.revisorId,
      ownerId: cambios.ownerId ?? antes.ownerId,
      requiereRevision: cambios.requiereRevision ?? antes.requiereRevision,
    });

    const despues = await prisma.control.update({
      where: { id },
      data: {
        ...cambios,
        ...(cambios.codigo ? { codigo: cambios.codigo.toUpperCase() } : {}),
        version: { increment: 1 },
      },
      include: incluir,
    });

    // Cada cambio de la matriz genera una version: es evidencia de gobierno.
    const diferencias = Object.fromEntries(
      Object.entries(cambios)
        .filter(([k, v]) => JSON.stringify((antes as Record<string, unknown>)[k]) !== JSON.stringify(v))
        .map(([k, v]) => [k, { antes: (antes as Record<string, unknown>)[k], despues: v }]),
    );

    await prisma.controlVersion.create({
      data: {
        controlId: id,
        version: despues.version,
        snapshot: sanear(despues) as Prisma.InputJsonValue,
        cambios: sanear(diferencias) as Prisma.InputJsonValue,
        motivo,
        creadoPorId: req.usuario!.id,
      },
    });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'control.actualizar', entidad: 'Control', entidadId: id,
      antes, despues, ip: req.ip,
    });
    return despues;
  });

  /** Baja logica. Un control SOX nunca se elimina: se da de baja con fecha. */
  app.post('/:id/desactivar', { preHandler: app.exigir('control.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(10) }).parse(req.body);

    const abiertas = await prisma.ejecucion.count({
      where: { controlId: id, estado: { notIn: ['CERRADO', 'NO_APLICA'] } },
    });
    if (abiertas > 0) {
      throw conflicto(
        `El control tiene ${abiertas} ejecucion(es) abierta(s). Regularicelas antes de darlo de baja.`,
      );
    }

    const control = await prisma.control.update({
      where: { id },
      data: { activo: false, vigenteHasta: new Date(), version: { increment: 1 } },
    });
    await prisma.controlVersion.create({
      data: {
        controlId: id, version: control.version,
        snapshot: sanear(control) as Prisma.InputJsonValue,
        motivo: `Baja: ${motivo}`, creadoPorId: req.usuario!.id,
      },
    });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'control.desactivar', entidad: 'Control', entidadId: id, despues: { motivo }, ip: req.ip,
    });
    return control;
  });
}
