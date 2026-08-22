import { Prisma, type EstadoPeriodo, type Periodo } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { nombreMes } from '../../config/constantes.js';
import { conflicto, invalido, noEncontrado } from '../../core/errores.js';
import { auditar, sanear } from '../../core/auditoria.js';
import { ESTADOS_ABIERTOS, ETIQUETA_ESTADO, estaCompleto } from '../../core/workflow.js';
import { aplicaEnPeriodo } from '../../utils/frecuencia.js';
import { aFecha, ahora, diasHabilesEntre, rangoPeriodo, sumarDiasHabiles } from '../../utils/fechas.js';
import { notificar } from '../../mail/servicio.js';
import {
  correoAperturaPeriodo,
  correoResumenCierre,
  type ResponsableIncumplido,
  type ResumenControl,
} from '../../mail/plantillas.js';

export interface Actor {
  id: string;
  email: string;
  nombre?: string;
}

const cargarFeriados = async (): Promise<Date[]> =>
  (await prisma.feriado.findMany({ select: { fecha: true } })).map((f) => f.fecha);

// ---------------------------------------------------------------------------
// Apertura del periodo
// ---------------------------------------------------------------------------

export interface ResultadoApertura {
  periodo: Periodo;
  ejecucionesCreadas: number;
  controlesOmitidos: number;
  correosEnviados: number;
}

/**
 * Abre el periodo mensual: instancia una ejecucion por cada control activo que
 * aplique al mes segun su frecuencia, calcula la fecha limite en dias habiles y
 * notifica a cada responsable la lista de controles a su cargo.
 *
 * Es idempotente: si el periodo ya existe, agrega unicamente los controles que
 * falten (util cuando se da de alta un control con el periodo ya abierto).
 */
export async function abrirPeriodo(
  empresaId: string,
  anio: number,
  mes: number,
  actor: Actor,
  opciones: { notificar?: boolean } = {},
): Promise<ResultadoApertura> {
  if (mes < 1 || mes > 12) throw invalido('El mes debe estar entre 1 y 12.');

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa || !empresa.activo) throw noEncontrado('La empresa');

  const { fin } = rangoPeriodo(anio, mes);
  const feriados = await cargarFeriados();
  const fechaLimiteCierre = sumarDiasHabiles(fin, env.DIAS_HABILES_CIERRE_PERIODO, feriados).toJSDate();

  const existente = await prisma.periodo.findUnique({
    where: { empresaId_anio_mes: { empresaId, anio, mes } },
  });
  if (existente && ['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(existente.estado)) {
    throw conflicto(
      `El periodo ${nombreMes(mes)} ${anio} de ${empresa.nombre} ya fue cerrado. ` +
        'Para modificarlo debe reabrirlo explicitamente.',
    );
  }

  const periodo =
    existente ??
    (await prisma.periodo.create({
      data: {
        empresaId, anio, mes,
        estado: 'ABIERTO',
        fechaApertura: new Date(),
        fechaLimiteCierre,
        abiertoPorId: actor.id,
      },
    }));

  if (existente && existente.estado === 'PLANIFICADO') {
    await prisma.periodo.update({
      where: { id: periodo.id },
      data: { estado: 'ABIERTO', fechaApertura: new Date(), fechaLimiteCierre, abiertoPorId: actor.id },
    });
  }

  const controles = await prisma.control.findMany({
    where: { empresaId, activo: true },
    include: { preparador: true, owner: true, revisor: true },
  });

  const yaInstanciados = new Set(
    (await prisma.ejecucion.findMany({
      where: { periodoId: periodo.id },
      select: { controlId: true },
    })).map((e) => e.controlId),
  );

  const nuevas: Prisma.EjecucionCreateManyInput[] = [];
  let omitidos = 0;

  for (const control of controles) {
    if (yaInstanciados.has(control.id)) continue;
    if (!aplicaEnPeriodo(control.frecuencia, control.mesAncla, mes)) {
      omitidos += 1;
      continue;
    }
    nuevas.push({
      periodoId: periodo.id,
      controlId: control.id,
      controlVersion: control.version,
      codigoControl: control.codigo,
      nombreControl: control.nombre,
      fechaLimite: sumarDiasHabiles(fin, control.diasHabilesPlazo, feriados).toJSDate(),
      asignadoAId: control.preparadorId ?? control.ownerId,
      revisorId: control.revisorId,
      ownerId: control.ownerId,
    });
  }

  if (nuevas.length) await prisma.ejecucion.createMany({ data: nuevas });

  await auditar({
    usuarioId: actor.id, actorEmail: actor.email,
    accion: 'periodo.abrir', entidad: 'Periodo', entidadId: periodo.id,
    despues: { empresa: empresa.codigo, anio, mes, ejecucionesCreadas: nuevas.length, omitidos },
  });

  let correos = 0;
  if (opciones.notificar !== false && nuevas.length) {
    correos = await notificarApertura(periodo.id, empresa.nombre, anio, mes, fechaLimiteCierre);
  }

  return {
    periodo: await prisma.periodo.findUniqueOrThrow({ where: { id: periodo.id } }),
    ejecucionesCreadas: nuevas.length,
    controlesOmitidos: omitidos,
    correosEnviados: correos,
  };
}

