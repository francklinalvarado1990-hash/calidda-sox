import { construirApp } from './app.js';
import { env } from './config/env.js';
import { cerrarPrisma } from './db/prisma.js';
import { detenerJobs, programarJobs } from './jobs/index.js';

const app = await construirApp();

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  programarJobs();
  app.log.info(`API de Controles SOX escuchando en http://${env.API_HOST}:${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/** Apagado ordenado: termina las peticiones en curso antes de cerrar. */
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void (async () => {
      app.log.info(`Recibida ${senal}, cerrando...`);
      detenerJobs();
      await app.close();
      await cerrarPrisma();
      process.exit(0);
    })();
  });
}
