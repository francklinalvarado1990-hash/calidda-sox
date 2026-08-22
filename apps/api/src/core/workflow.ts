import type { AccionAprobacion, EstadoEjecucion, PasoWorkflow, Rol } from '@prisma/client';
import { conflicto, invalido, prohibido } from './errores.js';

/** Configuracion de aprobacion heredada del control maestro. */
export interface ConfigWorkflow {
  requiereRevision: boolean;
  requiereAprobacionOwner: boolean;
}

/** Actores registrados en la ejecucion, para validar segregacion de funciones. */
export interface ActoresEjecucion {
  asignadoAId: string | null;
  revisorId: string | null;
  ownerId: string | null;
}

export interface ContextoTransicion {
  estadoActual: EstadoEjecucion;
  accion: AccionAprobacion;
  usuarioId: string;
  rol: Rol;
  config: ConfigWorkflow;
  actores: ActoresEjecucion;
  comentario?: string | null;
}

export interface ResultadoTransicion {
  estadoNuevo: EstadoEjecucion;
  paso: PasoWorkflow;
}

/** Estados en los que el control ya no requiere trabajo del responsable. */
export const ESTADOS_COMPLETOS: readonly EstadoEjecucion[] = ['CERRADO', 'NO_APLICA'];

/** Estados que bloquean el cierre del periodo. */
export const ESTADOS_ABIERTOS: readonly EstadoEjecucion[] = [
  'PENDIENTE',
  'EN_EJECUCION',
  'EN_REVISION',
  'OBSERVADO',
  'APROBADO',
  'VENCIDO',
];

export const estaCompleto = (estado: EstadoEjecucion): boolean =>
  ESTADOS_COMPLETOS.includes(estado);

/**
 * Siguiente estado luego de que el preparador entrega su trabajo.
 * Si el control no exige revision ni aprobacion del owner, cierra directamente.
 */
function estadoTrasPreparacion(config: ConfigWorkflow): EstadoEjecucion {
  if (config.requiereRevision) return 'EN_REVISION';
  if (config.requiereAprobacionOwner) return 'APROBADO';
  return 'CERRADO';
}

/**
 * Segregacion de funciones (SoD): la misma persona no puede preparar y revisar,
 * ni revisar y aprobar. Es uno de los controles que el auditor externo prueba
 * de forma explicita, por eso se valida en el motor y no solo en la interfaz.
 */
export function validarSegregacion(ctx: ContextoTransicion): void {
  const { usuarioId, actores, accion, estadoActual } = ctx;

  const esRevision = accion === 'APROBAR' && estadoActual === 'EN_REVISION';
  const esAprobacionOwner = accion === 'APROBAR' && estadoActual === 'APROBADO';

  if (esRevision && actores.asignadoAId && actores.asignadoAId === usuarioId) {
    throw prohibido(
      'Segregacion de funciones: quien prepara el control no puede revisarlo. ' +
        'Solicite la revision a otro usuario.',
    );
  }
  if (esAprobacionOwner && actores.revisorId && actores.revisorId === usuarioId) {
    throw prohibido(
      'Segregacion de funciones: quien reviso el control no puede aprobarlo como dueno.',
    );
  }
  if (esAprobacionOwner && actores.asignadoAId && actores.asignadoAId === usuarioId) {
    throw prohibido(
      'Segregacion de funciones: quien prepara el control no puede aprobarlo como dueno.',
    );
  }
}

/**
 * Motor de transiciones del workflow de aprobacion. Funcion pura: recibe el
 * contexto y devuelve el estado destino, o lanza un error explicando por que no
 * procede. Toda la logica de aprobacion vive aqui y esta cubierta por pruebas.
 */
