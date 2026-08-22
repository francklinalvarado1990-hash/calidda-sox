import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { verificarAccessToken } from '../core/tokens.js';
import { exigirPermiso, type Permiso } from '../core/permisos.js';
import { ErrorApp, noAutorizado } from '../core/errores.js';
import { prisma } from '../db/prisma.js';

function extraerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.sox_access;
  return cookie ?? null;
}

/** Rutas accesibles mientras el usuario tiene el enrolamiento de MFA pendiente. */
const RUTAS_SIN_MFA = ['/api/auth/mfa', '/api/auth/yo', '/api/auth/logout', '/api/auth/password'];

export default fp(async (app) => {
  async function autenticar(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extraerToken(req);
    if (!token) throw noAutorizado('No se envio el token de sesion.');

    const claims = await verificarAccessToken(token);

    // Se revalida contra la base: un usuario desactivado pierde acceso de
    // inmediato aunque su token siga vigente (requisito de ITGC de accesos).
    const usuario = await prisma.usuario.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, email: true, rol: true, activo: true, mfaHabilitado: true,
        empresas: { select: { empresaId: true } },
      },
    });
    if (!usuario || !usuario.activo) throw noAutorizado('La cuenta fue desactivada.');

    // Si el rol exige doble factor y el usuario no lo configuro, su sesion solo
    // sirve para enrolarse. Asi el primer administrador puede entrar a activarlo
    // sin que quede una cuenta privilegiada operando sin MFA.
    if (
      env.MFA_ROLES_OBLIGATORIO.includes(usuario.rol) &&
      !usuario.mfaHabilitado &&
      !RUTAS_SIN_MFA.some((r) => req.url.startsWith(r))
    ) {
      throw new ErrorApp(
        403,
        'MFA_ENROLAMIENTO_REQUERIDO',
        'Su rol exige doble factor. Configure el autenticador para continuar.',
      );
    }

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresas: usuario.empresas.map((e) => e.empresaId),
    };
  }

  app.decorate('autenticar', autenticar);

  app.decorate('exigir', (permiso: Permiso) => {
    return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
      await autenticar(req, reply);
      exigirPermiso(req.usuario!.rol, permiso);
    };
  });
}, { name: 'autenticacion' });
