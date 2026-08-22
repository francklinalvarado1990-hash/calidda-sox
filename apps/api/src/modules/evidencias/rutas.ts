import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { createId } from '../../utils/id.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { auditar } from '../../core/auditoria.js';
import { conflicto, invalido, noEncontrado, prohibido } from '../../core/errores.js';
import { estaCompleto } from '../../core/workflow.js';
import { almacen, construirClave, MIME_PERMITIDOS, sha256 } from '../../storage/index.js';

export default async function rutasEvidencias(app: FastifyInstance): Promise<void> {
  /**
   * Carga de evidencia. Se guarda con hash SHA-256 y clave de almacenamiento
   * unica; el archivo nunca se sobrescribe ni se borra fisicamente.
   */
  app.post('/ejecuciones/:ejecucionId/evidencias', {
    preHandler: app.exigir('evidencia.subir'),
    handler: async (req) => {
      const { ejecucionId } = z.object({ ejecucionId: z.string() }).parse(req.params);

      const ejecucion = await prisma.ejecucion.findUnique({
        where: { id: ejecucionId },
        include: { periodo: { include: { empresa: true } } },
      });
      if (!ejecucion) throw noEncontrado('La ejecucion del control');
      if (['CERRADO', 'CERRADO_CON_PENDIENTES'].includes(ejecucion.periodo.estado)) {
        throw conflicto('El periodo esta cerrado: no se admite nueva evidencia.');
      }
      if (estaCompleto(ejecucion.estado) && !['ADMIN', 'SOX_MANAGER'].includes(req.usuario!.rol)) {
        throw conflicto('El control ya esta cerrado. Solicite su reapertura para adjuntar evidencia.');
      }
      const puedeCargar =
        ejecucion.asignadoAId === req.usuario!.id ||
        ejecucion.revisorId === req.usuario!.id ||
        ejecucion.ownerId === req.usuario!.id ||
        ['ADMIN', 'SOX_MANAGER'].includes(req.usuario!.rol);
      if (!puedeCargar) throw prohibido('No participa en este control.');

      const archivo = await req.file({ limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } });
      if (!archivo) throw invalido('No se recibio ningun archivo.');

      const contenido = await archivo.toBuffer();
      if (!contenido.length) throw invalido('El archivo esta vacio.');
      if (!MIME_PERMITIDOS.has(archivo.mimetype)) {
        throw invalido(
          `Tipo de archivo no permitido (${archivo.mimetype}). ` +
            'Admitidos: PDF, Office, CSV, TXT, imagenes, correos .eml y ZIP.',
        );
      }

      const hash = sha256(contenido);

      // Si el mismo archivo ya esta cargado en este control, no se duplica.
      const yaExiste = await prisma.evidencia.findFirst({
        where: { ejecucionId, sha256: hash, anuladaEn: null },
      });
      if (yaExiste) {
        throw conflicto('Este archivo ya fue adjuntado a este control (mismo hash SHA-256).');
      }

      const idEvidencia = createId();
      const clave = construirClave({
        empresa: ejecucion.periodo.empresa.codigo,
        anio: ejecucion.periodo.anio,
        mes: ejecucion.periodo.mes,
        codigoControl: ejecucion.codigoControl,
        idEvidencia,
        nombreArchivo: archivo.filename,
      });

      const guardado = await almacen.guardar(clave, contenido);

      const descripcion = (archivo.fields?.descripcion as { value?: string } | undefined)?.value;

      const evidencia = await prisma.evidencia.create({
        data: {
          id: idEvidencia,
          ejecucionId,
          nombreArchivo: archivo.filename,
          descripcion: descripcion ?? null,
          mimeType: archivo.mimetype,
          tamanoBytes: guardado.tamanoBytes,
          sha256: guardado.sha256,
          storageKey: guardado.storageKey,
          subidoPorId: req.usuario!.id,
          retenerHasta: DateTime.now().plus({ years: env.RETENCION_ANIOS }).toJSDate(),
        },
      });

      await auditar({
        usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
        accion: 'evidencia.subir', entidad: 'Evidencia', entidadId: evidencia.id,
        despues: { ejecucionId, nombreArchivo: evidencia.nombreArchivo, sha256: evidencia.sha256 },
        ip: req.ip,
      });

      return evidencia;
    },
  });

  /** Descarga. Cada descarga queda auditada: es requisito de trazabilidad. */
  app.get('/evidencias/:id/descargar', { preHandler: app.exigir('ejecucion.leer') }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const evidencia = await prisma.evidencia.findUnique({ where: { id } });
    if (!evidencia) throw noEncontrado('La evidencia');

    const contenido = await almacen.leer(evidencia.storageKey);

    // Verificacion de integridad al vuelo: si el hash cambio, el archivo fue alterado.
    const hashActual = sha256(contenido);
    if (hashActual !== evidencia.sha256) {
      await auditar({
        usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
        accion: 'evidencia.integridad_comprometida', entidad: 'Evidencia', entidadId: id,
        despues: { esperado: evidencia.sha256, actual: hashActual }, ip: req.ip,
      });
      throw conflicto('La integridad del archivo no pudo verificarse. Se notifico al administrador.');
    }

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'evidencia.descargar', entidad: 'Evidencia', entidadId: id, ip: req.ip,
    });

    return reply
      .header('Content-Type', evidencia.mimeType)
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(evidencia.nombreArchivo)}"`)
      .header('X-Contenido-SHA256', evidencia.sha256)
      .send(contenido);
  });

  /** Anulacion logica. El archivo permanece en el repositorio por retencion. */
  app.post('/evidencias/:id/anular', { preHandler: app.exigir('evidencia.anular') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(10, 'Sustente la anulacion') }).parse(req.body);

    const evidencia = await prisma.evidencia.findUnique({ where: { id } });
    if (!evidencia) throw noEncontrado('La evidencia');
    if (evidencia.anuladaEn) throw conflicto('La evidencia ya estaba anulada.');

    const actualizada = await prisma.evidencia.update({
      where: { id },
      data: { anuladaEn: new Date(), anuladaPorId: req.usuario!.id, motivoAnulacion: motivo },
    });
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'evidencia.anular', entidad: 'Evidencia', entidadId: id,
      despues: { motivo }, ip: req.ip,
    });
    return actualizada;
  });
}
