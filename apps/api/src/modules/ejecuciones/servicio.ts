import type { AccionAprobacion, Prisma, ResultadoControl } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { conflicto, invalido, noEncontrado, prohibido } from '../../core/errores.js';
import { auditar } from '../../core/auditoria.js';
import {
  accionesDisponibles,
  siguienteEstado,
  ETIQUETA_ESTADO,
  estaCompleto,
} from '../../core/workflow.js';
import { notificar } from '../../mail/servicio.js';
import { correoWorkflow } from '../../mail/plantillas.js';

export const incluirEjecucion = {
  control: {
    select: {
      id: true, codigo: true, nombre: true, descripcion: true, procedimiento: true,
      evidenciaRequerida: true, frecuencia: true, tipo: true, naturaleza: true,
      esClave: true, aserciones: true, requiereRevision: true, requiereAprobacionOwner: true,
      proceso: { select: { codigo: true, nombre: true } },
    },
  },
  periodo: {
    select: {
      id: true, anio: true, mes: true, estado: true,
      empresa: { select: { id: true, codigo: true, nombre: true } },
    },
  },
  asignadoA: { select: { id: true, nombres: true, apellidos: true, email: true } },
  evidencias: {
    where: { anuladaEn: null },
    select: {
      id: true, nombreArchivo: true, descripcion: true, mimeType: true,
      tamanoBytes: true, sha256: true, subidoEn: true,
      subidoPor: { select: { id: true, nombres: true, apellidos: true } },
    },
    orderBy: { subidoEn: 'desc' },
  },
  aprobaciones: {
    include: { usuario: { select: { id: true, nombres: true, apellidos: true, email: true } } },
    orderBy: { creadoEn: 'asc' },
  },
  deficiencias: true,
} satisfies Prisma.EjecucionInclude;

export interface Actor {
  id: string;
  email: string;
  rol: Prisma.UsuarioGetPayload<Record<string, never>>['rol'];
  nombre?: string;
}

async function cargar(id: string) {
  const ejecucion = await prisma.ejecucion.findUnique({ where: { id }, include: incluirEjecucion });
  if (!ejecucion) throw noEncontrado('La ejecucion del control');
  return ejecucion;
}

/** Guarda el trabajo del preparador sin avanzar el workflow. */
export async function guardarAvance(
  id: string,
  datos: {
    conclusion?: string;
    resultado?: ResultadoControl;
    muestraTamano?: number | null;
    excepciones?: number | null;
  },
  actor: Actor,
) {
  const ejecucion = await cargar(id);
  exigirPeriodoAbierto(ejecucion.periodo.estado);

  if (estaCompleto(ejecucion.estado)) {
    throw conflicto('El control ya esta cerrado. Solicite su reapertura al lider SOX.');
  }
  const esResponsable =
    ejecucion.asignadoAId === actor.id || ['ADMIN', 'SOX_MANAGER'].includes(actor.rol);
  if (!esResponsable) throw prohibido('Solo el responsable asignado puede editar la ejecucion.');

  const actualizada = await prisma.ejecucion.update({
    where: { id },
    data: {
      ...datos,
      estado: ejecucion.estado === 'PENDIENTE' ? 'EN_EJECUCION' : ejecucion.estado,
      fechaInicio: ejecucion.fechaInicio ?? new Date(),
    },
    include: incluirEjecucion,
  });

  await auditar({
    usuarioId: actor.id, actorEmail: actor.email,
    accion: 'ejecucion.guardar', entidad: 'Ejecucion', entidadId: id,
    antes: { estado: ejecucion.estado, conclusion: ejecucion.conclusion }, despues: datos,
  });
  return actualizada;
}

