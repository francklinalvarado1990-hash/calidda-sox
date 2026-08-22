/**
 * Semilla inicial: empresas, procesos, matriz de controles de ejemplo, usuarios
 * de arranque y feriados de Peru.
 *
 * En produccion, ejecutar una sola vez y cambiar de inmediato las contrasenas
 * temporales que imprime este script.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, type Frecuencia, type NaturalezaControl, type Rol, type TipoControl } from '@prisma/client';
import { hashPassword } from '../src/core/seguridad.js';

// El .env vive en la raiz del monorepo, no en apps/api.
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

const prisma = new PrismaClient();

const FERIADOS_PE = (anio: number): { fecha: string; nombre: string }[] => [
  { fecha: `${anio}-01-01`, nombre: 'Ano Nuevo' },
  { fecha: `${anio}-05-01`, nombre: 'Dia del Trabajo' },
  { fecha: `${anio}-06-07`, nombre: 'Batalla de Arica y Dia de la Bandera' },
  { fecha: `${anio}-06-29`, nombre: 'San Pedro y San Pablo' },
  { fecha: `${anio}-07-23`, nombre: 'Dia de la Fuerza Aerea' },
  { fecha: `${anio}-07-28`, nombre: 'Fiestas Patrias' },
  { fecha: `${anio}-07-29`, nombre: 'Fiestas Patrias' },
  { fecha: `${anio}-08-06`, nombre: 'Batalla de Junin' },
  { fecha: `${anio}-08-30`, nombre: 'Santa Rosa de Lima' },
  { fecha: `${anio}-10-08`, nombre: 'Combate de Angamos' },
  { fecha: `${anio}-11-01`, nombre: 'Todos los Santos' },
  { fecha: `${anio}-12-08`, nombre: 'Inmaculada Concepcion' },
  { fecha: `${anio}-12-09`, nombre: 'Batalla de Ayacucho' },
  { fecha: `${anio}-12-25`, nombre: 'Navidad' },
];

const PROCESOS = [
  { codigo: 'ING', nombre: 'Ingresos y cuentas por cobrar', sub: ['FACT', 'COBR'] },
  { codigo: 'P2P', nombre: 'Compras y cuentas por pagar', sub: ['REQ', 'PAGO'] },
  { codigo: 'TES', nombre: 'Tesoreria', sub: ['BANC'] },
  { codigo: 'NOM', nombre: 'Gestion humana y nomina', sub: ['PLAN'] },
  { codigo: 'ACT', nombre: 'Activo fijo y obras en curso', sub: ['CAPEX'] },
  { codigo: 'CIE', nombre: 'Cierre contable y reporte financiero', sub: ['CONC', 'ASIE'] },
  { codigo: 'ITGC', nombre: 'Controles generales de TI', sub: ['ACC', 'CAMB', 'OPER'] },
  { codigo: 'INV', nombre: 'Inventarios y almacenes', sub: [] },
];

interface PlantillaControl {
  proceso: string;
  sub?: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  riesgo: string;
  tipo: TipoControl;
  naturaleza: NaturalezaControl;
  frecuencia: Frecuencia;
  esClave: boolean;
  aserciones: string[];
  diasHabilesPlazo: number;
  evidenciaRequerida: string;
}

const CONTROLES: PlantillaControl[] = [
  {
    proceso: 'ING', sub: 'FACT', codigo: 'ING-01',
    nombre: 'Conciliacion de consumos facturados vs. lecturas de medidores',
    descripcion:
      'El analista de facturacion concilia mensualmente el volumen de gas facturado contra las lecturas ' +
      'registradas en el sistema de medicion, investiga y documenta toda diferencia superior al 1% y ' +
      'gestiona los ajustes correspondientes antes del cierre contable.',
    riesgo: 'Ingresos registrados por importes distintos al consumo real de los clientes.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 5,
    evidenciaRequerida: 'Hoja de conciliacion firmada, reporte de lecturas y sustento de diferencias.',
  },
  {
    proceso: 'ING', sub: 'COBR', codigo: 'ING-02',
    nombre: 'Revision del calculo de la estimacion de cobranza dudosa',
    descripcion:
      'El jefe de creditos y cobranzas revisa el calculo de la provision por deterioro de cuentas por cobrar ' +
      'segun la matriz de antiguedad y las tasas de perdida esperada, y aprueba el asiento resultante.',
    riesgo: 'Subvaluacion de la provision e ingresos sobrestimados.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['V'], diasHabilesPlazo: 6,
    evidenciaRequerida: 'Reporte de antiguedad, calculo en Excel y correo de aprobacion.',
  },
  {
    proceso: 'P2P', sub: 'REQ', codigo: 'P2P-01',
    nombre: 'Aprobacion de ordenes de compra segun matriz de autorizaciones',
    descripcion:
      'Toda orden de compra es aprobada en el ERP conforme a la matriz de niveles de autorizacion vigente. ' +
      'Mensualmente se extrae el listado de ordenes emitidas y se valida que cada una cuente con la ' +
      'aprobacion del nivel correspondiente al monto.',
    riesgo: 'Compromisos de gasto no autorizados.',
    tipo: 'PREVENTIVO', naturaleza: 'HIBRIDO', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'D'], diasHabilesPlazo: 5,
    evidenciaRequerida: 'Extraccion del ERP con aprobadores y matriz de autorizaciones vigente.',
  },
  {
    proceso: 'P2P', sub: 'PAGO', codigo: 'P2P-02',
    nombre: 'Conciliacion de tres vias: orden de compra, recepcion y factura',
    descripcion:
      'Antes del pago se valida la coincidencia entre la orden de compra, el acta de recepcion del bien o ' +
      'servicio y la factura del proveedor. Las excepciones se escalan al jefe de compras.',
    riesgo: 'Pagos por bienes o servicios no recibidos o a precios distintos a lo pactado.',
    tipo: 'PREVENTIVO', naturaleza: 'AUTOMATICO', frecuencia: 'DIARIA', esClave: true,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 5,
    evidenciaRequerida: 'Reporte de excepciones del ERP y sustento de su resolucion.',
  },
  {
    proceso: 'TES', sub: 'BANC', codigo: 'TES-01',
    nombre: 'Conciliacion bancaria de todas las cuentas',
    descripcion:
      'El analista de tesoreria concilia los saldos contables con los estados de cuenta bancarios de todas ' +
      'las cuentas activas. Las partidas conciliatorias mayores a 30 dias se investigan y regularizan.',
    riesgo: 'Saldos de efectivo incorrectos o movimientos no registrados.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 7,
    evidenciaRequerida: 'Conciliacion por cuenta, estados de cuenta y detalle de partidas pendientes.',
  },
  {
    proceso: 'TES', codigo: 'TES-02',
    nombre: 'Revision de firmas autorizadas y limites en la banca electronica',
    descripcion:
      'Trimestralmente se revisa que los usuarios habilitados en la banca electronica y sus limites de ' +
      'aprobacion correspondan al poder vigente y a la matriz de autorizaciones.',
    riesgo: 'Desembolsos ejecutados por personal no autorizado.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'TRIMESTRAL', esClave: true,
    aserciones: ['E', 'D'], diasHabilesPlazo: 10,
    evidenciaRequerida: 'Reporte de usuarios de la banca, poderes vigentes y acta de revision.',
  },
  {
    proceso: 'NOM', sub: 'PLAN', codigo: 'NOM-01',
    nombre: 'Revision y aprobacion de la planilla mensual',
    descripcion:
      'El gerente de gestion humana revisa el resumen de planilla contra el mes anterior, sustenta las ' +
      'variaciones relevantes (altas, ceses, reajustes) y aprueba el pago.',
    riesgo: 'Pagos de remuneraciones a personal inexistente o por importes incorrectos.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 4,
    evidenciaRequerida: 'Resumen comparativo de planilla, sustento de variaciones y aprobacion.',
  },
  {
    proceso: 'ACT', sub: 'CAPEX', codigo: 'ACT-01',
    nombre: 'Revision de la capitalizacion de obras en curso',
    descripcion:
      'Se revisa que las obras concluidas se transfieran a activo fijo en el periodo correspondiente y que ' +
      'los costos capitalizados cumplan la politica contable de la compania.',
    riesgo: 'Gastos capitalizados indebidamente o activos no incorporados oportunamente.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: false,
    aserciones: ['E', 'V', 'P'], diasHabilesPlazo: 8,
    evidenciaRequerida: 'Reporte de obras en curso, actas de conclusion y asientos de transferencia.',
  },
  {
    proceso: 'CIE', sub: 'CONC', codigo: 'CIE-01',
    nombre: 'Conciliacion de cuentas de balance y revision de partidas antiguas',
    descripcion:
      'Cada cuenta de balance significativa se concilia contra su detalle auxiliar. El contador general ' +
      'revisa y aprueba las conciliaciones, y da seguimiento a las partidas con antiguedad mayor a 90 dias.',
    riesgo: 'Saldos contables sin sustento o con diferencias no detectadas.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 8,
    evidenciaRequerida: 'Formato de conciliacion por cuenta con firma del preparador y del revisor.',
  },
  {
    proceso: 'CIE', sub: 'ASIE', codigo: 'CIE-02',
    nombre: 'Aprobacion de asientos manuales de ajuste',
    descripcion:
      'Todo asiento manual es revisado y aprobado por una persona distinta a quien lo registro, con sustento ' +
      'documentario adjunto. Mensualmente se revisa el listado completo de asientos manuales del periodo.',
    riesgo: 'Registro de asientos sin sustento o con proposito de manipulacion de resultados.',
    tipo: 'PREVENTIVO', naturaleza: 'HIBRIDO', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['E', 'I', 'V', 'P'], diasHabilesPlazo: 6,
    evidenciaRequerida: 'Listado de asientos manuales del periodo con evidencia de aprobacion.',
  },
  {
    proceso: 'ITGC', sub: 'ACC', codigo: 'ITGC-01',
    nombre: 'Revision trimestral de accesos a sistemas criticos',
    descripcion:
      'El dueno de cada aplicacion critica revisa la relacion de usuarios y perfiles, confirma que ' +
      'corresponden a personal activo y a funciones vigentes, y solicita la baja de los accesos innecesarios.',
    riesgo: 'Accesos indebidos que permitan transacciones no autorizadas o rupturas de segregacion.',
    tipo: 'DETECTIVO', naturaleza: 'ITGC', frecuencia: 'TRIMESTRAL', esClave: true,
    aserciones: ['E', 'D'], diasHabilesPlazo: 10,
    evidenciaRequerida: 'Reporte de usuarios por sistema, acta de revision y tickets de baja.',
  },
  {
    proceso: 'ITGC', sub: 'CAMB', codigo: 'ITGC-02',
    nombre: 'Gestion de cambios en aplicaciones financieras',
    descripcion:
      'Todo cambio en aplicaciones con impacto financiero se registra, se prueba en un ambiente separado y ' +
      'se aprueba antes del pase a produccion. La persona que desarrolla no ejecuta el pase.',
    riesgo: 'Cambios no autorizados que afecten la integridad de la informacion financiera.',
    tipo: 'PREVENTIVO', naturaleza: 'ITGC', frecuencia: 'MENSUAL', esClave: true,
    aserciones: ['I', 'V'], diasHabilesPlazo: 6,
    evidenciaRequerida: 'Listado de pases a produccion del periodo con aprobaciones y evidencia de pruebas.',
  },
  {
    proceso: 'ITGC', sub: 'OPER', codigo: 'ITGC-03',
    nombre: 'Monitoreo de respaldos y pruebas de restauracion',
    descripcion:
      'Se verifica la ejecucion exitosa de los respaldos de las bases de datos financieras y, semestralmente, ' +
      'se realiza una prueba de restauracion documentada.',
    riesgo: 'Perdida de informacion financiera sin posibilidad de recuperacion.',
    tipo: 'DETECTIVO', naturaleza: 'ITGC', frecuencia: 'MENSUAL', esClave: false,
    aserciones: ['I'], diasHabilesPlazo: 5,
    evidenciaRequerida: 'Reporte de ejecucion de respaldos y acta de prueba de restauracion.',
  },
  {
    proceso: 'INV', codigo: 'INV-01',
    nombre: 'Toma de inventario fisico y conciliacion con el sistema',
    descripcion:
      'Se realiza el conteo fisico de materiales de almacen, se concilia con los saldos del sistema y se ' +
      'sustentan y aprueban los ajustes resultantes.',
    riesgo: 'Existencias registradas que no corresponden a la realidad fisica.',
    tipo: 'DETECTIVO', naturaleza: 'MANUAL', frecuencia: 'SEMESTRAL', esClave: false,
    aserciones: ['E', 'I', 'V'], diasHabilesPlazo: 12,
    evidenciaRequerida: 'Actas de conteo, hoja de conciliacion y aprobacion de ajustes.',
  },
];

const USUARIOS: { email: string; nombres: string; apellidos: string; cargo: string; rol: Rol }[] = [
  { email: 'admin.sox@calidda.com.pe', nombres: 'Administrador', apellidos: 'del Sistema', cargo: 'Administrador TI', rol: 'ADMIN' },
  { email: 'lider.sox@calidda.com.pe', nombres: 'Lider', apellidos: 'SOX', cargo: 'Jefe de Control Interno', rol: 'SOX_MANAGER' },
  { email: 'contador.general@calidda.com.pe', nombres: 'Contador', apellidos: 'General', cargo: 'Contador General', rol: 'CONTROL_OWNER' },
  { email: 'revisor.contable@calidda.com.pe', nombres: 'Revisor', apellidos: 'Contable', cargo: 'Supervisor de Contabilidad', rol: 'REVISOR' },
  { email: 'analista.contable@calidda.com.pe', nombres: 'Analista', apellidos: 'Contable', cargo: 'Analista de Contabilidad', rol: 'PREPARADOR' },
  { email: 'analista.tesoreria@calidda.com.pe', nombres: 'Analista', apellidos: 'de Tesoreria', cargo: 'Analista de Tesoreria', rol: 'PREPARADOR' },
  { email: 'auditoria.interna@calidda.com.pe', nombres: 'Auditoria', apellidos: 'Interna', cargo: 'Auditor Interno', rol: 'AUDITOR' },
];

async function main(): Promise<void> {
  console.info('Sembrando datos iniciales...');

  const empresas = await Promise.all(
    [
      { codigo: 'CALIDDA', nombre: 'Calidda - Gas Natural de Lima y Callao S.A.' },
      { codigo: 'CALIDDA_ENERGIA', nombre: 'Calidda Energia S.A.C.' },
    ].map((e) =>
      prisma.empresa.upsert({ where: { codigo: e.codigo }, update: { nombre: e.nombre }, create: e }),
    ),
  );

  // --- Usuarios ---
  const credenciales: { email: string; password: string }[] = [];
  // Se indexa por correo, no por rol: hay mas de un usuario con el mismo rol y
  // un indice por rol haria que el ultimo pisara a los anteriores.
  const usuarios: Record<string, string> = {};

  for (const u of USUARIOS) {
    const existente = await prisma.usuario.findUnique({ where: { email: u.email } });
    if (existente) {
      usuarios[u.email] = existente.id;
      continue;
    }
    const password = `Sox.${u.rol}.2026!`;
    const creado = await prisma.usuario.create({
      data: {
        ...u,
        passwordHash: await hashPassword(password),
        passwordSetAt: new Date(),
        debeCambiarPwd: true,
        empresas: { create: empresas.map((e) => ({ empresaId: e.id })) },
      },
    });
    usuarios[u.email] = creado.id;
    credenciales.push({ email: u.email, password });
  }

  // --- Feriados ---
  const anioActual = new Date().getFullYear();
  for (const anio of [anioActual, anioActual + 1]) {
    for (const f of FERIADOS_PE(anio)) {
      await prisma.feriado.upsert({
        where: { fecha: new Date(`${f.fecha}T00:00:00Z`) },
        update: {},
        create: { fecha: new Date(`${f.fecha}T00:00:00Z`), nombre: f.nombre },
      });
    }
  }

  // --- Procesos y controles por empresa ---
  for (const empresa of empresas) {
    const procesos: Record<string, { id: string; sub: Record<string, string> }> = {};

    for (const p of PROCESOS) {
      const proceso = await prisma.proceso.upsert({
        where: { empresaId_codigo: { empresaId: empresa.id, codigo: p.codigo } },
        update: { nombre: p.nombre },
        create: { empresaId: empresa.id, codigo: p.codigo, nombre: p.nombre },
      });
      const sub: Record<string, string> = {};
      for (const s of p.sub) {
        const creado = await prisma.subProceso.upsert({
          where: { procesoId_codigo: { procesoId: proceso.id, codigo: s } },
          update: {},
          create: { procesoId: proceso.id, codigo: s, nombre: `${p.nombre} - ${s}` },
        });
        sub[s] = creado.id;
      }
      procesos[p.codigo] = { id: proceso.id, sub };
    }

    const prefijo = empresa.codigo === 'CALIDDA' ? 'CAL' : 'CEN';

    for (const c of CONTROLES) {
      const proceso = procesos[c.proceso];
      if (!proceso) continue;
      const codigo = `${prefijo}-${c.codigo}`;

      await prisma.control.upsert({
        where: { empresaId_codigo: { empresaId: empresa.id, codigo } },
        update: {},
        create: {
          empresaId: empresa.id,
          procesoId: proceso.id,
          subprocesoId: c.sub ? (proceso.sub[c.sub] ?? null) : null,
          codigo,
          nombre: c.nombre,
          descripcion: c.descripcion,
          riesgo: c.riesgo,
          objetivo: `Mitigar el riesgo de: ${c.riesgo}`,
          tipo: c.tipo,
          naturaleza: c.naturaleza,
          frecuencia: c.frecuencia,
          mesAncla: c.frecuencia === 'TRIMESTRAL' ? 3 : c.frecuencia === 'SEMESTRAL' ? 6 : 1,
          esClave: c.esClave,
          aserciones: c.aserciones,
          diasHabilesPlazo: c.diasHabilesPlazo,
          evidenciaRequerida: c.evidenciaRequerida,
          ownerId: usuarios['contador.general@calidda.com.pe'] ?? null,
          revisorId: usuarios['revisor.contable@calidda.com.pe'] ?? null,
          // Tesoreria la prepara su propio analista; el resto, contabilidad.
          preparadorId:
            (c.proceso === 'TES'
              ? usuarios['analista.tesoreria@calidda.com.pe']
              : usuarios['analista.contable@calidda.com.pe']) ?? null,
          versiones: {
            create: { version: 1, snapshot: { origen: 'semilla' }, motivo: 'Carga inicial de la matriz' },
          },
        },
      });
    }
  }

  const totalControles = await prisma.control.count();
  console.info(`Listo. Empresas: ${empresas.length} | Controles: ${totalControles}`);

  if (credenciales.length) {
    console.info('\nCredenciales temporales (cambiar en el primer ingreso):');
    for (const c of credenciales) console.info(`  ${c.email.padEnd(38)} ${c.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
