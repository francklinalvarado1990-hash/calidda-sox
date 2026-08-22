/**
 * Prueba de humo del ciclo SOX completo contra un API en ejecucion.
 *
 * Uso:
 *   1. npm run db:migrate && npm run db:seed
 *   2. npm run dev -w @calidda-sox/api
 *   3. node apps/api/tests/e2e/humo.mjs
 *
 * Recorre: enrolamiento MFA, apertura del periodo, carga de evidencia,
 * workflow de aprobacion, segregacion de funciones, dashboard, cierre con
 * pendientes y pista de auditoria. No modifica codigo: solo consume el API.
 */
import { authenticator } from 'otplib';
const API = 'http://127.0.0.1:3001/api';
const paso = (t) => console.log(`\n=== ${t} ===`);

async function call(ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos; try { datos = JSON.parse(texto); } catch { datos = texto.slice(0, 200); }
  return { status: r.status, datos };
}

const login = async (email, password, codigoMfa) =>
  (await call('/auth/login', { metodo: 'POST', cuerpo: { email, password, codigoMfa } })).datos;

paso('1. Login lider SOX + enrolamiento MFA obligatorio');
let sox = await login('lider.sox@calidda.com.pe', 'Sox.SOX_MANAGER.2026!');
console.log('debeConfigurarMfa:', sox.usuario.debeConfigurarMfa);

const bloqueado = await call('/catalogos/empresas', { token: sox.accessToken });
console.log('acceso antes de enrolar ->', bloqueado.status, bloqueado.datos.error);

const mfa = (await call('/auth/mfa/iniciar', { metodo: 'POST', token: sox.accessToken })).datos;
await call('/auth/mfa/confirmar', { metodo: 'POST', token: sox.accessToken, cuerpo: { codigo: authenticator.generate(mfa.secreto) } });
sox = await login('lider.sox@calidda.com.pe', 'Sox.SOX_MANAGER.2026!', authenticator.generate(mfa.secreto));
console.log('login con MFA ->', sox.usuario ? 'OK' : sox);

const TS = sox.accessToken;
const empresas = (await call('/catalogos/empresas', { token: TS })).datos;
console.log('empresas:', empresas.map((e) => `${e.codigo}(${e._count.controles} controles)`).join(', '));
const empresa = empresas[0];

paso('2. Apertura del periodo mensual');
const apertura = (await call('/periodos/abrir', {
  metodo: 'POST', token: TS,
  cuerpo: { empresaId: empresa.id, anio: 2026, mes: 8 },
})).datos;
console.log('creadas:', apertura.ejecucionesCreadas, '| omitidas por frecuencia:', apertura.controlesOmitidos, '| correos:', apertura.correosEnviados);
const periodoId = apertura.periodo.id;

paso('3. Intento de cierre con controles abiertos (debe bloquearse)');
const cierreBloqueado = await call(`/periodos/${periodoId}/cerrar`, { metodo: 'POST', token: TS, cuerpo: {} });
console.log(cierreBloqueado.status, cierreBloqueado.datos.mensaje);

paso('4. Workflow completo de un control');
const prep = await login('analista.contable@calidda.com.pe', 'Sox.PREPARADOR.2026!');
const bandeja = (await call('/ejecuciones/bandeja/mia', { token: prep.accessToken })).datos;
console.log('controles por hacer del preparador:', bandeja.porHacer.length);
const ej = bandeja.porHacer[0];
console.log('trabajando:', ej.codigoControl, '| vence:', ej.fechaLimite.slice(0, 10));

// Envio sin evidencia -> debe rechazarse
const sinEvidencia = await call(`/ejecuciones/${ej.id}/accion`, {
  metodo: 'POST', token: prep.accessToken, cuerpo: { accion: 'ENVIAR', resultado: 'EFECTIVO' },
});
console.log('envio sin evidencia ->', sinEvidencia.status, sinEvidencia.datos.mensaje);

// Cargar evidencia
const fd = new FormData();
fd.append('descripcion', 'Conciliacion firmada del periodo');
fd.append('archivo', new Blob(['Conciliacion agosto 2026\nDiferencia: 0.00'], { type: 'text/plain' }), 'conciliacion-ago2026.txt');
const up = await fetch(`${API}/ejecuciones/${ej.id}/evidencias`, {
  method: 'POST', headers: { Authorization: `Bearer ${prep.accessToken}` }, body: fd,
});
const evidencia = await up.json();
console.log('evidencia cargada:', evidencia.nombreArchivo, '| sha256:', evidencia.sha256?.slice(0, 16) + '...');

