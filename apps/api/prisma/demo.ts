/**
 * Genera datos de demostracion: seis periodos historicos con distintos grados de
 * cumplimiento, evidencias, aprobaciones y deficiencias.
 *
 * Sirve para capacitacion y para ver el tablero con historia real.
 * NO ejecutar en produccion: crea movimientos ficticios en la pista de auditoria.
 *
 *   npm run db:demo -w @calidda-sox/api
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient, type EstadoEjecucion } from '@prisma/client';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

const prisma = new PrismaClient();

/** Generador pseudoaleatorio con semilla: la demo es siempre reproducible. */
function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const MESES_ATRAS = 6;

async function main(): Promise<void> {
  const { abrirPeriodo, cerrarPeriodo } = await import('../src/modules/periodos/servicio.js');
  const { periodoAnterior, rangoPeriodo } = await import('../src/utils/fechas.js');

  const sox = await prisma.usuario.findFirstOrThrow({ where: { rol: 'SOX_MANAGER' } });
  const revisor = await prisma.usuario.findFirstOrThrow({ where: { rol: 'REVISOR' } });
  const owner = await prisma.usuario.findFirstOrThrow({ where: { rol: 'CONTROL_OWNER' } });
  const actor = { id: sox.id, email: sox.email, nombre: `${sox.nombres} ${sox.apellidos}` };
  const empresas = await prisma.empresa.findMany({ where: { activo: true } });

  const hoy = new Date();
  let cursor = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  const periodos: { anio: number; mes: number }[] = [];
  for (let i = 0; i < MESES_ATRAS; i += 1) {
    periodos.unshift({ ...cursor });
    cursor = periodoAnterior(cursor.anio, cursor.mes);
  }

  const rnd = aleatorio(20260821);

  for (const [indice, p] of periodos.entries()) {
    // El cumplimiento mejora con el tiempo: una curva creible de maduracion.
    const objetivo = 0.55 + indice * 0.08 + rnd() * 0.08;
    const esUltimo = indice === periodos.length - 1;

    for (const empresa of empresas) {
      const r = await abrirPeriodo(empresa.id, p.anio, p.mes, actor, { notificar: false });
      if (!r.ejecucionesCreadas && indice > 0) continue;

      const ejecuciones = await prisma.ejecucion.findMany({
        where: { periodoId: r.periodo.id, estado: 'PENDIENTE' },
      });
      const { fin } = rangoPeriodo(p.anio, p.mes);

      for (const e of ejecuciones) {
        const suerte = rnd();
        let estado: EstadoEjecucion = 'CERRADO';
        if (suerte > objetivo) {
          // El resto se reparte entre estados intermedios y abandono.
          estado = suerte > objetivo + 0.12 ? 'PENDIENTE' : 'EN_REVISION';
        } else if (suerte < 0.05) {
          estado = 'NO_APLICA';
        }

        const completo = estado === 'CERRADO' || estado === 'NO_APLICA';
        const cierre = new Date(fin.toJSDate().getTime() + Math.floor(rnd() * 6) * 86400000);

        await prisma.ejecucion.update({
          where: { id: e.id },
          data: {
            estado,
            resultado: estado === 'NO_APLICA' ? 'NO_APLICA' : completo ? (rnd() < 0.12 ? 'DEFICIENTE' : 'EFECTIVO') : null,
            conclusion: completo
              ? 'Se ejecuto el control conforme al procedimiento. Se revisaron los sustentos del periodo sin observaciones relevantes.'
              : null,
            muestraTamano: completo ? 10 + Math.floor(rnd() * 30) : null,
            excepciones: completo ? (rnd() < 0.15 ? 1 : 0) : null,
            fechaInicio: fin.toJSDate(),
            fechaEnvioRevision: completo || estado === 'EN_REVISION' ? fin.toJSDate() : null,
            fechaCierre: completo ? cierre : null,
          },
        });

        if (completo && estado === 'CERRADO') {
          const contenido = Buffer.from(`Evidencia de demostracion de ${e.codigoControl} ${p.anio}-${p.mes}`);
          await prisma.evidencia.create({
            data: {
              ejecucionId: e.id,
              nombreArchivo: `${e.codigoControl}_${p.anio}-${String(p.mes).padStart(2, '0')}.txt`,
              descripcion: 'Evidencia generada para demostracion',
              mimeType: 'text/plain',
              tamanoBytes: contenido.length,
              sha256: createHash('sha256').update(contenido).digest('hex'),
              storageKey: `demo/${randomUUID()}`,
              subidoPorId: e.asignadoAId ?? sox.id,
              retenerHasta: new Date(Date.now() + 7 * 365 * 86400000),
            },
          });

          for (const [paso, accion, usuarioId, de, a] of [
            ['PREPARACION', 'ENVIAR', e.asignadoAId ?? sox.id, 'EN_EJECUCION', 'EN_REVISION'],
            ['REVISION', 'APROBAR', revisor.id, 'EN_REVISION', 'APROBADO'],
            ['APROBACION_OWNER', 'APROBAR', owner.id, 'APROBADO', 'CERRADO'],
          ] as const) {
            await prisma.aprobacion.create({
              data: {
                ejecucionId: e.id,
                paso: paso as never,
                accion: accion as never,
                usuarioId,
                estadoAnterior: de as never,
                estadoNuevo: a as never,
                creadoEn: cierre,
              },
            });
          }
        }

        // Algunas ejecuciones deficientes generan un hallazgo con plan de accion.
        if (completo && rnd() < 0.07) {
          const anio = p.anio;
          const n = await prisma.deficiencia.count({ where: { codigo: { startsWith: `DEF-${anio}-` } } });
          await prisma.deficiencia.create({
            data: {
              ejecucionId: e.id,
              codigo: `DEF-${anio}-${String(n + 1).padStart(4, '0')}`,
              severidad: rnd() < 0.2 ? 'DEFICIENCIA_SIGNIFICATIVA' : 'DEFICIENCIA',
              estado: rnd() < 0.5 ? 'EN_REMEDIACION' : 'CERRADA',
              descripcion:
                'Durante la ejecucion del control se identificaron partidas sin sustento documentario suficiente ' +
                'para acreditar la revision efectuada por el responsable.',
              causaRaiz: 'Falta de formalizacion del procedimiento de archivo de sustentos.',
              planAccion: 'Actualizar el instructivo y capacitar al equipo en el archivo de evidencias.',
              responsableId: owner.id,
              fechaCompromiso: new Date(cierre.getTime() + 45 * 86400000),
            },
          });
        }
      }

      // El periodo del mes en curso queda abierto; los anteriores se cierran.
      if (!esUltimo) {
        await cerrarPeriodo(r.periodo.id, actor, {
          forzar: true,
          nota: 'Cierre de demostracion generado automaticamente para poblar el historico.',
          notificar: false,
        });
      }
    }
  }

  const [totalPeriodos, totalEjecuciones, totalDef] = await Promise.all([
    prisma.periodo.count(),
    prisma.ejecucion.count(),
    prisma.deficiencia.count(),
  ]);
  console.info(
    `Datos de demostracion listos: ${totalPeriodos} periodos, ${totalEjecuciones} ejecuciones, ${totalDef} deficiencias.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
