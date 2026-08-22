# Guía de contribución

## Antes de enviar un cambio

```bash
npm run typecheck   # tipos de API y web
npm test            # pruebas de la lógica de negocio
npm run build       # compila ambos paquetes
```

## Reglas del proyecto

Este repositorio soporta un proceso sujeto a auditoría externa. Hay decisiones
de diseño que no son preferencias de estilo, sino requisitos de cumplimiento:

1. **Nada se borra.** Evidencias, controles y periodos se dan de baja lógicamente.
   Si necesita un `DELETE`, replantee el modelo.
2. **Toda acción sensible se audita.** Si agrega un endpoint que modifica datos,
   llame a `auditar()` con el estado anterior y el nuevo.
3. **La decisión de estado vive en `src/core/workflow.ts`.** Es una función pura y
   está cubierta por pruebas. No replique lógica de transiciones en las rutas.
4. **La autorización se resuelve en el servidor.** Los permisos del frontend solo
   ocultan botones; cada ruta debe declarar `app.exigir('permiso')`.
5. **Los secretos no entran a la pista de auditoría.** Si agrega un campo sensible,
   inclúyalo en `CAMPOS_SENSIBLES` de `src/core/auditoria.ts`.
6. **Las fechas se calculan en `America/Lima` y en días hábiles.** Use los ayudantes
   de `src/utils/fechas.ts`; nunca `new Date()` directo para lógica de negocio.

## Convenciones

- Código y comentarios en español, sin tildes en identificadores.
- Los mensajes de error del API se muestran al usuario final: escríbalos en
  lenguaje de negocio, indicando qué hacer para resolver la situación.
- Cada cambio en el modelo de datos requiere una migración de Prisma versionada:
  `npm run db:migrate:dev -w @calidda-sox/api -- --name descripcion_del_cambio`.
