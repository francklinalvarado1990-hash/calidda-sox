-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'SOX_MANAGER', 'CONTROL_OWNER', 'REVISOR', 'PREPARADOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ProveedorAuth" AS ENUM ('LOCAL', 'ENTRA_ID', 'SAML');

-- CreateEnum
CREATE TYPE "Frecuencia" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'EVENTUAL');

-- CreateEnum
CREATE TYPE "TipoControl" AS ENUM ('PREVENTIVO', 'DETECTIVO');

-- CreateEnum
CREATE TYPE "NaturalezaControl" AS ENUM ('MANUAL', 'AUTOMATICO', 'HIBRIDO', 'ITGC', 'IPE');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('PLANIFICADO', 'ABIERTO', 'EN_CIERRE', 'CERRADO', 'CERRADO_CON_PENDIENTES');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('PENDIENTE', 'EN_EJECUCION', 'EN_REVISION', 'OBSERVADO', 'APROBADO', 'CERRADO', 'NO_APLICA', 'VENCIDO');

-- CreateEnum
CREATE TYPE "ResultadoControl" AS ENUM ('EFECTIVO', 'EFECTIVO_CON_OBSERVACIONES', 'DEFICIENTE', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "PasoWorkflow" AS ENUM ('PREPARACION', 'REVISION', 'APROBACION_OWNER');

-- CreateEnum
CREATE TYPE "AccionAprobacion" AS ENUM ('ENVIAR', 'APROBAR', 'RECHAZAR', 'REASIGNAR', 'REABRIR', 'MARCAR_NO_APLICA');

-- CreateEnum
CREATE TYPE "SeveridadDeficiencia" AS ENUM ('OBSERVACION', 'DEFICIENCIA', 'DEFICIENCIA_SIGNIFICATIVA', 'DEBILIDAD_MATERIAL');

-- CreateEnum
CREATE TYPE "EstadoDeficiencia" AS ENUM ('ABIERTA', 'EN_REMEDIACION', 'EN_VALIDACION', 'CERRADA', 'ACEPTADA');

-- CreateEnum
CREATE TYPE "TipoRecordatorio" AS ENUM ('APERTURA_PERIODO', 'PROXIMO_VENCIMIENTO', 'VENCIMIENTO_HOY', 'VENCIDO', 'ESCALAMIENTO', 'PENDIENTE_REVISION', 'OBSERVADO', 'RESUMEN_CIERRE', 'DIGEST_SEMANAL');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procesos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "responsable" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "procesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subprocesos" (
    "id" TEXT NOT NULL,
    "procesoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subprocesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "cargo" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'PREPARADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "passwordSetAt" TIMESTAMP(3),
    "debeCambiarPwd" BOOLEAN NOT NULL DEFAULT false,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "proveedorAuth" "ProveedorAuth" NOT NULL DEFAULT 'LOCAL',
    "subjectExterno" TEXT,
    "mfaSecret" TEXT,
    "mfaHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "ultimoLogin" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_empresa" (
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "usuario_empresa_pkey" PRIMARY KEY ("usuarioId","empresaId")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controles" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "procesoId" TEXT NOT NULL,
    "subprocesoId" TEXT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "objetivo" TEXT,
    "riesgo" TEXT,
    "tipo" "TipoControl" NOT NULL,
    "naturaleza" "NaturalezaControl" NOT NULL,
    "frecuencia" "Frecuencia" NOT NULL,
    "mesAncla" INTEGER NOT NULL DEFAULT 1,
    "esClave" BOOLEAN NOT NULL DEFAULT false,
    "aserciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cuentasContables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sistemas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diasHabilesPlazo" INTEGER NOT NULL DEFAULT 5,
    "requiereRevision" BOOLEAN NOT NULL DEFAULT true,
    "requiereAprobacionOwner" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "preparadorId" TEXT,
    "revisorId" TEXT,
    "evidenciaRequerida" TEXT,
    "procedimiento" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_versiones" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "cambios" JSONB,
    "motivo" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'PLANIFICADO',
    "fechaApertura" TIMESTAMP(3),
    "fechaLimiteCierre" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "abiertoPorId" TEXT,
    "cerradoPorId" TEXT,
    "notaCierre" TEXT,
    "resumenCierre" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejecuciones" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "codigoControl" TEXT NOT NULL,
    "nombreControl" TEXT NOT NULL,
    "estado" "EstadoEjecucion" NOT NULL DEFAULT 'PENDIENTE',
    "resultado" "ResultadoControl",
    "conclusion" TEXT,
    "muestraTamano" INTEGER,
    "excepciones" INTEGER DEFAULT 0,
    "asignadoAId" TEXT,
    "revisorId" TEXT,
    "ownerId" TEXT,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "fechaEnvioRevision" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "marcadoPendiente" BOOLEAN NOT NULL DEFAULT false,
    "motivoPendiente" TEXT,
    "diasAtrasoAlCierre" INTEGER,
    "regularizadoEnPeriodoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ejecuciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprobaciones" (
    "id" TEXT NOT NULL,
    "ejecucionId" TEXT NOT NULL,
    "paso" "PasoWorkflow" NOT NULL,
    "accion" "AccionAprobacion" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "comentario" TEXT,
    "estadoAnterior" "EstadoEjecucion" NOT NULL,
    "estadoNuevo" "EstadoEjecucion" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aprobaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" TEXT NOT NULL,
    "ejecucionId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "descripcion" TEXT,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subidoPorId" TEXT NOT NULL,
    "subidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "retenerHasta" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deficiencias" (
    "id" TEXT NOT NULL,
    "ejecucionId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "severidad" "SeveridadDeficiencia" NOT NULL,
    "estado" "EstadoDeficiencia" NOT NULL DEFAULT 'ABIERTA',
    "descripcion" TEXT NOT NULL,
    "causaRaiz" TEXT,
    "impacto" TEXT,
    "planAccion" TEXT,
    "responsableId" TEXT,
    "fechaCompromiso" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "evidenciaCierre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deficiencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordatorios" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRecordatorio" NOT NULL,
    "ejecucionId" TEXT,
    "periodoId" TEXT,
    "destinatario" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" "EstadoEnvio" NOT NULL DEFAULT 'PENDIENTE',
    "error" TEXT,
    "claveDedup" TEXT NOT NULL,
    "enviadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descripcion" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "actorEmail" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_codigo_key" ON "empresas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_empresaId_codigo_key" ON "procesos"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "subprocesos_procesoId_codigo_key" ON "subprocesos"("procesoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_subjectExterno_key" ON "usuarios"("subjectExterno");

-- CreateIndex
CREATE INDEX "usuarios_rol_activo_idx" ON "usuarios"("rol", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE INDEX "controles_empresaId_activo_idx" ON "controles"("empresaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "controles_empresaId_codigo_key" ON "controles"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "control_versiones_controlId_version_key" ON "control_versiones"("controlId", "version");

-- CreateIndex
CREATE INDEX "periodos_estado_idx" ON "periodos"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_empresaId_anio_mes_key" ON "periodos"("empresaId", "anio", "mes");

-- CreateIndex
CREATE INDEX "ejecuciones_estado_fechaLimite_idx" ON "ejecuciones"("estado", "fechaLimite");

-- CreateIndex
CREATE INDEX "ejecuciones_asignadoAId_estado_idx" ON "ejecuciones"("asignadoAId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ejecuciones_periodoId_controlId_key" ON "ejecuciones"("periodoId", "controlId");

-- CreateIndex
CREATE INDEX "aprobaciones_ejecucionId_creadoEn_idx" ON "aprobaciones"("ejecucionId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "evidencias_storageKey_key" ON "evidencias"("storageKey");

-- CreateIndex
CREATE INDEX "evidencias_ejecucionId_idx" ON "evidencias"("ejecucionId");

-- CreateIndex
CREATE INDEX "evidencias_sha256_idx" ON "evidencias"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "deficiencias_codigo_key" ON "deficiencias"("codigo");

-- CreateIndex
CREATE INDEX "deficiencias_estado_severidad_idx" ON "deficiencias"("estado", "severidad");

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_claveDedup_key" ON "recordatorios"("claveDedup");

-- CreateIndex
CREATE INDEX "recordatorios_estado_creadoEn_idx" ON "recordatorios"("estado", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "feriados_fecha_key" ON "feriados"("fecha");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidadId_idx" ON "audit_log"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "audit_log_creadoEn_idx" ON "audit_log"("creadoEn");

-- CreateIndex
CREATE INDEX "audit_log_usuarioId_creadoEn_idx" ON "audit_log"("usuarioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "procesos" ADD CONSTRAINT "procesos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subprocesos" ADD CONSTRAINT "subprocesos_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresa" ADD CONSTRAINT "usuario_empresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresa" ADD CONSTRAINT "usuario_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_subprocesoId_fkey" FOREIGN KEY ("subprocesoId") REFERENCES "subprocesos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_preparadorId_fkey" FOREIGN KEY ("preparadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles" ADD CONSTRAINT "controles_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_versiones" ADD CONSTRAINT "control_versiones_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones" ADD CONSTRAINT "ejecuciones_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones" ADD CONSTRAINT "ejecuciones_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones" ADD CONSTRAINT "ejecuciones_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprobaciones" ADD CONSTRAINT "aprobaciones_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprobaciones" ADD CONSTRAINT "aprobaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencias" ADD CONSTRAINT "deficiencias_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencias" ADD CONSTRAINT "deficiencias_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
