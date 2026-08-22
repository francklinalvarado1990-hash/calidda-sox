import { PrismaClient } from '@prisma/client';
import { env, esProduccion } from '../config/env.js';

export const prisma = new PrismaClient({
  log: esProduccion ? ['warn', 'error'] : ['warn', 'error'],
  datasources: { db: { url: env.DATABASE_URL } },
});

export async function cerrarPrisma(): Promise<void> {
  await prisma.$disconnect();
}