function exigirPeriodoAbierto(estado: string): void {
  if (['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(estado)) {
    throw conflicto(
      'El periodo esta cerrado. Solicite la reapertura del periodo al lider SOX para registrar cambios.',
    );
  }
}

/**
 * Aplica una accion del workflow. Toda la decision de estado la toma el motor
 * puro `siguienteEstado`; aqui solo se persiste, se audita y se notifica.
 */
export async function ejecutarAccion(
  id: string,
  accion: AccionAprobacion,
  actor: Actor,
  opciones: { comentario?: string; resultado?: ResultadoControl; nuevoAsignadoId?: string } = {},
) {
  const ejecucion = await cargar(id);
  exigirPeriodoAbierto(ejecucion.periodo.estado);

  // Antes de enviar a revision se exige evidencia y conclusion: es la regla que
  // el auditor externo verifica primero.
  if (accion === 'ENVIAR') {
    if (!ejecucion.evidencias.length) {
      throw invalido('Debe adjuntar al menos una evidencia antes de enviar el control a revision.');
    }
    if (!(opciones.resultado ?? ejecucion.resultado)) {
      throw invalido('Debe indicar el resultado del control (efectivo / deficiente).');
    }
    if (!(ejecucion.conclusion ?? '').trim()) {
      throw invalido('Debe registrar la conclusion de la ejecucion del control.');
    }
  }

  const transicion = siguienteEstado({
    estadoActual: ejecucion.estado,
    accion,
    usuarioId: actor.id,
    rol: actor.rol,
    config: {
      requiereRevision: ejecucion.control.requiereRevision,
      requiereAprobacionOwner: ejecucion.control.requiereAprobacionOwner,
    },
    actores: {
      asignadoAId: ejecucion.asignadoAId,
      revisorId: ejecucion.revisorId,
      ownerId: ejecucion.ownerId,
    },
    comentario: opciones.comentario,
  });

  const datos: Prisma.EjecucionUpdateInput = { estado: transicion.estadoNuevo };
  if (opciones.resultado) datos.resultado = opciones.resultado;
  if (accion === 'ENVIAR') datos.fechaEnvioRevision = new Date();
  if (transicion.estadoNuevo === 'CERRADO') datos.fechaCierre = new Date();
  if (transicion.estadoNuevo === 'NO_APLICA') {
    datos.fechaCierre = new Date();
    datos.resultado = 'NO_APLICA';
  }
  if (accion === 'REABRIR') {
    datos.fechaCierre = null;
    // La marca de pendiente se conserva: es el historial del incumplimiento.
  }
  if (accion === 'REASIGNAR') {
    if (!opciones.nuevoAsignadoId) throw invalido('Indique el nuevo responsable.');
    datos.asignadoA = { connect: { id: opciones.nuevoAsignadoId } };
  }

  const [actualizada] = await prisma.$transaction([
    prisma.ejecucion.update({ where: { id }, data: datos, include: incluirEjecucion }),
    prisma.aprobacion.create({
      data: {
        ejecucionId: id,
        paso: transicion.paso,
        accion,
        usuarioId: actor.id,
        comentario: opciones.comentario ?? null,
        estadoAnterior: ejecucion.estado,
        estadoNuevo: transicion.estadoNuevo,
      },
    }),
  ]);

  await auditar({
    usuarioId: actor.id, actorEmail: actor.email,
    accion: `ejecucion.${accion.toLowerCase()}`, entidad: 'Ejecucion', entidadId: id,
    antes: { estado: ejecucion.estado }, despues: { estado: transicion.estadoNuevo, comentario: opciones.comentario },
  });

  await notificarTransicion(actualizada, accion, transicion.estadoNuevo, actor, opciones.comentario);
  return actualizada;
}

async function notificarTransicion(
  ejecucion: Awaited<ReturnType<typeof cargar>>,
  _accion: AccionAprobacion,
  estadoNuevo: string,
  actor: Actor,
  comentario?: string,
): Promise<void> {
  const mapa: Record<string, { destinoId: string | null; tipo: 'PENDIENTE_REVISION' | 'OBSERVADO' | 'APROBADO' | 'CERRADO' }> = {
    EN_REVISION: { destinoId: ejecucion.revisorId, tipo: 'PENDIENTE_REVISION' },
    OBSERVADO: { destinoId: ejecucion.asignadoAId, tipo: 'OBSERVADO' },
    APROBADO: { destinoId: ejecucion.ownerId, tipo: 'APROBADO' },
    CERRADO: { destinoId: ejecucion.asignadoAId, tipo: 'CERRADO' },
  };
  const objetivo = mapa[estadoNuevo];
  if (!objetivo?.destinoId) return;

  const destino = await prisma.usuario.findUnique({ where: { id: objetivo.destinoId } });
  if (!destino?.activo) return;

  const { asunto, html } = correoWorkflow({
    nombre: `${destino.nombres} ${destino.apellidos}`,
    empresa: ejecucion.periodo.empresa.nombre,
    control: {
      codigo: ejecucion.codigoControl,
      nombre: ejecucion.nombreControl,
      estado: ETIQUETA_ESTADO[ejecucion.estado],
      responsable: destino.email,
      fechaLimite: ejecucion.fechaLimite,
    },
    ejecucionId: ejecucion.id,
    tipo: objetivo.tipo,
    actor: actor.nombre ?? actor.email,
    comentario,
  });

  await notificar({
    tipo: objetivo.tipo === 'OBSERVADO' ? 'OBSERVADO' : 'PENDIENTE_REVISION',
    destinatario: destino.email,
    asunto, html,
    ejecucionId: ejecucion.id,
    discriminante: estadoNuevo,
    deduplicarPorDia: false,
  });
}

export function accionesPara(
  ejecucion: { estado: never; asignadoAId: string | null; revisorId: string | null; ownerId: string | null },
  actor: Actor,
): AccionAprobacion[] {
  return accionesDisponibles(ejecucion.estado, actor.rol, actor.id, {
    asignadoAId: ejecucion.asignadoAId,
    revisorId: ejecucion.revisorId,
    ownerId: ejecucion.ownerId,
  });
}

export { cargar as cargarEjecucion };