/** Un solo correo por responsable con toda su lista, no uno por control. */
async function notificarApertura(
  periodoId: string,
  empresaNombre: string,
  anio: number,
  mes: number,
  fechaLimitePeriodo: Date,
): Promise<number> {
  const ejecuciones = await prisma.ejecucion.findMany({
    where: { periodoId, estado: 'PENDIENTE' },
    include: { asignadoA: true },
    orderBy: { fechaLimite: 'asc' },
  });

  const porResponsable = new Map<string, { email: string; nombre: string; controles: ResumenControl[] }>();
  for (const e of ejecuciones) {
    if (!e.asignadoA || !e.asignadoA.activo) continue;
    const clave = e.asignadoA.id;
    const grupo = porResponsable.get(clave) ?? {
      email: e.asignadoA.email,
      nombre: `${e.asignadoA.nombres} ${e.asignadoA.apellidos}`,
      controles: [],
    };
    grupo.controles.push({
      codigo: e.codigoControl,
      nombre: e.nombreControl,
      estado: ETIQUETA_ESTADO[e.estado],
      responsable: grupo.nombre,
      fechaLimite: e.fechaLimite,
    });
    porResponsable.set(clave, grupo);
  }

  let enviados = 0;
  for (const grupo of porResponsable.values()) {
    const { asunto, html } = correoAperturaPeriodo({
      nombre: grupo.nombre,
      empresa: empresaNombre,
      anio, mes, periodoId,
      controles: grupo.controles,
      fechaLimitePeriodo,
    });
    if (await notificar({ tipo: 'APERTURA_PERIODO', destinatario: grupo.email, asunto, html, periodoId }))
      enviados += 1;
  }
  return enviados;
}

// ---------------------------------------------------------------------------
// Metricas y cierre
// ---------------------------------------------------------------------------

export interface ResumenPeriodo {
  total: number;
  cerrados: number;
  noAplica: number;
  completos: number;
  abiertos: number;
  vencidos: number;
  porEstado: Record<string, number>;
  porcentajeAvance: number;
  deficienciasAbiertas: number;
  puedeCerrarse: boolean;
}

export async function resumenPeriodo(periodoId: string): Promise<ResumenPeriodo> {
  const [agrupado, deficienciasAbiertas] = await Promise.all([
    prisma.ejecucion.groupBy({ by: ['estado'], where: { periodoId }, _count: { _all: true } }),
    prisma.deficiencia.count({
      where: { ejecucion: { periodoId }, estado: { in: ['ABIERTA', 'EN_REMEDIACION', 'EN_VALIDACION'] } },
    }),
  ]);

  const porEstado: Record<string, number> = {};
  let total = 0;
  for (const g of agrupado) {
    porEstado[g.estado] = g._count._all;
    total += g._count._all;
  }

  const cerrados = porEstado.CERRADO ?? 0;
  const noAplica = porEstado.NO_APLICA ?? 0;
  const completos = cerrados + noAplica;
  const vencidos = porEstado.VENCIDO ?? 0;

  return {
    total, cerrados, noAplica, completos,
    abiertos: total - completos,
    vencidos,
    porEstado,
    porcentajeAvance: total ? Math.round((completos / total) * 1000) / 10 : 100,
    deficienciasAbiertas,
    puedeCerrarse: total > 0 && completos === total,
  };
}

export interface OpcionesCierre {
  /** Permite cerrar aun con controles abiertos, marcandolos como pendientes. */
  forzar?: boolean;
  /** Sustento obligatorio cuando se cierra con pendientes. */
  nota?: string;
  notificar?: boolean;
}

export interface ResultadoCierre {
  periodo: Periodo;
  estado: EstadoPeriodo;
  resumen: ResumenPeriodo;
  marcadosPendientes: number;
  responsablesIncumplidos: ResponsableIncumplido[];
  correosEnviados: number;
}

/**
 * Cierra el periodo mensual.
 *
 * - Si todos los controles estan cerrados o justificados como no aplicables, el
 *   periodo queda CERRADO.
 * - Si quedan controles abiertos, solo se puede cerrar con `forzar` y un
 *   sustento escrito. En ese caso el periodo queda CERRADO_CON_PENDIENTES, cada
 *   control abierto recibe la marca `marcadoPendiente` con sus dias de atraso, y
 *   se envia el resumen nombrando a los responsables que no cerraron.
 */