// Duplicado por hash
const fd2 = new FormData();
fd2.append('archivo', new Blob(['Conciliacion agosto 2026\nDiferencia: 0.00'], { type: 'text/plain' }), 'copia.txt');
const dup = await fetch(`${API}/ejecuciones/${ej.id}/evidencias`, {
  method: 'POST', headers: { Authorization: `Bearer ${prep.accessToken}` }, body: fd2,
});
console.log('carga duplicada ->', dup.status, (await dup.json()).mensaje);

await call(`/ejecuciones/${ej.id}`, {
  metodo: 'PATCH', token: prep.accessToken,
  cuerpo: { conclusion: 'Se concilio el 100% de las cuentas sin diferencias relevantes.', resultado: 'EFECTIVO', muestraTamano: 25, excepciones: 0 },
});
const enviado = await call(`/ejecuciones/${ej.id}/accion`, {
  metodo: 'POST', token: prep.accessToken, cuerpo: { accion: 'ENVIAR', resultado: 'EFECTIVO' },
});
console.log('tras enviar ->', enviado.datos.estado);

paso('5. Segregacion de funciones');
const autoAprobacion = await call(`/ejecuciones/${ej.id}/accion`, {
  metodo: 'POST', token: prep.accessToken, cuerpo: { accion: 'APROBAR' },
});
console.log('el preparador intenta aprobar ->', autoAprobacion.status, autoAprobacion.datos.mensaje);

paso('6. Revision y aprobacion del dueno');
const rev = await login('revisor.contable@calidda.com.pe', 'Sox.REVISOR.2026!');
const observado = await call(`/ejecuciones/${ej.id}/accion`, {
  metodo: 'POST', token: rev.accessToken,
  cuerpo: { accion: 'RECHAZAR', comentario: 'Falta adjuntar el estado de cuenta bancario de respaldo.' },
});
console.log('revisor observa ->', observado.datos.estado);

await call(`/ejecuciones/${ej.id}/accion`, { metodo: 'POST', token: prep.accessToken, cuerpo: { accion: 'ENVIAR' } });
const aprobado = await call(`/ejecuciones/${ej.id}/accion`, { metodo: 'POST', token: rev.accessToken, cuerpo: { accion: 'APROBAR' } });
console.log('revisor aprueba ->', aprobado.datos.estado);

const own = await login('contador.general@calidda.com.pe', 'Sox.CONTROL_OWNER.2026!');
const cerrado = await call(`/ejecuciones/${ej.id}/accion`, { metodo: 'POST', token: own.accessToken, cuerpo: { accion: 'APROBAR' } });
console.log('dueno cierra ->', cerrado.datos.estado, '| pasos en bitacora:', cerrado.datos.aprobaciones.length);

paso('7. Dashboard');
const resumen = (await call(`/dashboard/resumen?anio=2026&mes=8`, { token: TS })).datos;
console.log('consolidado:', JSON.stringify(resumen.consolidado));
const porProceso = (await call(`/dashboard/por-proceso?periodoId=${periodoId}`, { token: TS })).datos;
console.log('procesos con menor avance:', porProceso.slice(0, 3).map((p) => `${p.codigo}:${p.cumplimiento}%`).join(', '));

paso('8. Cierre del periodo con pendientes');
const cierre = (await call(`/periodos/${periodoId}/cerrar`, {
  metodo: 'POST', token: TS,
  cuerpo: { forzar: true, nota: 'Se cierra por requerimiento de reporte a casa matriz. Los controles pendientes se regularizan en septiembre.' },
})).datos;
console.log('estado del periodo:', cierre.estado);
console.log('marcados como pendientes:', cierre.marcadosPendientes, '| correos:', cierre.correosEnviados);
console.log('responsables que no cerraron:');
for (const r of cierre.responsablesIncumplidos) console.log(`   - ${r.nombre} <${r.email}>: ${r.controles.length} control(es)`);

paso('9. Trazabilidad y arrastre');
const arrastrados = (await call('/periodos/pendientes/arrastrados', { token: TS })).datos;
console.log('controles marcados que se arrastran:', arrastrados.length);
const audit = (await call(`/auditoria/entidad/Periodo/${periodoId}`, { token: TS })).datos;
console.log('pista de auditoria del periodo:', audit.map((a) => a.accion).join(' -> '));
const correos = (await call(`/auditoria/recordatorios?periodoId=${periodoId}`, { token: TS })).datos;
console.log('correos registrados:', correos.length, '| tipos:', [...new Set(correos.map((c) => c.tipo))].join(', '));

paso('10. El auditor solo lee');
const aud = await login('auditoria.interna@calidda.com.pe', 'Sox.AUDITOR.2026!');
const intento = await call(`/periodos/${periodoId}/reabrir`, {
  metodo: 'POST', token: aud.accessToken, cuerpo: { motivo: 'Quiero reabrirlo para revisar' },
});
console.log('auditor intenta reabrir ->', intento.status, intento.datos.mensaje);
