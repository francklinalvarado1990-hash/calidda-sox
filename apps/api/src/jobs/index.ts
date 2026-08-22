import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { ZONA_HORARIA } from '../config/constantes.js';
import { enviarRecordatorios, marcarVencidos } from './recordatorios.js';
import { aperturaAutomatica, cierreAutomatico, digestSemanal } from './cicloMensual.js';

const tareas: ScheduledTask[] = [];

/** Envuelve cada job para que un fallo no tumbe el proceso ni silencie el error. */
function seguro(nombre: string, fn: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    const inicio = Date.now();
    try {
      const resultado = await fn();
      console.info(`[job:${nombre}] ok en ${Date.now() - inicio}ms`, JSON.stringify(resultado));
    } catch (err) {
      console.error(`[job:${nombre}] fallo:`, err instanceof Error ? err.stack : err);
    }
  };
}

/**
 * Programacion de los procesos automaticos. Todos en zona horaria de Lima.
 *
 * Nota de despliegue: si se corren varias instancias del API, solo una debe
 * tener JOBS_HABILITADOS=true para evitar ejecuciones duplicadas.
 */
export function programarJobs(): void {
  if (!env.JOBS_HABILITADOS) {
    console.info('[jobs] deshabilitados por configuracion (JOBS_HABILITADOS=false)');
    return;
  }

  const opciones = { timezone: ZONA_HORARIA } as const;

  // Apertura del periodo: dia configurado, 06:00.
  tareas.push(
    cron.schedule(
      `0 6 ${env.DIA_APERTURA_PERIODO} * *`,
      seguro('apertura-mensual', aperturaAutomatica),
      opciones,
    ),
  );

  // Marcado de vencidos + recordatorios: dias habiles a las 08:00.
  tareas.push(
    cron.schedule(
      '0 8 * * 1-5',
      seguro('recordatorios', async () => ({
        vencidosMarcados: await marcarVencidos(),
        ...(await enviarRecordatorios()),
      })),
      opciones,
    ),
  );

  // Evaluacion de cierre del periodo anterior: diaria a las 07:00.
  tareas.push(cron.schedule('0 7 * * *', seguro('cierre-automatico', cierreAutomatico), opciones));

  // Digest de avance: lunes 07:30.
  tareas.push(cron.schedule('30 7 * * 1', seguro('digest-semanal', digestSemanal), opciones));

  console.info(`[jobs] ${tareas.length} procesos programados (zona ${ZONA_HORARIA})`);
}

export function detenerJobs(): void {
  for (const t of tareas) t.stop();
  tareas.length = 0;
}

/** Ejecucion manual de un job desde el API (util para pruebas y contingencia). */
export const JOBS_MANUALES = {
  'apertura-mensual': aperturaAutomatica,
  recordatorios: async () => ({
    vencidosMarcados: await marcarVencidos(),
    ...(await enviarRecordatorios()),
  }),
  'cierre-automatico': cierreAutomatico,
  'digest-semanal': digestSemanal,
} as const;

export type NombreJob = keyof typeof JOBS_MANUALES;
