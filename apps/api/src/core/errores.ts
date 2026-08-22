/** Error de negocio con codigo HTTP y codigo estable para el cliente web. */
export class ErrorApp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    message: string,
    readonly detalle?: unknown,
  ) {
    super(message);
    this.name = 'ErrorApp';
  }
}

export const noEncontrado = (que: string) =>
  new ErrorApp(404, 'NO_ENCONTRADO', `${que} no existe o no esta disponible.`);

export const noAutorizado = (msg = 'Credenciales invalidas o sesion expirada.') =>
  new ErrorApp(401, 'NO_AUTENTICADO', msg);

export const prohibido = (msg = 'No cuenta con permisos para esta operacion.') =>
  new ErrorApp(403, 'PROHIBIDO', msg);

export const conflicto = (msg: string, detalle?: unknown) =>
  new ErrorApp(409, 'CONFLICTO', msg, detalle);

export const invalido = (msg: string, detalle?: unknown) =>
  new ErrorApp(422, 'VALIDACION', msg, detalle);
