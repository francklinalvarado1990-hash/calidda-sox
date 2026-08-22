# Referencia del API

Base: `/api` · Autenticación: `Authorization: Bearer <token>` o cookie `sox_access`.
Errores: `{ "error": "CODIGO", "mensaje": "texto para el usuario", "detalle": ... }`.

## Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{email, password, codigoMfa?}`. Devuelve token y datos del usuario. |
| POST | `/auth/refresh` | Rota el refresh token y emite un nuevo access token. |
| POST | `/auth/logout` | Revoca la sesión. |
| GET | `/auth/yo` | Usuario en sesión con sus empresas. |
| POST | `/auth/password` | `{actual, nueva}`. Invalida todas las sesiones abiertas. |
| POST | `/auth/mfa/iniciar` | Genera el secreto TOTP y la URI para el código QR. |
| POST | `/auth/mfa/confirmar` | `{codigo}`. Activa el doble factor. |

Códigos propios: `MFA_REQUERIDO` (falta el código), `MFA_ENROLAMIENTO_REQUERIDO`
(el rol exige MFA y aún no se configuró; la sesión solo permite enrolarse).

## Usuarios · requiere rol ADMIN para escritura

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/usuarios` | Filtros: `buscar`, `rol`, `activo`, `empresaId`, `pagina`, `tamano`. |
| POST | `/usuarios` | Crea el usuario y devuelve la contraseña temporal (una sola vez). |
| PATCH | `/usuarios/:id` | Datos, rol, empresas y activación. Desactivar revoca sesiones. |
| POST | `/usuarios/:id/reset-password` | Genera contraseña temporal y revoca sesiones. |

## Matriz de controles

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/controles` | Filtros: `empresaId`, `procesoId`, `frecuencia`, `esClave`, `activo`, `buscar`. |
| GET | `/controles/:id` | Detalle con historial de versiones y últimas ejecuciones. |
| POST | `/controles` | Alta. Valida segregación de funciones. |
| PATCH | `/controles/:id` | Requiere `motivo`; genera una nueva versión. |
| POST | `/controles/:id/desactivar` | Baja lógica. Falla si hay ejecuciones abiertas. |

## Periodos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/periodos` | Lista con el resumen de avance de cada uno. |
| GET | `/periodos/:id` | Detalle y métricas. |
| POST | `/periodos/abrir` | `{empresaId, anio, mes, notificar?}`. Idempotente. |
| POST | `/periodos/:id/cerrar` | `{forzar?, nota?, notificar?}`. Sin `forzar` falla con 409 si hay abiertos. |
| POST | `/periodos/:id/reabrir` | `{motivo}`. Queda auditado. |
| GET | `/periodos/pendientes/arrastrados` | Controles marcados en periodos ya cerrados. |

## Ejecuciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/ejecuciones` | Filtros: `periodoId`, `empresaId`, `estado`, `asignadoAId`, `mios`, `soloPendientes`, `marcadoPendiente`. |
| GET | `/ejecuciones/:id` | Detalle con evidencias, bitácora y acciones disponibles. |
| PATCH | `/ejecuciones/:id` | Guarda avance: conclusión, resultado, muestra, excepciones. |
| POST | `/ejecuciones/:id/accion` | `{accion, comentario?, resultado?, nuevoAsignadoId?}`. |
| GET | `/ejecuciones/bandeja/mia` | Por hacer, por revisar y por aprobar del usuario en sesión. |

Acciones: `ENVIAR`, `APROBAR`, `RECHAZAR`, `REASIGNAR`, `REABRIR`, `MARCAR_NO_APLICA`.
`RECHAZAR`, `REABRIR` y `MARCAR_NO_APLICA` exigen comentario.

## Evidencias

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/ejecuciones/:id/evidencias` | `multipart/form-data` con `archivo` y `descripcion?`. |
| GET | `/evidencias/:id/descargar` | Verifica el hash antes de entregar. Se audita. |
| POST | `/evidencias/:id/anular` | `{motivo}`. Baja lógica; el archivo permanece. |

## Deficiencias

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/deficiencias` | Filtros: `estado`, `severidad`, `empresaId`, `responsableId`, `vencidas`. |
| POST | `/deficiencias` | Severidad significativa o material exige plan, responsable y fecha. |
| PATCH | `/deficiencias/:id` | Cerrar exige `evidenciaCierre`. |

## Tableros

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/dashboard/resumen` | Consolidado y por empresa del periodo indicado. |
| GET | `/dashboard/tendencia` | Serie mensual de cumplimiento (`meses`, 3–36). |
| GET | `/dashboard/por-proceso` | Avance por proceso, agregado entre empresas. |
| GET | `/dashboard/por-responsable` | Cumplimiento y puntualidad por persona. |
| GET | `/dashboard/proximos-vencimientos` | Controles abiertos que vencen en `dias`. |
| GET | `/dashboard/deficiencias` | Distribución por severidad y estado. |
| GET | `/dashboard/calendario` | Densidad de vencimientos del mes. |

## Auditoría · solo lectura

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/auditoria` | Filtros: `accion`, `entidad`, `entidadId`, `usuarioId`, `desde`, `hasta`. |
| GET | `/auditoria/entidad/:entidad/:id` | Historial completo de una entidad. |
| GET | `/auditoria/recordatorios` | Bitácora de correos con su estado de entrega. |

## Catálogos, reportes y jobs

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/catalogos/empresas` · `/procesos` · `/feriados` · `/diccionarios` | Datos de apoyo. |
| POST | `/catalogos/procesos` · `/feriados` | Alta. |
| DELETE | `/catalogos/feriados/:id` | Baja de feriado. |
| GET | `/reportes/periodo/:id/excel` | Resumen, detalle y bitácora en tres hojas. |
| GET | `/reportes/matriz/excel` | Matriz de riesgos y controles vigente. |
| POST | `/jobs/:nombre/ejecutar` | `apertura-mensual`, `recordatorios`, `cierre-automatico`, `digest-semanal`. |
| GET | `/salud` | Estado de base de datos, correo, almacenamiento y jobs. Público. |
