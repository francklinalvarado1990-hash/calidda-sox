import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const LONGITUD_CLAVE = 64;
const LONGITUD_SAL = 16;

/**
 * Hash de contrasena con scrypt (incluido en Node, sin dependencias nativas).
 * Formato almacenado: `scrypt$<salt-hex>$<hash-hex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(LONGITUD_SAL);
  const derivada = await scrypt(password, salt, LONGITUD_CLAVE);
  return `scrypt$${salt.toString('hex')}$${derivada.toString('hex')}`;
}

/** Comparacion en tiempo constante para evitar ataques de temporizacion. */
export async function verificarPassword(password: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = partes as [string, string, string];
  try {
    const derivada = await scrypt(password, Buffer.from(saltHex, 'hex'), LONGITUD_CLAVE);
    const esperado = Buffer.from(hashHex, 'hex');
    return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
  } catch {
    return false;
  }
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const tokenAleatorio = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Politica minima de contrasena para cuentas locales. */
export function validarPolitica(password: string): string[] {
  const fallas: string[] = [];
  if (password.length < 12) fallas.push('Debe tener al menos 12 caracteres.');
  if (!/[A-Z]/.test(password)) fallas.push('Debe incluir al menos una mayuscula.');
  if (!/[a-z]/.test(password)) fallas.push('Debe incluir al menos una minuscula.');
  if (!/[0-9]/.test(password)) fallas.push('Debe incluir al menos un numero.');
  if (!/[^A-Za-z0-9]/.test(password)) fallas.push('Debe incluir al menos un caracter especial.');
  return fallas;
}
