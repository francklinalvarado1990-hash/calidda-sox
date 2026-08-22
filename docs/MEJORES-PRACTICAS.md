# Mejores prácticas para el programa SOX

Recomendaciones para que el sistema y el proceso resistan una auditoría. Se
indica en cada punto qué ya está implementado y qué depende de la organización.

---

## 1. Gobierno de la matriz de controles

**Un control mal escrito no se puede probar.** La descripción debe permitir que un
tercero reejecute el control sin preguntar nada. Escriba siempre: **quién** hace
**qué**, con **qué frecuencia**, sobre **qué fuente** y **qué hace ante una excepción**.

> ✗ «Se revisan las conciliaciones bancarias.»
> ✓ «El analista de tesorería concilia el saldo contable con el estado de cuenta de
> cada cuenta activa dentro de los 7 días hábiles del cierre; investiga toda
> partida mayor a 30 días y escala al jefe de tesorería las no resueltas.»

- **Distinga controles clave.** El auditor externo prueba primero los marcados
  como `esClave`. Si el 90% de su matriz es clave, en la práctica no priorizó.
- **Revise la matriz una vez al año** y cada vez que cambie un proceso, un sistema
  o la estructura organizacional. Toda modificación exige un motivo escrito y
  genera una versión (`control_versiones`) — *implementado*.
- **Menos controles bien ejecutados** superan a muchos ejecutados a medias. Un
  control que nunca detecta nada probablemente no está mitigando ningún riesgo real.
- **Cubra las cinco aserciones** en los procesos significativos: existencia,
  integridad, valuación, derechos y obligaciones, presentación.

## 2. Segregación de funciones

- Preparador, revisor y dueño deben ser **tres personas distintas**. El sistema lo
  impide tanto al definir el control como al ejecutar el workflow — *implementado*.
- **Defina suplentes formalmente.** El punto más frecuente de falla es la ausencia:
  vacaciones sin backup terminan en un control vencido. Registre al suplente como
  revisor alterno antes de que ocurra.
- **Revise la segregación en el ERP, no solo aquí.** Que en esta plataforma estén
  separados no significa que lo estén en SAP.

## 3. Evidencia

**Regla práctica:** si el auditor no puede reconstruir lo que usted hizo mirando
solo la evidencia adjunta, esa evidencia es insuficiente.

- **Adjunte el sustento, no la conclusión.** El reporte fuente, la hoja de trabajo
  con las fórmulas, la aprobación por correo. No un resumen escrito después.
- **La evidencia debe mostrar quién y cuándo.** Una captura sin fecha ni usuario
  no acredita nada.
- **Registre el tamaño de muestra y las excepciones**, incluso cuando sean cero:
  el campo en blanco se lee como "no se revisó" — *campos disponibles*.
- **Nunca reemplace un archivo.** Adjunte la versión corregida; el sistema conserva
  ambas con su hash — *implementado*.
- **El sello SHA-256** permite demostrar que el archivo no cambió desde su carga.
  Se verifica en cada descarga — *implementado*.
- **Retención de 7 años** por defecto, configurable — *implementado*.

## 4. Oportunidad de la ejecución

- **Un control ejecutado tarde es un control deficiente**, aunque el resultado sea
  correcto. El auditor prueba la oportunidad, no solo la existencia.
- **Fije plazos realistas.** Si un control siempre se cierra en el día 12 y el plazo
  dice 5, el problema es el plazo. Ajústelo con sustento en lugar de acumular
  incumplimientos formales.
- **No espere al final del mes.** Los controles diarios y semanales se documentan
  conforme ocurren; dejarlos para el cierre convierte el control preventivo en
  una reconstrucción.
- **Días hábiles, no calendario** — *implementado*, con feriados de Perú.

## 5. Cierre del periodo

- **Cierre con pendientes es la excepción, no la salida fácil.** Exige sustento
  escrito y notifica nominalmente a los responsables — *implementado*.
- **Mida la tasa de cierre con pendientes.** Si más del 5% de los periodos cierra
  incompleto, el problema es de recursos o de diseño de plazos, no de disciplina.
- **Los pendientes arrastrados se regularizan en el periodo siguiente.** La
  pantalla *Pendientes arrastrados* existe para que ningún incumplimiento se
  pierda de vista — *implementado*.
- **Reabrir un periodo debe ser excepcional** y queda auditado — *implementado*.

## 6. Deficiencias

- **Clasifique con criterio, no por comodidad.** La escala —observación,
  deficiencia, deficiencia significativa, debilidad material— tiene consecuencias
  de reporte. Subclasificar para evitar escalamiento es en sí un hallazgo.
- **Toda deficiencia necesita causa raíz.** «Se olvidó» no es causa raíz; «no existe
  un procedimiento formal de archivo» sí lo es.
