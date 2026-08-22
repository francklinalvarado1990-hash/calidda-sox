import { env } from '../config/env.js';
import { nombreMes } from '../config/constantes.js';
import { formatoCorto } from '../utils/fechas.js';
import { alerta, plantillaBase, tabla, tablaDatos } from './templates/base.js';

export interface ResumenControl {
  codigo: string;
  nombre: string;
  estado: string;
  responsable: string;
  fechaLimite: Date;
  diasAtraso?: number;
}

const urlEjecucion = (id: string) => `${env.PUBLIC_URL}/ejecuciones/${id}`;
const urlPeriodo = (id: string) => `${env.PUBLIC_URL}/periodos/${id}`;

/** 1. Apertura del periodo: el responsable recibe su lista de controles del mes. */
export function correoAperturaPeriodo(datos: {
  nombre: string;
  empresa: string;
  anio: number;
  mes: number;
  periodoId: string;
  controles: ResumenControl[];
  fechaLimitePeriodo: Date;
}): { asunto: string; html: string } {
  const asunto = `[SOX ${datos.empresa}] Periodo ${nombreMes(datos.mes)} ${datos.anio} abierto - ${datos.controles.length} control(es) asignado(s)`;
  const html = plantillaBase({
    titulo: `Periodo ${nombreMes(datos.mes)} ${datos.anio}`,
    preheader: `Tiene ${datos.controles.length} controles por ejecutar.`,
    cuerpo: `
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      <p>Se ha aperturado el periodo de control interno <strong>${nombreMes(datos.mes)} ${datos.anio}</strong>
      para <strong>${datos.empresa}</strong>. A continuacion, los controles bajo su responsabilidad:</p>
      ${tabla(
        ['Control', 'Descripcion', 'Fecha limite'],
        datos.controles.map((c) => [c.codigo, c.nombre, formatoCorto(c.fechaLimite)]),
      )}
      ${alerta(`La fecha limite de cierre del periodo es el <strong>${formatoCorto(datos.fechaLimitePeriodo)}</strong>. Los controles no cerrados a esa fecha quedaran marcados como pendientes y seran reportados a la Gerencia.`, 'aviso')}
    `,
    cta: { texto: 'Ver mis controles', url: urlPeriodo(datos.periodoId) },
  });
  return { asunto, html };
}

/** 2. Recordatorio de vencimiento proximo. */
export function correoProximoVencimiento(datos: {
  nombre: string;
  control: ResumenControl;
  diasRestantes: number;
  ejecucionId: string;
  empresa: string;
}): { asunto: string; html: string } {
  const asunto = `[SOX ${datos.empresa}] Vence en ${datos.diasRestantes} dia(s): ${datos.control.codigo}`;
  const html = plantillaBase({
    titulo: 'Recordatorio de vencimiento',
    preheader: `${datos.control.codigo} vence el ${formatoCorto(datos.control.fechaLimite)}.`,
    cuerpo: `
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      <p>El siguiente control esta proximo a vencer:</p>
      ${tablaDatos([
        { etiqueta: 'Control', valor: `${datos.control.codigo} - ${datos.control.nombre}` },
        { etiqueta: 'Estado actual', valor: datos.control.estado },
        { etiqueta: 'Fecha limite', valor: formatoCorto(datos.control.fechaLimite) },
        { etiqueta: 'Dias restantes', valor: String(datos.diasRestantes) },
      ])}
      <p>Complete la ejecucion y adjunte la evidencia correspondiente antes de la fecha limite.</p>
    `,
    cta: { texto: 'Ejecutar control', url: urlEjecucion(datos.ejecucionId) },
  });
  return { asunto, html };
}

/** 3. Control vencido. */
export function correoVencido(datos: {
  nombre: string;
  control: ResumenControl;
  diasAtraso: number;
  ejecucionId: string;
  empresa: string;
}): { asunto: string; html: string } {
  const asunto = `[SOX ${datos.empresa}] VENCIDO (${datos.diasAtraso} dia(s)): ${datos.control.codigo}`;
  const html = plantillaBase({
    titulo: 'Control vencido',
    preheader: `${datos.control.codigo} vencio hace ${datos.diasAtraso} dia(s).`,
    cuerpo: `
      ${alerta('Este control ha superado su fecha limite y figura como incumplimiento en el tablero de la Gerencia.', 'critico')}
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      ${tablaDatos([
        { etiqueta: 'Control', valor: `${datos.control.codigo} - ${datos.control.nombre}` },
        { etiqueta: 'Estado actual', valor: datos.control.estado },
        { etiqueta: 'Vencio el', valor: formatoCorto(datos.control.fechaLimite) },
        { etiqueta: 'Dias de atraso', valor: String(datos.diasAtraso) },
      ])}
      <p>Regularice a la brevedad o sustente por escrito el motivo del atraso.</p>
    `,
    cta: { texto: 'Regularizar ahora', url: urlEjecucion(datos.ejecucionId) },
  });
  return { asunto, html };
}

