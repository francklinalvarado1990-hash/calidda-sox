import { randomUUID } from 'node:crypto';

/** Identificador opaco para entidades creadas fuera de Prisma (evidencias). */
export const createId = (): string => randomUUID().replace(/-/g, '');
