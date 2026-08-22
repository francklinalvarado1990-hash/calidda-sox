import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { ahora, periodoAnterior, rangoPeriodo } from '../../utils/fechas.js';
import { nombreMes } from '../../config/constantes.js';
import { resumenPeriodo } from '../periodos/servicio.js';

/**
 * Metricas del tablero. Todas las consultas se resuelven con agregaciones en la
 * base: el tablero debe seguir respondiendo con anios de historia cargada.
 */
export default async function rutasDashboard(app: FastifyInstance): Promise<void> {
  /** Panorama del periodo vigente (o del indicado). */
  app.get('/resumen', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({
        empresaId: z.string().optional(),
        anio: z.coerce.number().int().optional(),
        mes: z.coerce.number().int().min(1).max(12).optional(),
      })
      .parse(req.query);

    const hoy = ahora();
    const anio = q.anio ?? hoy.year;
    const mes = q.mes ?? hoy.month;

    const periodos = await prisma.periodo.findMany({
      where: { anio, mes, ...(q.empresaId ? { empresaId: q.empresaId } : {}) },
      include: { empresa: { select: { id: true, codigo: true, nombre: true } } },
    });

    const porEmpresa = await Promise.all(
      periodos.map(async (p) => ({
        periodoId: p.id,
        empresa: p.empresa,
        estado: p.estado,
        fechaLimiteCierre: p.fechaLimiteCierre,
        ...(await resumenPeriodo(p.id)),
      })),
    );

    const consolidado = porEmpresa.reduce(
      (acc, p) => ({
        total: acc.total + p.total,
        completos: acc.completos + p.completos,
        abiertos: acc.abiertos + p.abiertos,
        vencidos: acc.vencidos + p.vencidos,
        deficienciasAbiertas: acc.deficienciasAbiertas + p.deficienciasAbiertas,
      }),
      { total: 0, completos: 0, abiertos: 0, vencidos: 0, deficienciasAbiertas: 0 },
    );

    return {
      anio,
      mes,
      etiquetaPeriodo: `${nombreMes(mes)} ${anio}`,
      porEmpresa,
      consolidado: {
        ...consolidado,
        porcentajeAvance: consolidado.total
          ? Math.round((consolidado.completos / consolidado.total) * 1000) / 10
          : 0,
      },
    };
  });

  /** Serie historica de cumplimiento para el grafico de tendencia. */
  app.get('/tendencia', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({
        empresaId: z.string().optional(),
        meses: z.coerce.number().int().min(3).max(36).default(12),
      })
      .parse(req.query);

    const hoy = ahora();
    let cursor = { anio: hoy.year, mes: hoy.month };
    const claves: { anio: number; mes: number }[] = [];
    for (let i = 0; i < q.meses; i += 1) {
      claves.unshift({ ...cursor });
      cursor = periodoAnterior(cursor.anio, cursor.mes);
    }

    const periodos = await prisma.periodo.findMany({
      where: {
        ...(q.empresaId ? { empresaId: q.empresaId } : {}),
        OR: claves.map((c) => ({ anio: c.anio, mes: c.mes })),
      },
      select: { id: true, anio: true, mes: true, estado: true },
    });

    const agregados = await prisma.ejecucion.groupBy({
      by: ['periodoId', 'estado'],
      where: { periodoId: { in: periodos.map((p) => p.id) } },
      _count: { _all: true },
    });

    return claves.map((c) => {
      const delMes = periodos.filter((p) => p.anio === c.anio && p.mes === c.mes);
      const ids = new Set(delMes.map((p) => p.id));
      const filas = agregados.filter((a) => ids.has(a.periodoId));

      const total = filas.reduce((s, f) => s + f._count._all, 0);
      const completos = filas
        .filter((f) => f.estado === 'CERRADO' || f.estado === 'NO_APLICA')
        .reduce((s, f) => s + f._count._all, 0);
      const vencidos = filas
        .filter((f) => f.estado === 'VENCIDO')
        .reduce((s, f) => s + f._count._all, 0);

      return {
        anio: c.anio,
        mes: c.mes,
        etiqueta: `${nombreMes(c.mes).slice(0, 3)} ${String(c.anio).slice(2)}`,
        total,
        completos,
        vencidos,
        cumplimiento: total ? Math.round((completos / total) * 1000) / 10 : null,
        estadoPeriodo: delMes[0]?.estado ?? null,
      };
    });
  });

  /** Avance por proceso: identifica los cuellos de botella del cierre. */
  app.get('/por-proceso', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({
        periodoId: z.string().optional(),
        empresaId: z.string().optional(),
        anio: z.coerce.number().int().optional(),
        mes: z.coerce.number().int().min(1).max(12).optional(),
      })
      .parse(req.query);

    // Sin periodo explicito se usa el mes en curso, sin filtrar por estado: si se
    // filtrara por periodos abiertos, este grafico quedaria vacio en cuanto se
    // cierra el mes y contradiria al resto del tablero, que si lo muestra.
    const hoy = ahora();
    const periodo = q.periodoId
      ? { periodoId: q.periodoId }
      : { periodo: { anio: q.anio ?? hoy.year, mes: q.mes ?? hoy.month, ...(q.empresaId ? { empresaId: q.empresaId } : {}) } };

    const ejecuciones = await prisma.ejecucion.findMany({
      where: periodo,
      select: {
        estado: true,
        control: { select: { proceso: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });

    // Se agrupa por codigo de proceso, no por id: cada empresa tiene su propia
    // fila de procesos con el mismo codigo, y agrupar por id duplicaria cada
    // barra en la vista consolidada.
    const mapa = new Map<string, { proceso: string; codigo: string; total: number; completos: number; vencidos: number }>();
    for (const e of ejecuciones) {
      const p = e.control.proceso;
      const actual = mapa.get(p.codigo) ?? { proceso: p.nombre, codigo: p.codigo, total: 0, completos: 0, vencidos: 0 };
      actual.total += 1;
      if (e.estado === 'CERRADO' || e.estado === 'NO_APLICA') actual.completos += 1;
      if (e.estado === 'VENCIDO') actual.vencidos += 1;
      mapa.set(p.codigo, actual);
    }

    return [...mapa.values()]
      .map((v) => ({ ...v, cumplimiento: v.total ? Math.round((v.completos / v.total) * 1000) / 10 : 0 }))
      .sort((a, b) => a.cumplimiento - b.cumplimiento);
  });

  /** Ranking de responsables: quien esta al dia y quien concentra el atraso. */
  app.get('/por-responsable', { preHandler: app.exigir('auditoria.leer') }, async (req) => {
    const q = z.object({ periodoId: z.string().optional() }).parse(req.query);

    const ejecuciones = await prisma.ejecucion.findMany({
      where: {
        ...(q.periodoId ? { periodoId: q.periodoId } : { periodo: { estado: { in: ['ABIERTO', 'EN_CIERRE'] } } }),
      },
      select: {
        estado: true, fechaLimite: true, fechaCierre: true,
        asignadoA: { select: { id: true, nombres: true, apellidos: true, email: true } },
      },
    });

    const mapa = new Map<string, {
      usuarioId: string; nombre: string; email: string;
      total: number; completos: number; vencidos: number; aTiempo: number;
    }>();

    for (const e of ejecuciones) {
      const clave = e.asignadoA?.id ?? 'sin-asignar';
      const actual = mapa.get(clave) ?? {
        usuarioId: clave,
        nombre: e.asignadoA ? `${e.asignadoA.nombres} ${e.asignadoA.apellidos}` : 'Sin asignar',
        email: e.asignadoA?.email ?? '-',
        total: 0, completos: 0, vencidos: 0, aTiempo: 0,
      };
      actual.total += 1;
      if (e.estado === 'CERRADO' || e.estado === 'NO_APLICA') {
        actual.completos += 1;
        if (e.fechaCierre && e.fechaCierre <= e.fechaLimite) actual.aTiempo += 1;
      }
      if (e.estado === 'VENCIDO') actual.vencidos += 1;
      mapa.set(clave, actual);
    }

    return [...mapa.values()]
      .map((v) => ({
        ...v,
        cumplimiento: v.total ? Math.round((v.completos / v.total) * 1000) / 10 : 0,
        puntualidad: v.completos ? Math.round((v.aTiempo / v.completos) * 1000) / 10 : null,
      }))
      .sort((a, b) => b.vencidos - a.vencidos || a.cumplimiento - b.cumplimiento);
  });

  /** Controles que vencen en los proximos N dias, para el widget de alertas. */
  app.get('/proximos-vencimientos', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({ dias: z.coerce.number().int().min(1).max(60).default(7), mios: z.enum(['true', 'false']).default('false') })
      .parse(req.query);

    const limite = ahora().plus({ days: q.dias }).toJSDate();
    return prisma.ejecucion.findMany({
      where: {
        estado: { notIn: ['CERRADO', 'NO_APLICA'] },
        fechaLimite: { lte: limite },
        periodo: { estado: { in: ['ABIERTO', 'EN_CIERRE'] } },
        ...(q.mios === 'true' ? { asignadoAId: req.usuario!.id } : {}),
      },
      select: {
        id: true, codigoControl: true, nombreControl: true, estado: true, fechaLimite: true,
        asignadoA: { select: { nombres: true, apellidos: true, email: true } },
        periodo: { select: { anio: true, mes: true, empresa: { select: { codigo: true } } } },
      },
      orderBy: { fechaLimite: 'asc' },
      take: 100,
    });
  });

  /** Distribucion de deficiencias por severidad y estado. */
  app.get('/deficiencias', { preHandler: app.autenticar }, async (req) => {
    const q = z.object({ empresaId: z.string().optional() }).parse(req.query);
    const filas = await prisma.deficiencia.groupBy({
      by: ['severidad', 'estado'],
      where: q.empresaId ? { ejecucion: { periodo: { empresaId: q.empresaId } } } : {},
      _count: { _all: true },
    });
    return filas.map((f) => ({ severidad: f.severidad, estado: f.estado, cantidad: f._count._all }));
  });

  /** Densidad de vencimientos del mes, para el calendario del tablero. */
  app.get('/calendario', { preHandler: app.autenticar }, async (req) => {
    const q = z
      .object({
        anio: z.coerce.number().int(),
        mes: z.coerce.number().int().min(1).max(12),
        empresaId: z.string().optional(),
      })
      .parse(req.query);

    const { inicio, fin } = rangoPeriodo(q.anio, q.mes);
    const ejecuciones = await prisma.ejecucion.findMany({
      where: {
        fechaLimite: { gte: inicio.toJSDate(), lte: fin.toJSDate() },
        ...(q.empresaId ? { periodo: { empresaId: q.empresaId } } : {}),
      },
      select: { fechaLimite: true, estado: true },
    });

    const mapa = new Map<string, { fecha: string; total: number; pendientes: number }>();
    for (const e of ejecuciones) {
      const clave = e.fechaLimite.toISOString().slice(0, 10);
      const actual = mapa.get(clave) ?? { fecha: clave, total: 0, pendientes: 0 };
      actual.total += 1;
      if (!['CERRADO', 'NO_APLICA'].includes(e.estado)) actual.pendientes += 1;
      mapa.set(clave, actual);
    }
    return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  });
}