export function siguienteEstado(ctx: ContextoTransicion): ResultadoTransicion {
  const { estadoActual, accion, config, rol } = ctx;

  switch (accion) {
    case 'ENVIAR': {
      if (!['PENDIENTE', 'EN_EJECUCION', 'OBSERVADO', 'VENCIDO'].includes(estadoActual)) {
        throw conflicto(
          `No se puede enviar a revision un control en estado ${estadoActual}.`,
        );
      }
      return { estadoNuevo: estadoTrasPreparacion(config), paso: 'PREPARACION' };
    }

    case 'APROBAR': {
      if (estadoActual === 'EN_REVISION') {
        validarSegregacion(ctx);
        return {
          estadoNuevo: config.requiereAprobacionOwner ? 'APROBADO' : 'CERRADO',
          paso: 'REVISION',
        };
      }
      if (estadoActual === 'APROBADO') {
        validarSegregacion(ctx);
        return { estadoNuevo: 'CERRADO', paso: 'APROBACION_OWNER' };
      }
      throw conflicto(`No hay una aprobacion pendiente para un control en estado ${estadoActual}.`);
    }

    case 'RECHAZAR': {
      if (!['EN_REVISION', 'APROBADO'].includes(estadoActual)) {
        throw conflicto(`No se puede observar un control en estado ${estadoActual}.`);
      }
      if (!ctx.comentario?.trim()) {
        throw invalido('Debe indicar el motivo de la observacion para devolver el control.');
      }
      return {
        estadoNuevo: 'OBSERVADO',
        paso: estadoActual === 'EN_REVISION' ? 'REVISION' : 'APROBACION_OWNER',
      };
    }

    case 'MARCAR_NO_APLICA': {
      if (estaCompleto(estadoActual)) {
        throw conflicto(`El control ya se encuentra en estado ${estadoActual}.`);
      }
      if (!ctx.comentario?.trim()) {
        throw invalido('Debe sustentar por escrito por que el control no aplica en el periodo.');
      }
      if (!['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER'].includes(rol)) {
        throw prohibido('Solo el dueno del control o el lider SOX pueden marcarlo como no aplicable.');
      }
      return { estadoNuevo: 'NO_APLICA', paso: 'APROBACION_OWNER' };
    }

    case 'REABRIR': {
      if (!['ADMIN', 'SOX_MANAGER'].includes(rol)) {
        throw prohibido('Solo el lider SOX puede reabrir un control.');
      }
      if (!ctx.comentario?.trim()) {
        throw invalido('Debe registrar el motivo de la reapertura.');
      }
      return { estadoNuevo: 'EN_EJECUCION', paso: 'PREPARACION' };
    }

    case 'REASIGNAR': {
      if (!['ADMIN', 'SOX_MANAGER'].includes(rol)) {
        throw prohibido('Solo el lider SOX puede reasignar un control.');
      }
      return { estadoNuevo: estadoActual, paso: 'PREPARACION' };
    }

    default:
      throw invalido(`Accion de workflow no reconocida: ${String(accion)}`);
  }
}

/** Acciones disponibles para un usuario dado, para que la UI no ofrezca lo imposible. */
export function accionesDisponibles(
  estado: EstadoEjecucion,
  rol: Rol,
  usuarioId: string,
  actores: ActoresEjecucion,
): AccionAprobacion[] {
  const acciones: AccionAprobacion[] = [];
  const esAdminSox = rol === 'ADMIN' || rol === 'SOX_MANAGER';
  const esPreparador = actores.asignadoAId === usuarioId;
  const esRevisor = actores.revisorId === usuarioId;
  const esOwner = actores.ownerId === usuarioId;

  if (['PENDIENTE', 'EN_EJECUCION', 'OBSERVADO', 'VENCIDO'].includes(estado)) {
    if (esPreparador || esAdminSox) acciones.push('ENVIAR');
  }
  if (estado === 'EN_REVISION' && (esRevisor || esAdminSox) && !esPreparador) {
    acciones.push('APROBAR', 'RECHAZAR');
  }
  if (estado === 'APROBADO' && (esOwner || esAdminSox) && !esRevisor && !esPreparador) {
    acciones.push('APROBAR', 'RECHAZAR');
  }
  if (!estaCompleto(estado) && (esOwner || esAdminSox)) acciones.push('MARCAR_NO_APLICA');
  if (esAdminSox) {
    acciones.push('REASIGNAR');
    if (estaCompleto(estado) || estado === 'VENCIDO') acciones.push('REABRIR');
  }
  return [...new Set(acciones)];
}

export const ETIQUETA_ESTADO: Record<EstadoEjecucion, string> = {
  PENDIENTE: 'Pendiente',
  EN_EJECUCION: 'En ejecucion',
  EN_REVISION: 'En revision',
  OBSERVADO: 'Observado',
  APROBADO: 'Aprobado por revisor',
  CERRADO: 'Cerrado',
  NO_APLICA: 'No aplica',
  VENCIDO: 'Vencido',
};
