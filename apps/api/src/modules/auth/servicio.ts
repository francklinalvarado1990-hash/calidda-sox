import { authenticator } from 'otplib';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { ErrorApp, noAutorizado, invalido, prohibido } from '../../core/errores.js';
import { hashPassword, hashToken, tokenAleatorio, validarPolitica, verificarPassword } from '../../core/seguridad.js';
import { firmarAccessToken } from '../../core/tokens.js';
import { auditar } from '../../core/auditoria.js';
import { DateTime } from 'luxon';

export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  usuario: {
    id: string;
    email: string;
    nombres: string;
    apellidos: string;
    rol: string;
    debeCambiarPwd: boolean;
    mfaHabilitado: boolean;
    /** El rol exige MFA y el usuario aun no lo configuro: debe enrolarse ya. */
    debeConfigurarMfa: boolean;
    empresas: { id: string; codigo: string; nombre: string }[];
  };
}

interface ContextoPeticion {
  ip?: string | null;
  userAgent?: string | null;
}

export async function login(
  email: string,
  password: string,
  codigoMfa: string | undefined,
  ctx: ContextoPeticion,
): Promise<ResultadoLogin> {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { empresas: { include: { empresa: true } } },
  });

  // Mensaje generico deliberado: no revelar si el correo existe.
  const generico = () => noAutorizado('Usuario o contrasena incorrectos.');

  if (!usuario || !usuario.activo) {
    await auditar({ accion: 'auth.login.fallido', entidad: 'Usuario', actorEmail: email, ...ctx });
    throw generico();
  }

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    throw prohibido(
      `Cuenta bloqueada temporalmente por intentos fallidos. Reintente despues de las ${DateTime.fromJSDate(usuario.bloqueadoHasta).toFormat('HH:mm')}.`,
    );
  }

  if (usuario.proveedorAuth !== 'LOCAL') {
    throw prohibido('Esta cuenta se autentica mediante el inicio de sesion corporativo (SSO).');
  }

  const ok = usuario.passwordHash ? await verificarPassword(password, usuario.passwordHash) : false;

  if (!ok) {
    const intentos = usuario.intentosFallidos + 1;
    const bloquear = intentos >= env.MAX_INTENTOS_LOGIN;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: bloquear ? 0 : intentos,
        bloqueadoHasta: bloquear
          ? DateTime.now().plus({ minutes: env.BLOQUEO_MINUTOS }).toJSDate()
          : null,
      },
    });
    await auditar({
      usuarioId: usuario.id,
      actorEmail: usuario.email,
      accion: bloquear ? 'auth.cuenta.bloqueada' : 'auth.login.fallido',
      entidad: 'Usuario',
      entidadId: usuario.id,
      ...ctx,
    });
    throw generico();
  }

  // MFA: obligatorio para los roles configurados, opcional para el resto.
  const mfaObligatorio = env.MFA_ROLES_OBLIGATORIO.includes(usuario.rol);
  if (usuario.mfaHabilitado) {
    if (!codigoMfa) throw new ErrorApp(401, 'MFA_REQUERIDO', 'Ingrese el codigo de verificacion.');
    if (!usuario.mfaSecret || !authenticator.check(codigoMfa, usuario.mfaSecret)) {
      await auditar({ usuarioId: usuario.id, actorEmail: usuario.email, accion: 'auth.mfa.fallido', entidad: 'Usuario', entidadId: usuario.id, ...ctx });
      throw noAutorizado('Codigo de verificacion invalido.');
    }
  }

  // Si el rol exige MFA y el usuario aun no lo tiene, se le permite entrar pero
  // la sesion queda restringida al enrolamiento (ver plugins/autenticacion.ts).
  // Bloquear el ingreso aqui dejaria al primer administrador sin forma de
  // configurar su autenticador.
  const debeConfigurarMfa = mfaObligatorio && !usuario.mfaHabilitado;

  const empresas = usuario.empresas.map((e) => e.empresa);
  const accessToken = await firmarAccessToken({
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    empresas: empresas.map((e) => e.id),
  });
  const refreshToken = await crearSesion(usuario.id, ctx);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date(), intentosFallidos: 0, bloqueadoHasta: null },
  });
  await auditar({ usuarioId: usuario.id, actorEmail: usuario.email, accion: 'auth.login', entidad: 'Usuario', entidadId: usuario.id, ...ctx });

  return {
    accessToken,
    refreshToken,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      rol: usuario.rol,
      debeCambiarPwd: usuario.debeCambiarPwd,
      mfaHabilitado: usuario.mfaHabilitado,
      debeConfigurarMfa,
      empresas: empresas.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre })),
    },
  };
}

