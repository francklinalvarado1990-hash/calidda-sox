# Manual de operación

## Variables de entorno

Todas se documentan en `.env.example`. Las críticas:

| Variable | Efecto |
|---|---|
| `JWT_SECRET` | Firma las sesiones. Mínimo 32 caracteres. `openssl rand -base64 48`. Cambiarla cierra todas las sesiones. |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. |
| `PUBLIC_URL` | URL con la que se arman los enlaces de los correos. Si está mal, los correos llevan a ninguna parte. |
| `MAIL_DRIVER` | `smtp` en producción, `console` en desarrollo (imprime el correo en el log, no envía). |
| `MFA_ROLES_OBLIGATORIO` | Roles que deben usar doble factor. |
| `JOBS_HABILITADOS` | Debe estar en `true` **en una sola instancia**. |
| `DIA_APERTURA_PERIODO` | Día del mes en que se abre el periodo automáticamente. |
| `DIAS_HABILES_CIERRE_PERIODO` | Días hábiles tras el fin de mes como límite de cierre. |
| `RECORDATORIO_DIAS_PREVIOS` | Hitos de aviso antes del vencimiento (por defecto `7,3,1`). |
| `RETENCION_ANIOS` | Retención de evidencias. 7 por defecto. |

## Puesta en producción

```bash
cp .env.example .env
# 1. JWT_SECRET real
# 2. DATABASE_URL apuntando al PostgreSQL corporativo
# 3. MAIL_DRIVER=smtp con las credenciales del relay
# 4. PUBLIC_URL con la URL real de la plataforma
# 5. WEB_ORIGIN con el mismo dominio

docker compose up -d --build
```

El contenedor del API ejecuta `prisma migrate deploy` al arrancar: las migraciones
pendientes se aplican solas.

Primer arranque:

```bash
docker compose exec api npx prisma db seed
```

Anote las contraseñas temporales que imprime, entréguelas por un canal seguro y
verifique que cada usuario las cambie en su primer ingreso.

### Lista de verificación antes de abrir al negocio

- [ ] `JWT_SECRET` propio, no el del ejemplo.
- [ ] HTTPS con certificado válido (las cookies usan `secure` en producción).
- [ ] SMTP probado: `GET /api/salud` debe reportar `"correo": true`.
- [ ] Contraseñas de la semilla cambiadas.
- [ ] MFA activado para los administradores y el líder SOX.
- [ ] Feriados del año cargados (`/api/catalogos/feriados`).
- [ ] Respaldo automático de base **y** del volumen de evidencias.
- [ ] Restauración del respaldo probada al menos una vez.
- [ ] Matriz de controles cargada y validada con los dueños de proceso.

## Operación mensual

| Momento | Quién | Acción |
|---|---|---|
| Día 1 | Automático | Se abre el periodo y cada responsable recibe su lista. |
| Días 1–10 | Responsables | Ejecutan, adjuntan evidencia y envían a revisión. |
| Días hábiles, 08:00 | Automático | Recordatorios, marcado de vencidos y escalamiento. |
| Tras el límite | Automático | Cierra si está completo; si no, deja *En cierre* y avisa al líder SOX. |
| Al cerrar | Líder SOX | Cierra el periodo; si hay pendientes, registra el sustento. |
| Después | Líder SOX | Revisa *Pendientes arrastrados* y da seguimiento a las deficiencias. |

## Respaldos

```bash
# Base de datos
docker compose exec db pg_dump -U sox calidda_sox | gzip > respaldo-$(date +%F).sql.gz

# Evidencias
docker run --rm -v calidda-sox_evidencias:/datos -v "$PWD":/salida alpine \
  tar czf /salida/evidencias-$(date +%F).tar.gz -C /datos .
```

Respalde **ambos**. La base sin los archivos no acredita nada ante el auditor.

Restauración:

```bash
gunzip -c respaldo-2026-08-21.sql.gz | docker compose exec -T db psql -U sox calidda_sox
```

## Solución de problemas

**No llegan los correos**
1. `GET /api/salud` → si `"correo": false`, el API no alcanza el SMTP.
2. *Auditoría → Correos enviados*: los que están en `ERROR` muestran el motivo.
3. El job de recordatorios reintenta automáticamente los fallidos cada día.
4. Con `MAIL_DRIVER=console` no se envía nada: es lo esperado en desarrollo.

**Un usuario no puede ingresar**
- «Cuenta bloqueada temporalmente»: superó los intentos permitidos; espere el
  tiempo indicado o use *Restablecer clave*.
- «Su rol exige doble factor»: debe completar el enrolamiento; la pantalla de
  ingreso lo guía.
- Cuenta desactivada: reactívela desde *Usuarios*.

**El periodo no se abrió solo**
- Verifique `JOBS_HABILITADOS=true` y `DIA_APERTURA_PERIODO`.
- Debe existir al menos un usuario `ADMIN` o `SOX_MANAGER` activo: los jobs se
  ejecutan bajo su identidad.
- Dispare manualmente: `POST /api/jobs/apertura-mensual/ejecutar`.

**Un control no apareció en el periodo**
- Revise su frecuencia y `mesAncla`: un trimestral con ancla en marzo no aplica
  en abril.
- Los `EVENTUAL` no se instancian automáticamente por diseño.
- El control debe estar activo. Si lo activó después de abrir el periodo, vuelva
  a ejecutar la apertura: es idempotente y solo agrega lo que falta.

**«La integridad del archivo no pudo verificarse»**
El hash del archivo en disco no coincide con el registrado. Indica alteración o
corrupción del almacenamiento. Restaure desde respaldo y revise la pista de
auditoría: el incidente queda registrado con el hash esperado y el encontrado.

**El tablero muestra números distintos a los del periodo**
Los tableros consolidan ambas empresas por defecto. Filtre por empresa para
compararlo con el detalle de un periodo específico.
