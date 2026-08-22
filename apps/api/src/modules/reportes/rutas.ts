import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../../db/prisma.js';
import { noEncontrado } from '../../core/errores.js';
import { ETIQUETA_ESTADO } from '../../core/workflow.js';
import { ETIQUETA_FRECUENCIA } from '../../utils/frecuencia.js';
import { nombreMes } from '../../config/constantes.js';
import { formatoCorto } from '../../utils/fechas.js';
import { auditar } from '../../core/auditoria.js';
import { resumenPeriodo } from '../periodos/servicio.js';

const CABECERA = { bold: true, color: { argb: 'FFFFFFFF' } } as const;
const FONDO_CABECERA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00539B' } } as const;

function estilizarCabecera(hoja: ExcelJS.Worksheet): void {
  const fila = hoja.getRow(1);
  fila.font = CABECERA;
  fila.fill = FONDO_CABECERA as ExcelJS.Fill;
  fila.alignment = { vertical: 'middle', wrapText: true };
  fila.height = 28;
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
}

async function responderExcel(reply: never, libro: ExcelJS.Workbook, nombre: string) {
  const buffer = await libro.xlsx.writeBuffer();
  return (reply as unknown as {
    header: (k: string, v: string) => { header: (k: string, v: string) => { send: (b: unknown) => unknown } };
  })
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${nombre}"`)
    .send(Buffer.from(buffer));
}

