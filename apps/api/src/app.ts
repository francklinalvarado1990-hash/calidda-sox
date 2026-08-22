import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { env, esProduccion } from './config/env.js';
import { prisma } from './db/prisma.js';
import { verificarSmtp } from './mail/transporte.js';
import autenticacion from './plugins/autenticacion.js';
import manejoErrores from './plugins/errores.js';
import rutasAuth from './modules/auth/rutas.js';
import rutasUsuarios from './modules/usuarios/rutas.js';
import rutasControles from './modules/controles/rutas.js';
import rutasPeriodos from './modules/periodos/rutas.js';
import rutasEjecuciones from './modules/ejecuciones/rutas.js';
import rutasEvidencias from './modules/evidencias/rutas.js';
import rutasDeficiencias from './modules/deficiencias/rutas.js';
import rutasDashboard from './modules/dashboard/rutas.js';
import rutasAuditoria from './modules/auditoria/rutas.js';
import rutasCatalogos from './modules/catalogos/rutas.js';
import rutasReportes from './modules/reportes/rutas.js';
import { JOBS_MANUALES, type NombreJob } from './jobs/index.js';

export async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: esProduccion
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.WEB_ORIGIN.split(','), credentials: true });
  await app.register(cookie, { secret: env.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(manejoErrores);
  await app.register(autenticacion);

  app.get('/api/salud', async () => {
    const [db, smtp] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      verificarSmtp(),
    ]);
    return {
      estado: db ? 'ok' : 'degradado',
      baseDatos: db,
      correo: smtp,
      driverCorreo: env.MAIL_DRIVER,
      almacenamiento: env.STORAGE_DRIVER,
      jobs: env.JOBS_HABILITADOS,
      version: process.env.npm_package_version ?? '1.0.0',
      hora: new Date().toISOString(),
    };
  });

  await app.register(rutasAuth, { prefix: '/api/auth' });
  await app.register(rutasUsuarios, { prefix: '/api/usuarios' });
  await app.register(rutasControles, { prefix: '/api/controles' });
  await app.register(rutasPeriodos, { prefix: '/api/periodos' });
  await app.register(rutasEjecuciones, { prefix: '/api/ejecuciones' });
  await app.register(rutasEvidencias, { prefix: '/api' });
  await app.register(rutasDeficiencias, { prefix: '/api/deficiencias' });
  await app.register(rutasDashboard, { prefix: '/api/dashboard' });
  await app.register(rutasAuditoria, { prefix: '/api/auditoria' });
  await app.register(rutasCatalogos, { prefix: '/api/catalogos' });
  await app.register(rutasReportes, { prefix: '/api/reportes' });

  /** Disparo manual de un job programado (contingencia y pruebas). */
  app.post('/api/jobs/:nombre/ejecutar', { preHandler: app.exigir('config.escribir') }, async (req) => {
    const { nombre } = z
      .object({ nombre: z.enum(['apertura-mensual', 'recordatorios', 'cierre-automatico', 'digest-semanal']) })
      .parse(req.params);
    const resultado = await JOBS_MANUALES[nombre as NombreJob]();
    return { job: nombre, resultado };
  });

  return app;
}
