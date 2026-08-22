/** Zona horaria operativa del negocio. Todo calculo de fechas la usa. */
export const ZONA_HORARIA = 'America/Lima';

/** Nombres legibles de los meses para asuntos de correo y reportes. */
export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const nombreMes = (mes: number): string => MESES_ES[mes - 1] ?? String(mes);

/** Aserciones de estados financieros usadas en la matriz de riesgos. */
export const ASERCIONES = {
  E: 'Existencia / Ocurrencia',
  I: 'Integridad',
  V: 'Valuacion / Exactitud',
  D: 'Derechos y Obligaciones',
  P: 'Presentacion y Revelacion',
} as const;

/** Tamano maximo de pagina en los listados, para proteger la base de datos. */
export const MAX_PAGE_SIZE = 200;