export default async function rutasReportes(app: FastifyInstance): Promise<void> {
  /** Estado detallado de un periodo: la hoja que se entrega al auditor. */
  app.get('/periodo/:id/excel', { preHandler: app.exigir('ejecucion.leer') }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const periodo = await prisma.periodo.findUnique({ where: { id }, include: { empresa: true } });
    if (!periodo) throw noEncontrado('El periodo');

    const ejecuciones = await prisma.ejecucion.findMany({
      where: { periodoId: id },
      include: {
        asignadoA: true,
        control: { include: { proceso: true, owner: true, revisor: true } },
        _count: { select: { evidencias: true, deficiencias: true } },
      },
      orderBy: [{ codigoControl: 'asc' }],
    });

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Repositorio de Controles SOX';
    libro.created = new Date();

    // --- Hoja 1: resumen ejecutivo ---
    const resumen = await resumenPeriodo(id);
    const hojaResumen = libro.addWorksheet('Resumen');
    hojaResumen.columns = [
      { header: 'Indicador', key: 'k', width: 34 },
      { header: 'Valor', key: 'v', width: 46 },
    ];
    [
      ['Empresa', periodo.empresa.nombre],
      ['Periodo', `${nombreMes(periodo.mes)} ${periodo.anio}`],
      ['Estado del periodo', periodo.estado],
      ['Fecha de apertura', periodo.fechaApertura ? formatoCorto(periodo.fechaApertura) : '-'],
      ['Fecha limite de cierre', periodo.fechaLimiteCierre ? formatoCorto(periodo.fechaLimiteCierre) : '-'],
      ['Fecha de cierre', periodo.fechaCierre ? formatoCorto(periodo.fechaCierre) : '-'],
      ['Controles totales', resumen.total],
      ['Cerrados', resumen.cerrados],
      ['No aplica', resumen.noAplica],
      ['Abiertos / pendientes', resumen.abiertos],
      ['% de cumplimiento', `${resumen.porcentajeAvance}%`],
      ['Deficiencias abiertas', resumen.deficienciasAbiertas],
      ['Nota de cierre', periodo.notaCierre ?? '-'],
    ].forEach(([k, v]) => hojaResumen.addRow({ k, v }));
    estilizarCabecera(hojaResumen);

    // --- Hoja 2: detalle de controles ---
    const hoja = libro.addWorksheet('Controles');
    hoja.columns = [
      { header: 'Codigo', key: 'codigo', width: 16 },
      { header: 'Control', key: 'nombre', width: 46 },
      { header: 'Proceso', key: 'proceso', width: 24 },
      { header: 'Frecuencia', key: 'frecuencia', width: 14 },
      { header: 'Clave', key: 'clave', width: 8 },
      { header: 'Responsable', key: 'responsable', width: 28 },
      { header: 'Dueno', key: 'owner', width: 28 },
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Resultado', key: 'resultado', width: 24 },
      { header: 'Fecha limite', key: 'limite', width: 14 },
      { header: 'Fecha cierre', key: 'cierre', width: 14 },
      { header: 'Dias atraso', key: 'atraso', width: 12 },
      { header: 'Marcado pendiente', key: 'marca', width: 18 },
      { header: 'Evidencias', key: 'evidencias', width: 12 },
      { header: 'Deficiencias', key: 'deficiencias', width: 12 },
      { header: 'Conclusion', key: 'conclusion', width: 60 },
    ];

    for (const e of ejecuciones) {
      hoja.addRow({
        codigo: e.codigoControl,
        nombre: e.nombreControl,
        proceso: e.control.proceso.nombre,
        frecuencia: ETIQUETA_FRECUENCIA[e.control.frecuencia],
        clave: e.control.esClave ? 'Si' : 'No',
        responsable: e.asignadoA ? `${e.asignadoA.nombres} ${e.asignadoA.apellidos}` : 'Sin asignar',
        owner: e.control.owner ? `${e.control.owner.nombres} ${e.control.owner.apellidos}` : '-',
        estado: ETIQUETA_ESTADO[e.estado],
        resultado: e.resultado ?? '-',
        limite: formatoCorto(e.fechaLimite),
        cierre: e.fechaCierre ? formatoCorto(e.fechaCierre) : '-',
        atraso: e.diasAtrasoAlCierre ?? 0,
        marca: e.marcadoPendiente ? 'SI' : '',
        evidencias: e._count.evidencias,
        deficiencias: e._count.deficiencias,
        conclusion: e.conclusion ?? '',
      });
    }
    estilizarCabecera(hoja);

    // Resalta en rojo los controles marcados como pendientes al cierre.
    hoja.eachRow((fila, indice) => {
      if (indice === 1) return;
      if (fila.getCell('marca').value === 'SI') {
        fila.eachCell((celda) => {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE3E3' } };
        });
      }
    });

    // --- Hoja 3: bitacora de aprobaciones ---
    const aprobaciones = await prisma.aprobacion.findMany({
      where: { ejecucion: { periodoId: id } },
      include: { usuario: true, ejecucion: { select: { codigoControl: true } } },
      orderBy: { creadoEn: 'asc' },
    });
    const hojaWf = libro.addWorksheet('Bitacora aprobaciones');
    hojaWf.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Control', key: 'control', width: 16 },
      { header: 'Paso', key: 'paso', width: 20 },
      { header: 'Accion', key: 'accion', width: 18 },
      { header: 'Usuario', key: 'usuario', width: 30 },
      { header: 'De', key: 'de', width: 18 },
      { header: 'A', key: 'a', width: 18 },
      { header: 'Comentario', key: 'comentario', width: 60 },
    ];
    for (const a of aprobaciones) {
      hojaWf.addRow({
        fecha: a.creadoEn.toISOString().replace('T', ' ').slice(0, 19),
        control: a.ejecucion.codigoControl,
        paso: a.paso,
        accion: a.accion,
        usuario: `${a.usuario.nombres} ${a.usuario.apellidos}`,
        de: ETIQUETA_ESTADO[a.estadoAnterior],
        a: ETIQUETA_ESTADO[a.estadoNuevo],
        comentario: a.comentario ?? '',
      });
    }
    estilizarCabecera(hojaWf);

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'reporte.periodo_excel', entidad: 'Periodo', entidadId: id, ip: req.ip,
    });

    const nombre = `SOX_${periodo.empresa.codigo}_${periodo.anio}-${String(periodo.mes).padStart(2, '0')}.xlsx`;
    return responderExcel(reply as never, libro, nombre);
  });

  /** Matriz de riesgos y controles vigente. */
  app.get('/matriz/excel', { preHandler: app.exigir('control.leer') }, async (req, reply) => {
    const { empresaId } = z.object({ empresaId: z.string().optional() }).parse(req.query);

    const controles = await prisma.control.findMany({
      where: { activo: true, ...(empresaId ? { empresaId } : {}) },
      include: { empresa: true, proceso: true, subproceso: true, owner: true, preparador: true, revisor: true },
      orderBy: [{ empresaId: 'asc' }, { codigo: 'asc' }],
    });

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Matriz de controles');
    hoja.columns = [
      { header: 'Empresa', key: 'empresa', width: 20 },
      { header: 'Codigo', key: 'codigo', width: 16 },
      { header: 'Proceso', key: 'proceso', width: 24 },
      { header: 'Subproceso', key: 'subproceso', width: 24 },
      { header: 'Control', key: 'nombre', width: 44 },
      { header: 'Descripcion', key: 'descripcion', width: 70 },
      { header: 'Riesgo', key: 'riesgo', width: 50 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'Naturaleza', key: 'naturaleza', width: 14 },
      { header: 'Frecuencia', key: 'frecuencia', width: 14 },
      { header: 'Clave', key: 'clave', width: 8 },
      { header: 'Aserciones', key: 'aserciones', width: 18 },
      { header: 'Cuentas', key: 'cuentas', width: 24 },
      { header: 'Sistemas', key: 'sistemas', width: 24 },
      { header: 'Dueno', key: 'owner', width: 28 },
      { header: 'Preparador', key: 'preparador', width: 28 },
      { header: 'Revisor', key: 'revisor', width: 28 },
      { header: 'Plazo (dias habiles)', key: 'plazo', width: 18 },
      { header: 'Evidencia requerida', key: 'evidencia', width: 50 },
      { header: 'Version', key: 'version', width: 10 },
    ];

    const nombreDe = (u: { nombres: string; apellidos: string } | null) =>
      u ? `${u.nombres} ${u.apellidos}` : '-';

    for (const c of controles) {
      hoja.addRow({
        empresa: c.empresa.nombre,
        codigo: c.codigo,
        proceso: c.proceso.nombre,
        subproceso: c.subproceso?.nombre ?? '-',
        nombre: c.nombre,
        descripcion: c.descripcion,
        riesgo: c.riesgo ?? '',
        tipo: c.tipo,
        naturaleza: c.naturaleza,
        frecuencia: ETIQUETA_FRECUENCIA[c.frecuencia],
        clave: c.esClave ? 'Si' : 'No',
        aserciones: c.aserciones.join(', '),
        cuentas: c.cuentasContables.join(', '),
        sistemas: c.sistemas.join(', '),
        owner: nombreDe(c.owner),
        preparador: nombreDe(c.preparador),
        revisor: nombreDe(c.revisor),
        plazo: c.diasHabilesPlazo,
        evidencia: c.evidenciaRequerida ?? '',
        version: c.version,
      });
    }
    estilizarCabecera(hoja);

    await auditar({
      usuarioId: req.usuario!.id, actorEmail: req.usuario!.email,
      accion: 'reporte.matriz_excel', entidad: 'Control', ip: req.ip,
    });

    return responderExcel(reply as never, libro, 'Matriz_Controles_SOX.xlsx');
  });
}
