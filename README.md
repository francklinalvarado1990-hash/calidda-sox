# Repositorio de Controles SOX — Cálidda y Cálidda Energía

Plataforma web para administrar el ciclo completo de controles internos bajo la
Ley Sarbanes-Oxley: matriz de controles, ejecución mensual, workflow de
aprobación, archivamiento de evidencias, tableros de avance, recordatorios
automáticos de vencimiento y cierre formal del periodo.

---

## Qué resuelve

| Necesidad | Cómo se resuelve |
|---|---|
| **Control de usuarios** | Roles SOX (líder, dueño, revisor, preparador, auditor), doble factor obligatorio para roles críticos, alcance por empresa, baja lógica con revocación inmediata de sesiones. |
| **Workflow de aprobación** | Preparación → Revisión → Aprobación del dueño, con segregación de funciones impuesta por el motor, devolución con observaciones y bitácora inmutable. |
| **Archivamiento de documentos** | Evidencias selladas con SHA-256, sin sobrescritura ni borrado físico, retención configurable (7 años por defecto) y verificación de integridad en cada descarga. |
| **Acceso web** | Aplicación React responsive; el API y la web se sirven desde un mismo dominio detrás de Nginx. |
| **Dashboards de avance** | Cumplimiento consolidado y por empresa, tendencia mensual, cuellos de botella por proceso, ranking de responsables y próximos vencimientos. |
| **Recordatorios automáticos** | Avisos previos al vencimiento, alertas de atraso con reiteración, escalamiento al dueño del control y digest semanal. Todo el envío queda registrado. |
| **Ciclo mensual** | Apertura automática del periodo con instanciación por frecuencia, y cierre que exige que todo esté completo o un sustento escrito. |
| **Cierre con pendientes** | Cada control abierto queda marcado con sus días de atraso, el periodo se registra como *Cerrado con pendientes* y se envía un resumen **nombrando a quienes no cerraron**. |

---

## Puesta en marcha

Requisitos: Node.js 22+, PostgreSQL 16+ (o Docker).

```bash
git clone <url-del-repositorio>
cd calidda-sox
npm install

cp .env.example .env
# Genere un secreto real:  openssl rand -base64 48
# y péguelo en JWT_SECRET

docker compose up -d db          # o use un PostgreSQL propio

npm run db:migrate -w @calidda-sox/api   # crea el esquema
npm run db:seed                          # empresas, procesos, matriz base y usuarios
npm run dev                              # API en :3001, web en :5173
```

`db:seed` imprime en consola las contraseñas temporales de los usuarios de
arranque. **Cámbielas en el primer ingreso y no las versione.**

Para ver el sistema con historia (capacitación o demostración):

```bash
npm run db:demo -w @calidda-sox/api      # 6 periodos históricos con datos
```

### Despliegue con Docker

```bash
cp .env.example .env    # configure JWT_SECRET, SMTP y PUBLIC_URL
docker compose up -d --build
# Web en http://localhost:8080 — las migraciones se aplican al arrancar el API
```

---

## Estructura

```
apps/
  api/                      Node 22 · Fastify · Prisma · PostgreSQL
    prisma/schema.prisma      Modelo de datos (la referencia del dominio)
    prisma/seed.ts            Carga inicial
    prisma/demo.ts            Datos de demostración
    src/core/                 Reglas del negocio, sin dependencias de framework
      workflow.ts               Motor de estados y segregación de funciones
      permisos.ts               Matriz de "quién puede qué"
      auditoria.ts              Pista de auditoría append-only
      seguridad.ts              Hash de contraseñas (scrypt) y política
    src/modules/              Un módulo por dominio (rutas + servicio)
    src/jobs/                 Procesos programados
    src/mail/                 Plantillas y envío con deduplicación
    src/storage/              Almacenamiento de evidencias (local o S3)
    tests/                    Pruebas de la lógica de negocio + humo end-to-end
  web/                      React 18 · Vite · TanStack Query · Recharts
infra/                      Dockerfiles y Nginx
docs/                       Arquitectura, operación y mejores prácticas SOX
```

---

## El ciclo mensual

```
  Día 1 (automático)              Durante el mes                Tras el cierre
┌────────────────────┐      ┌──────────────────────┐      ┌────────────────────┐
│ Apertura del       │      │ Preparación →        │      │ ¿Todo completo?    │
│ periodo:           │      │ Revisión →           │      │  Sí → CERRADO      │
│ · instancia por    │ ───► │ Aprobación del dueño │ ───► │  No → requiere     │
│   frecuencia       │      │                      │      │   sustento →       │
│ · fecha límite en  │      │ Recordatorios T-7,   │      │   CERRADO CON      │
│   días hábiles     │      │ T-3, T-1, vencido,   │      │   PENDIENTES       │
│ · correo a cada    │      │ escalamiento         │      │  + marca por       │
│   responsable      │      │                      │      │    control         │
└────────────────────┘      └──────────────────────┘      │  + correo con los  │
                                                          │    incumplidos     │
                                                          └────────────────────┘
```

El cierre automático **nunca fuerza** un periodo con pendientes: lo deja en
*En cierre* y avisa al líder SOX. Una decisión con consecuencias de cumplimiento
la toma una persona, no un `cron`.

---

## Procesos automáticos

| Proceso | Cuándo | Qué hace |
|---|---|---|
| `apertura-mensual` | Día configurable, 06:00 | Abre el periodo e instancia los controles del mes. |
| `recordatorios` | Días hábiles, 08:00 | Marca vencidos, avisa antes y después del vencimiento y escala al dueño. |
| `cierre-automatico` | Diario, 07:00 | Cierra el periodo anterior si está completo; si no, lo marca *En cierre* y avisa. |
| `digest-semanal` | Lunes, 07:30 | Resumen de avance a líderes y dueños de control. |

Se pueden disparar manualmente: `POST /api/jobs/{nombre}/ejecutar`.

> Si corre varias instancias del API, solo una debe tener `JOBS_HABILITADOS=true`.

---

## Verificación

```bash
npm run typecheck    # tipos de API y web
npm test             # 51 pruebas de la lógica de negocio
npm run build        # compila ambos paquetes

# Prueba de humo del ciclo completo (requiere API arriba y base sembrada)
node apps/api/tests/e2e/humo.mjs
```

---

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — decisiones de diseño y modelo de datos.
- [`docs/OPERACION.md`](docs/OPERACION.md) — puesta en producción, respaldos, correo y solución de problemas.
- [`docs/MEJORES-PRACTICAS.md`](docs/MEJORES-PRACTICAS.md) — recomendaciones para que el sistema resista una auditoría.
- [`docs/API.md`](docs/API.md) — referencia de endpoints.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — reglas que no son negociables al modificar el código.
