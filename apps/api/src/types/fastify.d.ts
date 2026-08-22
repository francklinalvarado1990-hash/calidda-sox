import type { Rol } from '@prisma/client';
import type { Permiso } from '../core/permisos.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario autenticado, poblado por el plugin de autenticacion. */
    usuario?: {
      id: string;
      email: string;
      rol: Rol;
      empresas: string[];
    };
  }
  interface FastifyInstance {
    /** preHandler: exige sesion valida. */
    autenticar: import('fastify').preHandlerHookHandler;
    /** preHandler factory: exige sesion valida + permiso concreto. */
    exigir: (permiso: Permiso) => import('fastify').preHandlerHookHandler;
  }
}