- **Plan de acción con responsable y fecha comprometida.** Obligatorio para
  severidad significativa o material — *implementado*.
- **No cierre una deficiencia sin evidencia de remediación** ni sin verificar que
  el control operó correctamente en al menos un periodo posterior — *el sistema
  exige la evidencia de cierre*.
- **Evalúe la agregación.** Varias deficiencias menores sobre la misma cuenta
  pueden constituir, juntas, una deficiencia significativa.

## 7. Controles generales de TI (ITGC)

Los ITGC sostienen a todos los controles automáticos: si fallan, el auditor no
puede confiar en ningún control dependiente de sistemas.

- **Revisión trimestral de accesos** a cada aplicación financiera, ejecutada por el
  dueño de la aplicación, con evidencia de las bajas solicitadas.
- **Gestión de cambios**: quien desarrolla no despliega. Registre aprobación y
  evidencia de pruebas antes del pase a producción.
- **Respaldos**: no basta con que corran. Pruebe la restauración y documéntela.
- **Cuentas privilegiadas y genéricas**: inventario, justificación y monitoreo.
- **Aplique estas mismas reglas a esta plataforma.** Es un sistema con impacto en
  el reporte financiero y el auditor la va a revisar como tal.

## 8. Información producida por la entidad (IPE)

Cuando un control se apoya en un reporte del sistema, el auditor exige acreditar
que el reporte es completo y exacto:

- Guarde **los parámetros de la consulta** (filtros, fechas, criterios), no solo el
  resultado.
- Conserve **la exportación original sin editar**, además de la hoja de trabajo.
- Si el reporte es a medida, documente **quién lo validó** y cuándo.
- Marque estos controles con naturaleza `IPE` en la matriz — *soportado*.

## 9. Uso de la plataforma

- **MFA obligatorio** para líder SOX y administradores — *implementado*. Extiéndalo
  a dueños de control agregándolos a `MFA_ROLES_OBLIGATORIO`.
- **El rol AUDITOR es de solo lectura.** Entregue ese perfil a auditoría interna y
  externa en lugar de exportar archivos sueltos: ven el dato vivo y su trazabilidad.
- **No comparta cuentas.** Una cuenta compartida destruye la trazabilidad y anula
  la segregación de funciones.
- **Revise la pista de auditoría periódicamente**, en especial reaperturas de
  periodo, anulaciones de evidencia y cambios de rol.
- **Vigile la bitácora de correos.** Un correo en estado `ERROR` significa que el
  responsable nunca fue notificado, y eso debilita la defensa del incumplimiento.

## 10. Indicadores del programa

Métricas que conviene revisar en el comité mensual:

| Indicador | Meta sugerida | Dónde verlo |
|---|---|---|
| Cumplimiento del periodo | ≥ 98% | Tablero, KPI de avance |
| Controles cerrados dentro de plazo | ≥ 95% | Tablero → por responsable (puntualidad) |
| Periodos cerrados con pendientes | ≤ 5% | Periodos |
| Deficiencias abiertas fuera de fecha compromiso | 0 | Deficiencias |
| Controles sin evidencia al cerrar | 0 | Exportación del periodo |
| Reaperturas de periodo | ≤ 1 por trimestre | Auditoría |

**No persiga el 100% a costa de la calidad.** Un 100% con evidencia pobre es peor
que un 96% con sustento sólido: el primero se cae en la prueba del auditor.

## 11. Puesta en producción

- Cambie **todas** las contraseñas de la semilla antes de dar acceso.
- Genere `JWT_SECRET` con `openssl rand -base64 48`. Nunca reutilice el de ejemplo.
- Sirva siempre por **HTTPS**; en producción las cookies viajan con `secure`.
- Respalde base de datos **y** almacén de evidencias: sin los archivos, la base no
  vale nada ante el auditor.
- **Pruebe la restauración del respaldo** al menos una vez al año, y documéntelo:
  es, en sí mismo, un ITGC.
- Si escala a varias instancias del API, mantenga `JOBS_HABILITADOS=true` en una
  sola para no duplicar correos.

## 12. Errores frecuentes que conviene evitar

1. **Matriz que nadie mantiene.** Controles sobre procesos que ya no existen o
   dueños que dejaron la empresa hace un año.
2. **Evidencia armada al final.** Reconstruir en el día 20 lo que debió hacerse el
   día 3 es una deficiencia de operación, aunque el resultado sea correcto.
3. **Aprobar sin revisar.** Aprobaciones masivas en un minuto quedan registradas
   con su hora exacta y son un hallazgo evidente en la bitácora.
4. **Confundir el tablero con el control.** El sistema mide y recuerda; no ejecuta
   el control por usted.
5. **Tratar el correo automático como suficiente.** Si un responsable acumula
   controles vencidos, el problema es de gestión, no de notificación.
