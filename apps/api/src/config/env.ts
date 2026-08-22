import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// El .env vive en la raiz del monorepo para compartirse entre api y web.
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

const listaCsv = (valorPorDefecto: string) =>
  z
    .string()
    .default(valorPorDefecto)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('America/Lima'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),

  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(30),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  MAX_INTENTOS_LOGIN: z.coerce.number().int().positive().default(5),
  BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),
  MFA_ROLES_OBLIGATORIO: listaCsv(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  RETENCION_ANIOS: z.coerce.number().int().positive().default(7),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  MAIL_DRIVER: z.enum(['smtp', 'console']).default('console'),
  MAIL_FROM: z.string().default('Controles SOX Calidda <sox-no-reply@calidda.com.pe>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_BCC_GOBIERNO: z.string().optional(),

  DIA_APERTURA_PERIODO: z.coerce.number().int().min(1).max(28).default(1),
  DIAS_HABILES_CIERRE_PERIODO: z.coerce.number().int().positive().default(10),
  RECORDATORIO_DIAS_PREVIOS: listaCsv('7,3,1').transform((v) => v.map(Number)),
  RECORDATORIO_VENCIDO_CADA_DIAS: z.coerce.number().int().positive().default(2),
  JOBS_HABILITADOS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  SSO_HABILITADO: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),
  ENTRA_CLIENT_SECRET: z.string().optional(),
});

const parsed = esquema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuracion invalida en las variables de entorno:\n${detalle}`);
}

export const env = parsed.data;
export const esProduccion = env.NODE_ENV === 'production';
export type Env = typeof env;
