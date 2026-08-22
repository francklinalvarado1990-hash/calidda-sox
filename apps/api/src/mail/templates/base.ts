import { env } from '../../config/env.js';

const COLOR_PRIMARIO = '#00539B';
const COLOR_ACENTO = '#F5A623';

export interface Fila {
  etiqueta: string;
  valor: string;
}

/** Envoltorio HTML comun. Estilos en linea: los clientes de correo ignoran <style>. */
export function plantillaBase(opts: {
  titulo: string;
  preheader?: string;
  cuerpo: string;
  cta?: { texto: string; url: string };
}): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2933;">
  <span style="display:none;font-size:0;line-height:0;max-height:0;opacity:0;">${escapar(opts.preheader ?? '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e7eb;">
        <tr><td style="background:${COLOR_PRIMARIO};padding:20px 24px;">
          <div style="color:#ffffff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">Cumplimiento SOX</div>
          <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:4px;">${escapar(opts.titulo)}</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6;">${opts.cuerpo}</td></tr>
        ${
          opts.cta
            ? `<tr><td style="padding:0 24px 28px;">
                 <a href="${opts.cta.url}" style="display:inline-block;background:${COLOR_ACENTO};color:#1f2933;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:6px;">${escapar(opts.cta.texto)}</a>
               </td></tr>`
            : ''
        }
        <tr><td style="background:#f9fafb;border-top:1px solid #e4e7eb;padding:16px 24px;font-size:12px;color:#616e7c;">
          Mensaje automatico del Repositorio de Controles SOX. No responda a este correo.<br>
          Plataforma: <a href="${env.PUBLIC_URL}" style="color:${COLOR_PRIMARIO};">${env.PUBLIC_URL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function tablaDatos(filas: Fila[]): string {
  const cuerpo = filas
    .map(
      (f) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#616e7c;white-space:nowrap;vertical-align:top;">${escapar(f.etiqueta)}</td>` +
        `<td style="padding:6px 0;font-weight:600;">${escapar(f.valor)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;font-size:14px;">${cuerpo}</table>`;
}

export function tabla(columnas: string[], filas: string[][]): string {
  const head = columnas
    .map(
      (c) =>
        `<th align="left" style="padding:8px 10px;background:#eef2f6;border-bottom:2px solid #d9e2ec;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#486581;">${escapar(c)}</th>`,
    )
    .join('');
  const body = filas
    .map(
      (fila) =>
        `<tr>${fila
          .map(
            (celda) =>
              `<td style="padding:8px 10px;border-bottom:1px solid #e4e7eb;font-size:13px;vertical-align:top;">${escapar(celda)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function alerta(texto: string, tono: 'info' | 'aviso' | 'critico' = 'info'): string {
  const colores = {
    info: { bg: '#e6f6ff', borde: '#2186c4', txt: '#035388' },
    aviso: { bg: '#fffbea', borde: '#f7c948', txt: '#8d2b0b' },
    critico: { bg: '#ffeeee', borde: '#e12d39', txt: '#8a041a' },
  }[tono];
  return `<div style="background:${colores.bg};border-left:4px solid ${colores.borde};color:${colores.txt};padding:12px 14px;border-radius:4px;margin:12px 0;font-size:14px;">${texto}</div>`;
}

export function escapar(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