/** 4. Escalamiento al dueno del control y al lider SOX. */
export function correoEscalamiento(datos: {
  nombre: string;
  empresa: string;
  anio: number;
  mes: number;
  controles: ResumenControl[];
}): { asunto: string; html: string } {
  const asunto = `[SOX ${datos.empresa}] Escalamiento: ${datos.controles.length} control(es) vencido(s) en ${nombreMes(datos.mes)} ${datos.anio}`;
  const html = plantillaBase({
    titulo: 'Escalamiento por controles vencidos',
    cuerpo: `
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      <p>Los siguientes controles bajo su ambito superaron la fecha limite y siguen abiertos:</p>
      ${tabla(
        ['Control', 'Responsable', 'Estado', 'Vencio', 'Atraso'],
        datos.controles.map((c) => [
          c.codigo,
          c.responsable,
          c.estado,
          formatoCorto(c.fechaLimite),
          `${c.diasAtraso ?? 0} d`,
        ]),
      )}
      ${alerta('Se requiere su gestion para regularizar antes del cierre del periodo.', 'aviso')}
    `,
    cta: { texto: 'Abrir tablero SOX', url: `${env.PUBLIC_URL}/dashboard` },
  });
  return { asunto, html };
}

/** 5. Pendiente de revision / observado (workflow). */
export function correoWorkflow(datos: {
  nombre: string;
  empresa: string;
  control: ResumenControl;
  ejecucionId: string;
  tipo: 'PENDIENTE_REVISION' | 'OBSERVADO' | 'APROBADO' | 'CERRADO';
  actor: string;
  comentario?: string | null;
}): { asunto: string; html: string } {
  const textos = {
    PENDIENTE_REVISION: {
      titulo: 'Control pendiente de su revision',
      intro: `<strong>${datos.actor}</strong> envio el control a revision. Se requiere su validacion.`,
      cta: 'Revisar control',
      tono: 'info' as const,
    },
    OBSERVADO: {
      titulo: 'Control observado: requiere correccion',
      intro: `<strong>${datos.actor}</strong> devolvio el control con observaciones.`,
      cta: 'Corregir control',
      tono: 'aviso' as const,
    },
    APROBADO: {
      titulo: 'Control aprobado por el revisor',
      intro: `<strong>${datos.actor}</strong> aprobo la revision. Falta la aprobacion del dueno del control.`,
      cta: 'Aprobar control',
      tono: 'info' as const,
    },
    CERRADO: {
      titulo: 'Control cerrado',
      intro: `<strong>${datos.actor}</strong> cerro el control. No se requieren acciones adicionales.`,
      cta: 'Ver control',
      tono: 'info' as const,
    },
  }[datos.tipo];

  const asunto = `[SOX ${datos.empresa}] ${textos.titulo}: ${datos.control.codigo}`;
  const html = plantillaBase({
    titulo: textos.titulo,
    cuerpo: `
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      <p>${textos.intro}</p>
      ${tablaDatos([
        { etiqueta: 'Control', valor: `${datos.control.codigo} - ${datos.control.nombre}` },
        { etiqueta: 'Fecha limite', valor: formatoCorto(datos.control.fechaLimite) },
      ])}
      ${datos.comentario ? alerta(`<strong>Comentario:</strong> ${datos.comentario}`, textos.tono) : ''}
    `,
    cta: { texto: textos.cta, url: urlEjecucion(datos.ejecucionId) },
  });
  return { asunto, html };
}

export interface ResponsableIncumplido {
  nombre: string;
  email: string;
  cargo: string | null;
  controles: ResumenControl[];
}

/**
 * 6. Resumen de cierre del periodo. Es el correo que el negocio pidio de forma
 * explicita: al cerrar el mes, quien no cerro sus controles queda nombrado.
 */
