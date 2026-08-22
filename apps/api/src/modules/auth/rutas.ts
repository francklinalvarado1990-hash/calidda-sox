import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import {
  cambiarPassword,
  cerrarSesion,
  confirmarMfa,
  iniciarMfa,
  login,
  refrescar,
} from './servicio.js';
import { prisma } from '../../db/prisma.js';
import { noAutorizado } from '../../core/errores.js';

const esquemaLogin = z.object({
  email: z.string().email('Correo invalido'),
  password: z.string().min(1, 'Ingrese su contrasena'),
  codigoMfa: z.string().optional(),
});

const opcionesCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export default async function rutasAuth(app: FastifyInstance): Promise<void> {
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    handler: async (req, reply) => {
      const datos = esquemaLogin.parse(req.body);
      const resultado = await login(datos.email, datos.password, datos.codigoMfa, {
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });

      reply
        .setCookie('sox_access', resultado.accessToken, {
          ...opcionesCookie,
          maxAge: env.ACCESS_TOKEN_TTL_MIN * 60,
        })
        .setCookie('sox_refresh', resultado.refreshToken, {
          ...opcionesCookie,
          path: '/api/auth',
          maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400,
        });

      return resultado;
    },
  });

  app.post('/refresh', async (req, reply) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies.sox_refresh ?? (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!token) throw noAutorizado('No hay sesion activa.');

    const resultado = await refrescar(token, { ip: req.ip, userAgent: req.headers['user-agent'] ?? null });
    reply
      .setCookie('sox_access', resultado.accessToken, {
        ...opcionesCookie,
        maxAge: env.ACCESS_TOKEN_TTL_MIN * 60,
      })
      .setCookie('sox_refresh', resultado.refreshToken, {
        ...opcionesCookie,
        path: '/api/auth',
        maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400,
      });
    return resultado;
  });

  app.post('/logout', async (req, reply) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    if (cookies.sox_refresh) await cerrarSesion(cookies.sox_refresh);
    reply.clearCookie('sox_access', { path: '/' }).clearCookie('sox_refresh', { path: '/api/auth' });
    return { ok: true };
  });

  app.get('/yo', { preHandler: app.autenticar }, async (req) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: req.usuario!.id },
      select: {
        id: true, email: true, nombres: true, apellidos: true, cargo: true, rol: true,
        mfaHabilitado: true, debeCambiarPwd: true, ultimoLogin: true,
        empresas: { select: { empresa: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });
    return { ...usuario, empresas: usuario.empresas.map((e) => e.empresa) };
  });

  app.post('/password', { preHandler: app.autenticar }, async (req) => {
    const datos = z
      .object({ actual: z.string().min(1), nueva: z.string().min(12) })
      .parse(req.body);
    await cambiarPassword(req.usuario!.id, datos.actual, datos.nueva, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return { ok: true, mensaje: 'Contrasena actualizada. Vuelva a iniciar sesion.' };
  });

  app.post('/mfa/iniciar', { preHandler: app.autenticar }, async (req) => iniciarMfa(req.usuario!.id));

  app.post('/mfa/confirmar', { preHandler: app.autenticar }, async (req) => {
    const { codigo } = z.object({ codigo: z.string().length(6) }).parse(req.body);
    await confirmarMfa(req.usuario!.id, codigo);
    return { ok: true };
  });
}
