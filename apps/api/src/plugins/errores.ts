import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ErrorApp } from '../core/errores.js';
import { esProduccion } from '../config/env.js';

export default fp(async (app) => {
  app.setErrorHandler((error, req, reply) => {
    // Se conserva la referencia original: los `instanceof` de abajo estrechan
    // el tipo de `error` y luego ya no se puede leer `.message` de forma segura.
    const original = error as Error & { statusCode?: number };

    if (error instanceof ErrorApp) {
      return reply
        .status(error.status)
        .send({ error: error.codigo, mensaje: error.message, detalle: error.detalle });
    }

    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: 'VALIDACION',
        mensaje: 'Los datos enviados no son validos.',
        detalle: error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const campos = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'clave unica';
        return reply
          .status(409)
          .send({ error: 'DUPLICADO', mensaje: `Ya existe un registro con el mismo ${campos}.` });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'NO_ENCONTRADO', mensaje: 'El registro no existe.' });
      }
    }

    const status = original.statusCode ?? 500;
    if (status >= 500) req.log.error({ err: original }, 'Error no controlado');

    return reply.status(status).send({
      error: status >= 500 ? 'ERROR_INTERNO' : 'ERROR',
      mensaje:
        status >= 500 && esProduccion
          ? 'Ocurrio un error inesperado. El incidente fue registrado.'
          : original.message,
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: 'NO_ENCONTRADO', mensaje: `Ruta ${req.method} ${req.url} no existe.` });
  });
}, { name: 'errores' });
