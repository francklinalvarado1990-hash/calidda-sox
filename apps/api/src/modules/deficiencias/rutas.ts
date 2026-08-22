import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { auditar } from '../../core/auditoria.js';
import { conflicto, invalido, noEncontrado } from '../../core/errores.js';

const SEVERIDADES = [
  'OBSERVACION', 'DEFICIENCIA', 'DEFICIENCIA_SIGNIFICATIVA', 'DEBILIDAD_MATERIAL',
] as const;
const ESTADOS = ['ABIERTA', 'EN_REMEDIACION', 'EN_VALIDACION', 'CERRADA', 'ACEPTADA'] as const;

const incluir = {
  responsable: { select: { id: true, nombres: true, apellidos: true, email: true } },
  ejecucion: {
    select: {
      id: true, codigoControl: true, nombreControl: true,
      periodo: { select: { anio: true, mes: true, empresa: { select: { codigo: true, nombre: true } } } },
    },
  },
} satisfies Prisma.DeficienciaInclude;

/** Correlativo legible: DEF-2026-0007. Facilita el seguimiento con auditoria. */
async function siguienteCodigo(): Promise<string> {
  const anio = new Date().getFullYear();
  const cantidad = await prisma.deficiencia.count({
    where: { codigo: { startsWith: `DEF-${anio}-` } },
  });
  return `DEF-${anio}-${String(cantidad + 1).padStart(4, '0')}`;
}

export default async function rutasDeficiencias(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.exigir('ejecucion.leer') }, async (req) => {
    const q = z
      .object({
        estado: z.enum(ESTADOS).optional(),
        severidad: z.enum(SEVERIDADES).optional(),
        empresaId: z.string().optional(),
        responsableId: z.string().optional(),
        vencidas: z.enum(['true']).optional(),
      })
      .parse(req.query);

    return prisma.deficiencia.findMany({
      where: {
        ...(q.estado ? { estado: q.estado } : {}),
        ...(q.severidad ? { severidad: q.severidad } : {}),
        ...(q.responsableId ? { responsableId: q.responsableId } : {}),
        ...(q.empresaId ? { ejecucion: { periodo: { empresaId: q.empresaId } } } : {}),
        ...(q.vencidas
          ? { fechaCompromiso: { lt: new Date() }, estado: { notIn: ['CERRADA', 'ACEPTADA'] } }
          : {}),
      },
      include: incluir,
      orderBy: [{ severidad: 'desc' }, { creadoEn: 'desc' }],
    });
  });

  app.post('/', { preHandler: app.exigir('deficiencia.escribir') }, async (req) => {
    const datos = z
      .object({
        ejecucionId: z.string(),
        severidad: z.enum(SEVERIDADES),
        descripcion: z.string().min(20, 'Describa la deficiencia con detalle suficiente'),
        causaRaiz: z.string().optional(),
        impacto: z.string().optional(),
        planAccion: z.string().optional(),
        responsableId: z.string().optional(),
        fechaCompromiso: z.coerce.date().optional(),
      })
      .parse(req.body);

    const ejecucion = await prisma.ejecucion.findUnique({ where: { id: datos.ejecucionId } });
    if (!ejecucion) throw noEncontrado('La ejecucion del control');

    // Una deficiencia significativa o material exige plan y responsable desde el inicio.
    if (
      ['DEFICIENCIA_SIGNIFICATIVA', 'DEBILIDAD_MATERIAL'].includes(datos.severidad) &&
      (!datos.planAccion || !datos.responsableId || !datos.fechaCompromiso)
    ) {
      throw invalido(
        'Una deficiencia significativa o debilidad material requiere plan de accion, responsable y fecha compromiso.',
      );
    }

    const deficiencia = await prisma.deficiencia.create({
      data: { ...datos, codigo: await siguienteCodigo() },
      include: incluir,
    });

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'deficiencia.crear', entidad: 'Deficiencia', entidadId: deficiencia.id,
      despues: deficiencia, ip: req.ip,
    });
    return deficiencia;
  });

  app.patch('/:id', { preHandler: app.exigir('deficiencia.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = z
      .object({
        severidad: z.enum(SEVERIDADES).optional(),
        estado: z.enum(ESTADOS).optional(),
        descripcion: z.string().min(20).optional(),
        causaRaiz: z.string().optional(),
        impacto: z.string().optional(),
        planAccion: z.string().optional(),
        responsableId: z.string().nullable().optional(),
        fechaCompromiso: z.coerce.date().nullable().optional(),
        evidenciaCierre: z.string().optional(),
      })
      .parse(req.body);

    const antes = await prisma.deficiencia.findUnique({ where: { id } });
    if (!antes) throw noEncontrado('La deficiencia');

    // No se cierra una deficiencia sin dejar constancia de como se remedio.
    if (datos.estado === 'CERRADA' && !(datos.evidenciaCierre ?? antes.evidenciaCierre)) {
      throw conflicto('Para cerrar la deficiencia debe registrar la evidencia de remediacion.');
    }

    const despues = await prisma.deficiencia.update({
      where: { id },
      data: {
        ...datos,
        ...(datos.estado === 'CERRADA' ? { fechaCierre: new Date() } : {}),
      },
      include: incluir,
    });

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'deficiencia.actualizar', entidad: 'Deficiencia', entidadId: id,
      antes, despues, ip: req.ip,
    });
    return despues;
  });
}
