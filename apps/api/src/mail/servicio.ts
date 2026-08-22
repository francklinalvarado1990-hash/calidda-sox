import type { TipoRecordatorio } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { claveDia } from '../utils/fechas.js';
import { enviarCorreo } from './transporte.js';

export interface SolicitudNotificacion {
  tipo: TipoRecordatorio;
  destinatario: string;
  asunto: string;
  html: string;
  ejecucionId?: string | null;
  periodoId?: string | null;
  /** Sufijo que distingue variantes del mismo aviso (p. ej. dias restantes). */
  discriminante?: string;
  /** Si es false, se permite reenviar el mismo aviso el mismo dia. */
  deduplicarPorDia?: boolean;
}

/**
 * Envia un correo dejando constancia en la tabla `recordatorios`.
 *
 * La clave de deduplicacion evita el problema clasico de estos sistemas: que un
 * job se ejecute dos veces y el responsable reciba el mismo aviso repetido, lo
 * que termina en que la gente filtre los correos y el control pierda eficacia.
 */
export async function notificar(req: SolicitudNotificacion): Promise<boolean> {
  const partes = [
    req.tipo,
    req.ejecucionId ?? req.periodoId ?? 'global',
    req.destinatario.toLowerCase(),
    req.discriminante ?? '',
  ];
  if (req.deduplicarPorDia !== false) partes.push(claveDia());
  const claveDedup = partes.filter(Boolean).join('|');

  const existente = await prisma.recordatorio.findUnique({ where: { claveDedup } });
  if (existente && existente.estado === 'ENVIADO') return false;

  const registro =
    existente ??
    (await prisma.recordatorio.create({
      data: {
        tipo: req.tipo,
        ejecucionId: req.ejecucionId ?? null,
        periodoId: req.periodoId ?? null,
        destinatario: req.destinatario,
        asunto: req.asunto,
        cuerpo: req.html,
        claveDedup,
      },
    }));

  const resultado = await enviarCorreo({
    para: req.destinatario,
    asunto: req.asunto,
    html: req.html,
  });

  await prisma.recordatorio.update({
    where: { id: registro.id },
    data: {
      estado: resultado.ok ? 'ENVIADO' : 'ERROR',
      error: resultado.error ?? null,
      enviadoEn: resultado.ok ? new Date() : null,
    },
  });

  return resultado.ok;
}

/** Reintenta los correos que quedaron en error (llamado por el job diario). */
export async function reintentarFallidos(limite = 50): Promise<number> {
  const fallidos = await prisma.recordatorio.findMany({
    where: { estado: 'ERROR' },
    orderBy: { creadoEn: 'asc' },
    take: limite,
  });

  let reenviados = 0;
  for (const r of fallidos) {
    const res = await enviarCorreo({ para: r.destinatario, asunto: r.asunto, html: r.cuerpo });
    await prisma.recordatorio.update({
      where: { id: r.id },
      data: {
        estado: res.ok ? 'ENVIADO' : 'ERROR',
        error: res.error ?? null,
        enviadoEn: res.ok ? new Date() : null,
      },
    });
    if (res.ok) reenviados += 1;
  }
  return reenviados;
}