export function correoResumenCierre(datos: {
  empresa: string;
  anio: number;
  mes: number;
  periodoId: string;
  cerradoPor: string;
  total: number;
  cerrados: number;
  noAplica: number;
  pendientes: number;
  conPendientes: boolean;
  notaCierre?: string | null;
  responsables: ResponsableIncumplido[];
  deficienciasAbiertas: number;
}): { asunto: string; html: string } {
  const cumplimiento =
    datos.total > 0 ? Math.round(((datos.cerrados + datos.noAplica) / datos.total) * 1000) / 10 : 100;

  const marca = datos.conPendientes ? 'CERRADO CON PENDIENTES' : 'CERRADO';
  const asunto = `[SOX ${datos.empresa}] Cierre ${nombreMes(datos.mes)} ${datos.anio} - ${marca} (${cumplimiento}% cumplimiento)`;

  const detalleResponsables = datos.responsables.length
    ? `
      <h3 style="margin:24px 0 4px;font-size:16px;color:#1f2933;">Responsables con controles no cerrados</h3>
      ${tabla(
        ['Responsable', 'Cargo', 'Control', 'Estado', 'Vencio', 'Atraso'],
        datos.responsables.flatMap((r) =>
          r.controles.map((c, i) => [
            i === 0 ? `${r.nombre} (${r.email})` : '',
            i === 0 ? (r.cargo ?? '-') : '',
            `${c.codigo} - ${c.nombre}`,
            c.estado,
            formatoCorto(c.fechaLimite),
            `${c.diasAtraso ?? 0} d`,
          ]),
        ),
      )}`
    : `<p style="color:#0b7a4b;font-weight:600;">Todos los responsables cerraron sus controles dentro del plazo.</p>`;

  const html = plantillaBase({
    titulo: `Cierre del periodo ${nombreMes(datos.mes)} ${datos.anio}`,
    preheader: `${marca} - cumplimiento ${cumplimiento}%`,
    cuerpo: `
      <p>Se informa el cierre del periodo de control interno de <strong>${datos.empresa}</strong>.</p>
      ${
        datos.conPendientes
          ? alerta(
              `El periodo se cerro <strong>con ${datos.pendientes} control(es) pendiente(s)</strong>. ` +
                `Estos controles quedan marcados y deben regularizarse en el periodo siguiente.`,
              'critico',
            )
          : alerta('El periodo se cerro con la totalidad de los controles completados.', 'info')
      }
      ${tablaDatos([
        { etiqueta: 'Empresa', valor: datos.empresa },
        { etiqueta: 'Periodo', valor: `${nombreMes(datos.mes)} ${datos.anio}` },
        { etiqueta: 'Estado', valor: marca },
        { etiqueta: 'Cerrado por', valor: datos.cerradoPor },
        { etiqueta: 'Controles totales', valor: String(datos.total) },
        { etiqueta: 'Cerrados', valor: String(datos.cerrados) },
        { etiqueta: 'No aplica', valor: String(datos.noAplica) },
        { etiqueta: 'Pendientes', valor: String(datos.pendientes) },
        { etiqueta: '% Cumplimiento', valor: `${cumplimiento}%` },
        { etiqueta: 'Deficiencias abiertas', valor: String(datos.deficienciasAbiertas) },
      ])}
      ${datos.notaCierre ? alerta(`<strong>Nota de cierre:</strong> ${datos.notaCierre}`, 'aviso') : ''}
      ${detalleResponsables}
    `,
    cta: { texto: 'Ver detalle del periodo', url: urlPeriodo(datos.periodoId) },
  });
  return { asunto, html };
}

/** 7. Digest semanal para lideres. */
export function correoDigestSemanal(datos: {
  nombre: string;
  empresa: string;
  anio: number;
  mes: number;
  total: number;
  completos: number;
  enProceso: number;
  vencidos: number;
  proximosAVencer: ResumenControl[];
}): { asunto: string; html: string } {
  const avance = datos.total ? Math.round((datos.completos / datos.total) * 100) : 100;
  const asunto = `[SOX ${datos.empresa}] Avance semanal ${nombreMes(datos.mes)} ${datos.anio}: ${avance}%`;
  const html = plantillaBase({
    titulo: 'Resumen semanal de avance',
    cuerpo: `
      <p>Estimado(a) <strong>${datos.nombre}</strong>,</p>
      ${tablaDatos([
        { etiqueta: 'Avance del periodo', valor: `${avance}% (${datos.completos}/${datos.total})` },
        { etiqueta: 'En proceso', valor: String(datos.enProceso) },
        { etiqueta: 'Vencidos', valor: String(datos.vencidos) },
      ])}
      ${
        datos.proximosAVencer.length
          ? `<h3 style="margin:20px 0 4px;font-size:15px;">Proximos a vencer</h3>` +
            tabla(
              ['Control', 'Responsable', 'Vence'],
              datos.proximosAVencer.map((c) => [c.codigo, c.responsable, formatoCorto(c.fechaLimite)]),
            )
          : ''
      }
    `,
    cta: { texto: 'Abrir tablero', url: `${env.PUBLIC_URL}/dashboard` },
  });
  return { asunto, html };
}
