import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { ahora, aFecha, diasHabilesEntre } from '../utils/fechas.js';
import { ETIQUETA_ESTADO } from '../core/workflow.js';
import { notificar, reintentarFallidos } from '../mail/servicio.js';
import {
  correoEscalamiento,
  correoProximoVencimiento,
  correoVencido,
  type ResumenControl,
} from '../mail/plantillas.js';

export interface ResultadoRecordatorios {
  proximos: number;
  vencidos: number;
  escalamientos: number;
  reintentos: number;
}

/**
 * Job diario de recordatorios.
 *
 * 1. Avisa al responsable N dias habiles antes del vencimiento (configurable).
 * 2. Avisa el dia del vencimiento y luego cada X dias mientras siga abierto.
 * 3. Escala al dueno del control y al lider SOX cuando hay atraso.
 *
 * El envio esta deduplicado por dia en `mail/servicio`, de modo que si el job se
 * ejecuta mas de una vez no genera correos repetidos.
 */
export async function enviarRecordatorios(): Promise<ResultadoRecordatorios> {
  const hoy = ahora();
  const feriados = (await prisma.feriado.findMany({ select: { fecha: true } })).map((f) => f.fecha);

  const abiertas = await prisma.ejecucion.findMany({
    where: {
      estado: { notIn: ['CERRADO', 'NO_APLICA'] },
      periodo: { estado: { in: ['ABIERTO', 'EN_CIERRE'] } },
    },
    include: {
      asignadoA: true,
      periodo: { include: { empresa: true } },
    },
  });

  let proximos = 0;
  let vencidos = 0;
  const paraEscalar = new Map<string, { usuarioId: string; controles: ResumenControl[] }>();

  for (const e of abiertas) {
    if (!e.asignadoA?.activo) continue;

    const nombre = `${e.asignadoA.nombres} ${e.asignadoA.apellidos}`;
    const control: ResumenControl = {
      codigo: e.codigoControl,
      nombre: e.nombreControl,
      estado: ETIQUETA_ESTADO[e.estado],
      responsable: nombre,
      fechaLimite: e.fechaLimite,
    };
    const diasHabiles = diasHabilesEntre(hoy, aFecha(e.fechaLimite), feriados);

    if (diasHabiles > 0) {
      // Vencimiento futuro: solo se avisa en los hitos configurados.
      if (!env.RECORDATORIO_DIAS_PREVIOS.includes(diasHabiles)) continue;

      const { asunto, html } = correoProximoVencimiento({
        nombre,
        control,
        diasRestantes: diasHabiles,
        ejecucionId: e.id,
        empresa: e.periodo.empresa.nombre,
      });
      if (
        await notificar({
          tipo: 'PROXIMO_VENCIMIENTO',
          destinatario: e.asignadoA.email,
          asunto, html,
          ejecucionId: e.id,
          discriminante: `d${diasHabiles}`,
        })
      )
        proximos += 1;
      continue;
    }

    const atraso = Math.abs(diasHabiles);

    // Vencido: se avisa el dia 0 y luego cada N dias, para no saturar la bandeja.
    if (atraso > 0 && atraso % env.RECORDATORIO_VENCIDO_CADA_DIAS !== 0) continue;

    const { asunto, html } = correoVencido({
      nombre,
      control,
      diasAtraso: atraso,
      ejecucionId: e.id,
      empresa: e.periodo.empresa.nombre,
    });
    if (
      await notificar({
        tipo: atraso === 0 ? 'VENCIMIENTO_HOY' : 'VENCIDO',
        destinatario: e.asignadoA.email,
        asunto, html,
        ejecucionId: e.id,
        discriminante: `atraso${atraso}`,
      })
    )
      vencidos += 1;

    // A partir del segundo dia de atraso se escala al dueno del control.
    if (atraso >= 2 && e.ownerId) {
      const grupo = paraEscalar.get(e.ownerId) ?? { usuarioId: e.ownerId, controles: [] };
      grupo.controles.push({ ...control, diasAtraso: atraso });
      paraEscalar.set(e.ownerId, grupo);
    }
  }

  const escalamientos = await escalar(paraEscalar, hoy.year, hoy.month);
  const reintentos = await reintentarFallidos();

  return { proximos, vencidos, escalamientos, reintentos };
}

async function escalar(
  grupos: Map<string, { usuarioId: string; controles: ResumenControl[] }>,
  anio: number,
  mes: number,
): Promise<number> {
  let enviados = 0;

  for (const grupo of grupos.values()) {
    const usuario = await prisma.usuario.findUnique({ where: { id: grupo.usuarioId } });
    if (!usuario?.activo) continue;

    const { asunto, html } = correoEscalamiento({
      nombre: `${usuario.nombres} ${usuario.apellidos}`,
      empresa: 'Calidda',
      anio, mes,
      controles: grupo.controles,
    });
    if (
      await notificar({
        tipo: 'ESCALAMIENTO',
        destinatario: usuario.email,
        asunto, html,
        discriminante: `owner:${usuario.id}:${grupo.controles.length}`,
      })
    )
      enviados += 1;
  }
  return enviados;
}

/** Marca como VENCIDO todo control abierto cuya fecha limite ya paso. */
export async function marcarVencidos(): Promise<number> {
  const { count } = await prisma.ejecucion.updateMany({
    where: {
      estado: { in: ['PENDIENTE', 'EN_EJECUCION', 'OBSERVADO'] },
      fechaLimite: { lt: ahora().startOf('day').toJSDate() },
      periodo: { estado: { in: ['ABIERTO', 'EN_CIERRE'] } },
    },
    data: { estado: 'VENCIDO' },
  });
  return count;
}
