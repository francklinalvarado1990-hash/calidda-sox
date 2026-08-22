import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

export interface Correo {
  para: string | string[];
  asunto: string;
  html: string;
  texto?: string;
  cc?: string[];
  bcc?: string[];
}

let transporter: Transporter | null = null;

function obtenerTransporte(): Transporter {
  if (transporter) return transporter;

  if (env.MAIL_DRIVER === 'smtp') {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    // Driver de desarrollo: no envia nada, deja el correo en el log del servidor.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function enviarCorreo(correo: Correo): Promise<{ ok: boolean; error?: string }> {
  const bccGobierno = env.MAIL_BCC_GOBIERNO ? [env.MAIL_BCC_GOBIERNO] : [];
  try {
    const info = await obtenerTransporte().sendMail({
      from: env.MAIL_FROM,
      to: Array.isArray(correo.para) ? correo.para.join(',') : correo.para,
      cc: correo.cc?.join(','),
      bcc: [...(correo.bcc ?? []), ...bccGobierno].join(',') || undefined,
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto ?? correo.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    if (env.MAIL_DRIVER === 'console') {
      console.info(`[correo:console] -> ${correo.para} :: ${correo.asunto}`);
    }
    return { ok: true, ...(info.messageId ? {} : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Verifica la conexion SMTP; se usa en el endpoint /salud del API. */
export async function verificarSmtp(): Promise<boolean> {
  if (env.MAIL_DRIVER !== 'smtp') return true;
  try {
    await obtenerTransporte().verify();
    return true;
  } catch {
    return false;
  }
}