async function crearSesion(usuarioId: string, ctx: ContextoPeticion): Promise<string> {
  const token = tokenAleatorio();
  await prisma.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      expiraEn: DateTime.now().plus({ days: env.REFRESH_TOKEN_TTL_DAYS }).toJSDate(),
    },
  });
  return token;
}

/** Rotacion de refresh token: el token usado se revoca y se emite uno nuevo. */
export async function refrescar(
  refreshToken: string,
  ctx: ContextoPeticion,
): Promise<{ accessToken: string; refreshToken: string }> {
  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { usuario: { include: { empresas: true } } },
  });

  if (!sesion || sesion.revocadaEn || sesion.expiraEn < new Date() || !sesion.usuario.activo) {
    throw noAutorizado('La sesion expiro. Vuelva a iniciar sesion.');
  }

  await prisma.sesion.update({ where: { id: sesion.id }, data: { revocadaEn: new Date() } });

  const accessToken = await firmarAccessToken({
    sub: sesion.usuario.id,
    email: sesion.usuario.email,
    rol: sesion.usuario.rol,
    empresas: sesion.usuario.empresas.map((e) => e.empresaId),
  });
  const nuevoRefresh = await crearSesion(sesion.usuarioId, ctx);
  return { accessToken, refreshToken: nuevoRefresh };
}

export async function cerrarSesion(refreshToken: string): Promise<void> {
  await prisma.sesion.updateMany({
    where: { tokenHash: hashToken(refreshToken), revocadaEn: null },
    data: { revocadaEn: new Date() },
  });
}

export async function cambiarPassword(
  usuarioId: string,
  actual: string,
  nueva: string,
  ctx: ContextoPeticion,
): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  if (!usuario.passwordHash || !(await verificarPassword(actual, usuario.passwordHash))) {
    throw noAutorizado('La contrasena actual no es correcta.');
  }
  const fallas = validarPolitica(nueva);
  if (fallas.length) throw invalido('La contrasena no cumple la politica de seguridad.', fallas);
  if (await verificarPassword(nueva, usuario.passwordHash)) {
    throw invalido('La nueva contrasena debe ser distinta de la actual.');
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash: await hashPassword(nueva), passwordSetAt: new Date(), debeCambiarPwd: false },
    }),
    // Al cambiar la contrasena se invalidan todas las sesiones abiertas.
    prisma.sesion.updateMany({ where: { usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } }),
  ]);

  await auditar({ usuarioId, actorEmail: usuario.email, accion: 'auth.password.cambio', entidad: 'Usuario', entidadId: usuarioId, ...ctx });
}

/** Genera el secreto TOTP y la URI para el codigo QR del autenticador. */
export async function iniciarMfa(usuarioId: string): Promise<{ secreto: string; otpauth: string }> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  const secreto = authenticator.generateSecret();
  await prisma.usuario.update({ where: { id: usuarioId }, data: { mfaSecret: secreto, mfaHabilitado: false } });
  return {
    secreto,
    otpauth: authenticator.keyuri(usuario.email, 'Controles SOX Calidda', secreto),
  };
}

export async function confirmarMfa(usuarioId: string, codigo: string): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  if (!usuario.mfaSecret || !authenticator.check(codigo, usuario.mfaSecret)) {
    throw invalido('El codigo ingresado no es valido.');
  }
  await prisma.usuario.update({ where: { id: usuarioId }, data: { mfaHabilitado: true } });
  await auditar({ usuarioId, actorEmail: usuario.email, accion: 'auth.mfa.habilitado', entidad: 'Usuario', entidadId: usuarioId });
}
