import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { ahora, periodoAnterior } from '../utils/fechas.js';
import { abrirPeriodo, cerrarPeriodo, resumenPeriodo, type Actor } from '../modules/periodos/servicio.js';
import { notificar } from '../mail/servicio.js';
import { correoDigestSemanal } from '../mail/plantillas.js';
import { ETIQUETA_ESTADO } from '../core/workflow.js';

/** Actor del sistema para las acciones automaticas: queda visible en la auditoria. */
const SISTEMA: Actor = { id: '', email: 'sistema@calidda-sox', nombre: 'Proceso automatico' };

async function actorSistema(): Promise<Actor> {
  if (SISTEMA.id) return SISTEMA;
  const admin = await prisma.usuario.findFirst({
    where: { rol: { in: ['SOX_MANAGER', 'ADMIN'] }, activo: true },
    orderBy: { creadoEn: 'asc' },
  });
  if (!admin) throw new Error('No hay un usuario ADMIN/SOX_MANAGER activo para ejecutar los jobs.');
  SISTEMA.id = admin.id;
  return SISTEMA;
}

/**
 * Apertura automatica del periodo del mes en curso para todas las empresas
 * activas. Se ejecuta el dia configurado en DIA_APERTURA_PERIODO.
 */
export async function aperturaAutomatica(): Promise<{ empresa: string; creadas: number }[]> {
  const hoy = ahora();
  const actor = await actorSistema();
  const empresas = await prisma.empresa.findMany({ where: { activo: true } });

  const resultados: { empresa: string; creadas: number }[] = [];
  for (const empresa of empresas) {
    try {
      const r = await abrirPeriodo(empresa.id, hoy.year, hoy.month, actor);
      resultados.push({ empresa: empresa.codigo, creadas: r.ejecucionesCreadas });
    } catch (err) {
      console.error(`[job:apertura] ${empresa.codigo}:`, err instanceof Error ? err.message : err);
      resultados.push({ empresa: empresa.codigo, creadas: 0 });
    }
  }
  return resultados;
}

/**
 * Cierre automatico del periodo anterior una vez superada su fecha limite.
 *
 * Deliberadamente NO fuerza el cierre: si quedan controles abiertos, deja el
 * periodo en EN_CIERRE y avisa al lider SOX, que es quien debe decidir y
 * sustentar el cierre con pendientes. Una decision con consecuencias de
 * cumplimiento no la toma un cron.
 */
export async function cierreAutomatico(): Promise<
  { periodo: string; accion: 'CERRADO' | 'EN_CIERRE' | 'SIN_ACCION' }[]
> {
  const hoy = ahora();
  const actor = await actorSistema();
  const anterior = periodoAnterior(hoy.year, hoy.month);

  const periodos = await prisma.periodo.findMany({
    where: {
      anio: anterior.anio,
      mes: anterior.mes,
      estado: { in: ['ABIERTO', 'EN_CIERRE'] },
    },
    include: { empresa: true },
  });

  const resultados: { periodo: string; accion: 'CERRADO' | 'EN_CIERRE' | 'SIN_ACCION' }[] = [];

  for (const periodo of periodos) {
    const etiqueta = `${periodo.empresa.codigo} ${periodo.anio}-${periodo.mes}`;
    if (periodo.fechaLimiteCierre && periodo.fechaLimiteCierre > hoy.toJSDate()) {
      resultados.push({ periodo: etiqueta, accion: 'SIN_ACCION' });
      continue;
    }

    const resumen = await resumenPeriodo(periodo.id);
    if (resumen.puedeCerrarse) {
      await cerrarPeriodo(periodo.id, actor);
      resultados.push({ periodo: etiqueta, accion: 'CERRADO' });
      continue;
    }

    if (periodo.estado !== 'EN_CIERRE') {
      await prisma.periodo.update({ where: { id: periodo.id }, data: { estado: 'EN_CIERRE' } });
    }
    await avisarCierrePendiente(periodo.id, etiqueta, resumen.abiertos);
    resultados.push({ periodo: etiqueta, accion: 'EN_CIERRE' });
  }

  return resultados;
}

async function avisarCierrePendiente(
  periodoId: string,
  etiqueta: string,
  abiertos: number,
): Promise<void> {
  const lideres = await prisma.usuario.findMany({
    where: { activo: true, rol: { in: ['SOX_MANAGER', 'ADMIN'] } },
  });

  for (const lider of lideres) {
    await notificar({
      tipo: 'ESCALAMIENTO',
      destinatario: lider.email,
      asunto: `[SOX] Periodo ${etiqueta} listo para cierre con ${abiertos} pendiente(s)`,
      html:
        `<p>El periodo <strong>${etiqueta}</strong> supero su fecha limite y aun tiene ` +
        `<strong>${abiertos}</strong> control(es) sin completar.</p>` +
        `<p>Revise el detalle y decida si cierra el periodo dejando los controles marcados como pendientes ` +
        `(la accion requiere sustento y notificara a los responsables).</p>` +
        `<p><a href="${env.PUBLIC_URL}/periodos/${periodoId}">Abrir el periodo</a></p>`,
      periodoId,
    });
  }
}

/** Resumen semanal de avance para lideres y duenos de control. */
export async function digestSemanal(): Promise<number> {
  const hoy = ahora();
  const empresas = await prisma.empresa.findMany({ where: { activo: true } });
  let enviados = 0;

  for (const empresa of empresas) {
    const periodo = await prisma.periodo.findUnique({
      where: { empresaId_anio_mes: { empresaId: empresa.id, anio: hoy.year, mes: hoy.month } },
    });
    if (!periodo || !['ABIERTO', 'EN_CIERRE'].includes(periodo.estado)) continue;

    const resumen = await resumenPeriodo(periodo.id);
    const proximos = await prisma.ejecucion.findMany({
      where: {
        periodoId: periodo.id,
        estado: { notIn: ['CERRADO', 'NO_APLICA'] },
        fechaLimite: { lte: hoy.plus({ days: 7 }).toJSDate() },
      },
      include: { asignadoA: true },
      orderBy: { fechaLimite: 'asc' },
      take: 25,
    });

    const destinatarios = await prisma.usuario.findMany({
      where: {
        activo: true,
        rol: { in: ['SOX_MANAGER', 'ADMIN', 'CONTROL_OWNER'] },
        empresas: { some: { empresaId: empresa.id } },
      },
    });

    for (const u of destinatarios) {
      const { asunto, html } = correoDigestSemanal({
        nombre: `${u.nombres} ${u.apellidos}`,
        empresa: empresa.nombre,
        anio: hoy.year,
        mes: hoy.month,
        total: resumen.total,
        completos: resumen.completos,
        enProceso: resumen.abiertos - resumen.vencidos,
        vencidos: resumen.vencidos,
        proximosAVencer: proximos.map((e) => ({
          codigo: e.codigoControl,
          nombre: e.nombreControl,
          estado: ETIQUETA_ESTADO[e.estado],
          responsable: e.asignadoA ? `${e.asignadoA.nombres} ${e.asignadoA.apellidos}` : 'Sin asignar',
          fechaLimite: e.fechaLimite,
        })),
      });

      if (
        await notificar({
          tipo: 'DIGEST_SEMANAL',
          destinatario: u.email,
          asunto, html,
          periodoId: periodo.id,
          discriminante: `sem${hoy.weekNumber}`,
        })
      )
        enviados += 1;
    }
  }
  return enviados;
}
