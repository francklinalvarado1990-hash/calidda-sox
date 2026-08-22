# Arquitectura

## Principios que gobiernan el diseño

Este sistema es evidencia ante un auditor externo. Cinco reglas atraviesan todo
el código:

1. **Nada se borra.** Controles, evidencias y periodos se dan de baja lógicamente,
   con fecha, autor y motivo. No existe un solo `DELETE` sobre datos de negocio.
2. **Todo queda registrado.** Cada acción sensible escribe en `audit_log` con el
   estado anterior y el nuevo. La tabla es *append-only*: no hay endpoint de
   modificación ni de borrado, ni siquiera para el rol `ADMIN`.
3. **Segregación de funciones impuesta por el motor.** Quien prepara no revisa, y
   quien revisa no aprueba como dueño. Se valida en `core/workflow.ts`, no en la
   interfaz, porque la interfaz se puede eludir.
4. **La decisión de estado es una función pura.** `siguienteEstado()` recibe el
   contexto y devuelve el destino o lanza un error explicando por qué no procede.
   Está cubierta por pruebas y es el único lugar donde vive esa lógica.
5. **La autorización se resuelve en el servidor.** El frontend solo oculta botones.

## Componentes

```
Navegador
   │  HTTPS
   ▼
Nginx ──────────────────────────────► React (SPA estática)
   │  /api/*
   ▼
API Fastify ─────► PostgreSQL          Motor del dominio + persistencia
   │
   ├──► Almacén de evidencias          Disco o S3, direccionado por hash
   ├──► SMTP corporativo               Notificaciones con log de envío
   └──► Jobs (node-cron)               Apertura, recordatorios, cierre, digest
```

Web y API se sirven bajo el **mismo dominio**: no hay CORS en producción ni
cookies de terceros, y el token de sesión viaja en una cookie `httpOnly`.

## Modelo de datos

```
Empresa ─┬─ Proceso ── SubProceso
         │      │
         │      └─ Control ──── ControlVersion   (cada cambio de la matriz)
         │            │
         └─ Periodo ──┴─ Ejecucion ─┬─ Aprobacion   (bitácora del workflow)
              (año/mes)              ├─ Evidencia    (SHA-256 + retención)
                                     ├─ Deficiencia  (hallazgo + plan de acción)
                                     └─ Recordatorio (log de correos)

Usuario ── UsuarioEmpresa       Sesion       Feriado      AuditLog
```

**`Control` vs. `Ejecucion`.** El control es la definición maestra; la ejecución es
su instancia en un mes. La ejecución guarda una copia del código, el nombre y la
versión del control al momento de instanciarlo: si la matriz cambia en marzo, el
periodo de enero sigue mostrando lo que efectivamente se ejecutó.

### Estados

**Ejecución de un control**

```
PENDIENTE ──► EN_EJECUCION ──► EN_REVISION ──► APROBADO ──► CERRADO
                   ▲                 │              │
                   └──── OBSERVADO ◄─┴──────────────┘

  cualquiera ──► NO_APLICA   (con sustento; solo dueño o líder SOX)
  abierto    ──► VENCIDO     (fecha límite superada o cierre del periodo)
  CERRADO    ──► EN_EJECUCION (reapertura, solo líder SOX, con motivo)
```

Un control cuenta como **completo** solo si está `CERRADO` o `NO_APLICA`.

**Periodo**

```
PLANIFICADO ──► ABIERTO ──► EN_CIERRE ──┬──► CERRADO
                                        └──► CERRADO_CON_PENDIENTES
```

`EN_CIERRE` es el estado en que el job automático deja un periodo que superó su
fecha límite pero sigue con controles abiertos: el sistema avisa, la persona decide.

## Cálculo de fechas

Todo se calcula en `America/Lima` y en **días hábiles**, descontando fines de
semana y los feriados de la tabla `feriados` (Perú viene cargado en la semilla).

- Fecha límite de un control = fin de mes + `diasHabilesPlazo` días hábiles.
- Fecha límite del periodo = fin de mes + `DIAS_HABILES_CIERRE_PERIODO`.

> Los feriados se guardan como `DATE` y PostgreSQL los devuelve a medianoche UTC.
> Convertirlos a Lima (UTC-5) los correría un día hacia atrás, por eso se comparan
> por sus componentes UTC (`utils/fechas.ts`). Hay una prueba que fija ese
> comportamiento.

## Instanciación por frecuencia

`aplicaEnPeriodo()` decide si un control se instancia en un mes dado:

| Frecuencia | Comportamiento |
|---|---|
| Diaria, semanal, quincenal, mensual | Una ejecución mensual que documenta todas las ocurrencias del periodo. |
| Bimestral, trimestral, cuatrimestral, semestral | Según `mesAncla`, con envolvimiento de año. |
| Anual | Solo en `mesAncla`. |
| Eventual | No se instancia sola: se crea ante el evento. |

Agrupar las frecuencias sub-mensuales en una ejecución por mes es lo que sustenta
el auditor externo: una atestación mensual que cubre las N ocurrencias del periodo,
con el tamaño de muestra registrado.

## Seguridad

| Aspecto | Decisión |
|---|---|
| Contraseñas | `scrypt` de la librería estándar de Node (sin dependencias nativas), sal por usuario, comparación en tiempo constante. |
| Política | 12+ caracteres, mayúscula, minúscula, número y símbolo. |
| Sesión | JWT de vida corta + refresh token rotatorio con hash en base. Revocable desde administración. |
| Bloqueo | N intentos fallidos bloquean la cuenta temporalmente; el mensaje de error nunca revela si el correo existe. |
| MFA | TOTP. Obligatorio para los roles de `MFA_ROLES_OBLIGATORIO`; quien aún no lo configuró entra con la sesión **restringida al enrolamiento**, para que el primer administrador no quede fuera. |
| Evidencias | Lista blanca de tipos MIME, límite de tamaño, ruta validada contra *path traversal*, escritura con `wx` (nunca sobrescribe). |
| Auditoría | Campos sensibles enmascarados antes de persistir (`CAMPOS_SENSIBLES`). |
| SSO | `proveedorAuth` y `subjectExterno` ya están en el modelo: conectar Entra ID no requiere migrar datos. |

## Por qué este stack

- **Fastify + Prisma**: el esquema de Prisma es a la vez el modelo y la
  documentación del dominio; las migraciones quedan versionadas en el repositorio,
  que es exactamente lo que un auditor pide sobre cambios al sistema.
- **PostgreSQL**: transacciones reales para operaciones que deben ser atómicas
  (marcar N controles al cerrar un periodo) y agregaciones para los tableros.
- **React + Vite**: SPA estática servible por Nginx, sin runtime de servidor.
- **TypeScript en ambos lados**: los tipos del API y de la web no se contradicen.
