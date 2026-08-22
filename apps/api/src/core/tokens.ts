import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import type { Rol } from '@prisma/client';
import { noAutorizado } from './errores.js';

const secreto = new TextEncoder().encode(env.JWT_SECRET);

export interface Claims {
  sub: string;
  email: string;
  rol: Rol;
  empresas: string[];
}

export async function firmarAccessToken(claims: Claims): Promise<string> {
  return new SignJWT({ email: claims.email, rol: claims.rol, empresas: claims.empresas })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('calidda-sox')
    .setAudience('calidda-sox-web')
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secreto);
}

export async function verificarAccessToken(token: string): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, secreto, {
      issuer: 'calidda-sox',
      audience: 'calidda-sox-web',
    });
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      rol: payload.rol as Rol,
      empresas: (payload.empresas as string[]) ?? [],
    };
  } catch {
    throw noAutorizado();
  }
}