export async function cerrarPeriodo(
  periodoId: string,
  actor: Actor,
  opciones: OpcionesCierre = {},
): Promise<ResultadoCierre> {
  const periodo = await prisma.periodo.findUnique({
    where: { id: periodoId },
    include: { empresa: true },
  });
  if (!periodo) throw noEncontrado('El periodo');
  if (['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(periodo.estado)) {
    throw conflicto(`El periodo ${nombreMes(periodo.mes)} ${periodo.anio} ya se encuentra cerrado.`);
  }

  const resumenPrevio = await resumenPeriodo(periodoId);

  if (!resumenPrevio.puedeCerrarse && !opciones.forzar) {
    throw conflicto(
      `Quedan ${resumenPrevio.abiertos} control(es) sin completar. ` +
        'Para cerrar el periodo de todas formas debe confirmar el cierre con pendientes y sustentar el motivo.',
      { abiertos: resumenPrevio.abiertos, porEstado: resumenPrevio.porEstado },
    );
  }
  if (!resumenPrevio.puedeCerrarse && !opciones.nota?.trim()) {
    throw invalido('Debe registrar el sustento del cierre con controles pendientes.');
  }

  const abiertas = await prisma.ejecucion.findMany({
    where: { periodoId, estado: { in: [...ESTADOS_ABIERTOS] } },
    include: { asignadoA: true },
  });

  const feriados = await cargarFeriados();
  const hoy = ahora();

  // Marca cada control abierto: queda registrado quien y cuanto se atraso.
  const marcas = abiertas.map((e) => ({
    id: e.id,
    diasAtraso: Math.max(0, diasHabilesEntre(aFecha(e.fechaLimite), hoy, feriados)),
    motivo:
      e.motivoPendiente ??
      `Control no completado al cierre del periodo ${nombreMes(periodo.mes)} ${periodo.anio}. ` +
        `Estado al cierre: ${ETIQUETA_ESTADO[e.estado]}.`,
  }));

  await prisma.$transaction(
    marcas.map((m) =>
      prisma.ejecucion.update({
        where: { id: m.id },
        data: {
          estado: 'VENCIDO',
          marcadoPendiente: true,
          motivoPendiente: m.motivo,
          diasAtrasoAlCierre: m.diasAtraso,
        },
      }),
    ),
  );

  const resumen = await resumenPeriodo(periodoId);
  const conPendientes = abiertas.length > 0;
  const estadoFinal: EstadoPeriodo = conPendientes ? 'CERRADO_CON_PENDIENTES' : 'CERRADO';

  const responsables = agruparIncumplidos(
    abiertas.map((e) => ({
      ...e,
      diasAtrasoAlCierre: marcas.find((m) => m.id === e.id)?.diasAtraso ?? 0,
      estado: e.estado,
    })),
  );

  const actualizado = await prisma.periodo.update({
    where: { id: periodoId },
    data: {
      estado: estadoFinal,
      fechaCierre: new Date(),
      cerradoPorId: actor.id,
      notaCierre: opciones.nota ?? null,
      resumenCierre: sanear({
        ...resumen,
        marcadosPendientes: abiertas.length,
        responsablesIncumplidos: responsables.map((r) => ({
          email: r.email, nombre: r.nombre, cantidad: r.controles.length,
        })),
        cerradoPor: actor.email,
        cerradoEn: new Date().toISOString(),
      }) as Prisma.InputJsonValue,
    },
  });

  await auditar({
    usuarioId: actor.id, actorEmail: actor.email,
    accion: conPendientes ? 'periodo.cerrar_con_pendientes' : 'periodo.cerrar',
    entidad: 'Periodo', entidadId: periodoId,
    despues: { estado: estadoFinal, pendientes: abiertas.length, nota: opciones.nota },
  });

  let correos = 0;
  if (opciones.notificar !== false) {
    correos = await enviarResumenCierre(actualizado.id, {
      empresa: periodo.empresa.nombre,
      anio: periodo.anio,
      mes: periodo.mes,
      cerradoPor: actor.nombre ?? actor.email,
      resumen,
      conPendientes,
      nota: opciones.nota ?? null,
      responsables,
    });
  }

  return {
    periodo: actualizado,
    estado: estadoFinal,
    resumen,
    marcadosPendientes: abiertas.length,
    responsablesIncumplidos: responsables,
    correosEnviados: correos,
  };
}

type EjecucionConResponsable = Awaited<ReturnType<typeof prisma.ejecucion.findMany>> extends (infer T)[]
  ? T
  : never;

function agruparIncumplidos(
  abiertas: (EjecucionConResponsable & {
    asignadoA: { id: string; email: string; nombres: string; apellidos: string; cargo: string | null } | null;
  })[],
): ResponsableIncumplido[] {
  const mapa = new Map<string, ResponsableIncumplido>();

  for (const e of abiertas) {
    const clave = e.asignadoA?.id ?? 'sin-asignar';
    const nombre = e.asignadoA
      ? `${e.asignadoA.nombres} ${e.asignadoA.apellidos}`
      : 'Sin responsable asignado';
    const grupo =
      mapa.get(clave) ??
      ({
        nombre,
        email: e.asignadoA?.email ?? '(sin correo)',
        cargo: e.asignadoA?.cargo ?? null,
        controles: [],
      } satisfies ResponsableIncumplido);

    grupo.controles.push({
      codigo: e.codigoControl,
      nombre: e.nombreControl,
      estado: ETIQUETA_ESTADO[e.estado],
      responsable: nombre,
      fechaLimite: e.fechaLimite,
      diasAtraso: e.diasAtrasoAlCierre ?? 0,
    });
    mapa.set(clave, grupo);
  }

  return [...mapa.values()].sort((a, b) => b.controles.length - a.controles.length);
}

/**
 * Envia el resumen de cierre. Va a los responsables incumplidos, a sus duenos de
 * control y al gobierno SOX: el objetivo es que el incumplimiento sea visible,
 * no que se pierda en un tablero que nadie abre.
 */
async function enviarResumenCierre(
  periodoId: string,
  datos: {
    empresa: string;
    anio: number;
    mes: number;
    cerradoPor: string;
    resumen: ResumenPeriodo;
    conPendientes: boolean;
    nota: string | null;
    responsables: ResponsableIncumplido[];
  },
): Promise<number> {
  const { asunto, html } = correoResumenCierre({
    empresa: datos.empresa,
    anio: datos.anio,
    mes: datos.mes,
    periodoId,
    cerradoPor: datos.cerradoPor,
    total: datos.resumen.total,
    cerrados: datos.resumen.cerrados,
    noAplica: datos.resumen.noAplica,
    pendientes: datos.resumen.abiertos,
    conPendientes: datos.conPendientes,
    notaCierre: datos.nota,
    responsables: datos.responsables,
    deficienciasAbiertas: datos.resumen.deficienciasAbiertas,
  });

  const lideres = await prisma.usuario.findMany({
    where: { activo: true, rol: { in: ['SOX_MANAGER', 'ADMIN', 'AUDITOR'] } },
    select: { email: true },
  });

  const destinatarios = new Set<string>([
    ...lideres.map((l) => l.email),
    ...datos.responsables.map((r) => r.email).filter((e) => e.includes('@')),
  ]);

  let enviados = 0;
  for (const destinatario of destinatarios) {
    if (await notificar({ tipo: 'RESUMEN_CIERRE', destinatario, asunto, html, periodoId }))
      enviados += 1;
  }
  return enviados;
}

/** Reapertura excepcional de un periodo cerrado (queda auditada). */
export async function reabrirPeriodo(
  periodoId: string,
  motivo: string,
  actor: Actor,
): Promise<Periodo> {
  if (!motivo?.trim()) throw invalido('Debe registrar el motivo de la reapertura del periodo.');
  const periodo = await prisma.periodo.findUnique({ where: { id: periodoId } });
  if (!periodo) throw noEncontrado('El periodo');
  if (!['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(periodo.estado)) {
    throw conflicto('El periodo no esta cerrado.');
  }

  const actualizado = await prisma.periodo.update({
    where: { id: periodoId },
    data: { estado: 'ABIERTO', fechaCierre: null, cerradoPorId: null },
  });
  await auditar({
    usuarioId: actor.id, actorEmail: actor.email,
    accion: 'periodo.reabrir', entidad: 'Periodo', entidadId: periodoId,
    antes: { estado: periodo.estado }, despues: { estado: 'ABIERTO', motivo },
  });
  return actualizado;
}

/** Controles que quedaron marcados como pendientes en periodos anteriores. */
export async function pendientesArrastrados(empresaId?: string) {
  return prisma.ejecucion.findMany({
    where: {
      marcadoPendiente: true,
      regularizadoEnPeriodoId: null,
      ...(empresaId ? { periodo: { empresaId } } : {}),
    },
    include: {
      asignadoA: { select: { id: true, nombres: true, apellidos: true, email: true } },
      periodo: { select: { id: true, anio: true, mes: true, empresa: { select: { codigo: true, nombre: true } } } },
    },
    orderBy: [{ periodo: { anio: 'asc' } }, { periodo: { mes: 'asc' } }],
  });
}

export const estaCompletoEstado = estaCompleto;
