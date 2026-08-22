import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, type Rol } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { auditar } from '../../core/auditoria.js';
import { hashPassword, tokenAleatorio, validarPolitica } from '../../core/seguridad.js';
import { conflicto, invalido, noEncontrado } from '../../core/errores.js';
import { MAX_PAGE_SIZE } from '../../config/constantes.js';

const ROLES = ['ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER', 'REVISOR', 'PREPARADOR', 'AUDITOR'] as const;

const esquemaCrear = z.object({
  email: z.string().email(),
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  cargo: z.string().optional(),
  rol: z.enum(ROLES),
  empresaIds: z.array(z.string()).min(1, 'Asigne al menos una empresa'),
  password: z.string().optional(),
});

const seleccion = {
  id: true, email: true, nombres: true, apellidos: true, cargo: true, rol: true,
  activo: true, mfaHabilitado: true, ultimoLogin: true, creadoEn: true,
  empresas: { select: { empresa: { select: { id: true, codigo: true, nombre: true } } } },
} satisfies Prisma.UsuarioSelect;

export default async function rutasUsuarios(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.exigir('usuario.leer') }, async (req) => {
    const q = z
      .object({
        buscar: z.string().optional(),
        rol: z.enum(ROLES).optional(),
        activo: z.enum(['true', 'false']).optional(),
        empresaId: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        tamano: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
      })
      .parse(req.query);

    const where: Prisma.UsuarioWhereInput = {
      ...(q.rol ? { rol: q.rol as Rol } : {}),
      ...(q.activo ? { activo: q.activo === 'true' } : {}),
      ...(q.empresaId ? { empresas: { some: { empresaId: q.empresaId } } } : {}),
      ...(q.buscar
        ? {
            OR: [
              { nombres: { contains: q.buscar, mode: 'insensitive' } },
              { apellidos: { contains: q.buscar, mode: 'insensitive' } },
              { email: { contains: q.buscar, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, datos] = await prisma.$transaction([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        select: seleccion,
        orderBy: [{ activo: 'desc' }, { apellidos: 'asc' }],
        skip: (q.pagina - 1) * q.tamano,
        take: q.tamano,
      }),
    ]);

    return {
      total,
      pagina: q.pagina,
      tamano: q.tamano,
      datos: datos.map((u) => ({ ...u, empresas: u.empresas.map((e) => e.empresa) })),
    };
  });

  app.post('/', { preHandler: app.exigir('usuario.escribir') }, async (req) => {
    const datos = esquemaCrear.parse(req.body);
    const email = datos.email.toLowerCase().trim();

    if (await prisma.usuario.findUnique({ where: { email } })) {
      throw conflicto(`Ya existe un usuario con el correo ${email}.`);
    }

    // Si no se envia contrasena, se genera una temporal de un solo uso.
    const passwordInicial = datos.password ?? `${tokenAleatorio(9)}Aa1!`;
    const fallas = validarPolitica(passwordInicial);
    if (datos.password && fallas.length) {
      throw invalido('La contrasena no cumple la politica de seguridad.', fallas);
    }

    const usuario = await prisma.usuario.create({
      data: {
        email,
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        cargo: datos.cargo ?? null,
        rol: datos.rol,
        passwordHash: await hashPassword(passwordInicial),
        passwordSetAt: new Date(),
        debeCambiarPwd: true,
        empresas: { create: datos.empresaIds.map((empresaId) => ({ empresaId })) },
      },
      select: seleccion,
    });

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'usuario.crear', entidad: 'Usuario', entidadId: usuario.id,
      despues: usuario, ip: req.ip,
    });

    return {
      ...usuario,
      empresas: usuario.empresas.map((e) => e.empresa),
      // Se devuelve una sola vez para entregarla por canal seguro al usuario.
      passwordTemporal: datos.password ? undefined : passwordInicial,
    };
  });

  app.patch('/:id', { preHandler: app.exigir('usuario.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const datos = z
      .object({
        nombres: z.string().min(2).optional(),
        apellidos: z.string().min(2).optional(),
        cargo: z.string().nullable().optional(),
        rol: z.enum(ROLES).optional(),
        activo: z.boolean().optional(),
        empresaIds: z.array(z.string()).optional(),
      })
      .parse(req.body);

    const antes = await prisma.usuario.findUnique({ where: { id }, select: seleccion });
    if (!antes) throw noEncontrado('El usuario');

    // Un administrador no puede desactivarse a si mismo y dejar el sistema sin gobierno.
    if (datos.activo === false && id === req.usuario!.id) {
      throw conflicto('No puede desactivar su propia cuenta.');
    }

    const despues = await prisma.usuario.update({
      where: { id },
      data: {
        ...(datos.nombres ? { nombres: datos.nombres } : {}),
        ...(datos.apellidos ? { apellidos: datos.apellidos } : {}),
        ...(datos.cargo !== undefined ? { cargo: datos.cargo } : {}),
        ...(datos.rol ? { rol: datos.rol } : {}),
        ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
        ...(datos.empresaIds
          ? {
              empresas: {
                deleteMany: {},
                create: datos.empresaIds.map((empresaId) => ({ empresaId })),
              },
            }
          : {}),
      },
      select: seleccion,
    });

    // Desactivar revoca las sesiones abiertas de inmediato.
    if (datos.activo === false) {
      await prisma.sesion.updateMany({
        where: { usuarioId: id, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
    }

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'usuario.actualizar', entidad: 'Usuario', entidadId: id,
      antes, despues, ip: req.ip,
    });

    return { ...despues, empresas: despues.empresas.map((e) => e.empresa) };
  });

  app.post('/:id/reset-password', { preHandler: app.exigir('usuario.escribir') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const temporal = `${tokenAleatorio(9)}Aa1!`;
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(temporal),
          passwordSetAt: new Date(),
          debeCambiarPwd: true,
          intentosFallidos: 0,
          bloqueadoHasta: null,
        },
      }),
      prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'usuario.reset_password', entidad: 'Usuario', entidadId: id, ip: req.ip,
    });
    return { passwordTemporal: temporal };
  });
}
