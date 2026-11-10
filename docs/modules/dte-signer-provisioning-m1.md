# Zolvi · Aprovisionamiento de firmadores DTE — Hito 1

Issue: #10. Estado: **diseño y preflight de solo lectura**, sin aplicación en VPS.

## Evidencia de arranque (2026-11-09)

- MetaTraining tiene emisor y credenciales TEST activos; **no tiene emisor PRODUCTION** en runtime auditado.
- MetaTraining está activo y provisionado en Control Plane, **sin PlatformDatabaseProfile** asociado. Se debe resolver el objetivo Dedicated DB Only antes de aprobar PROD.
- Falta acreditar autorización MH PROD y certificado PROD propio.
- El firmador TEST de MetaTraining funcionó previamente en puerto loopback 8115. No se realizó inventario del VPS WHM en esta sesión.
- El preflight de producción debe resolver por issuer/ambiente, no basarse en URL de firmador global.
- El script existente `prisma/scripts/register-dte-signer-credential.ts` ya incluye INSPECT, DRY_RUN y EXECUTE con confirmación por ambiente: reutilizar.

## Entregas por fases

1. **Inventario / plan sin escrituras.** Validar manifiesto sin secretos, inspeccionar Docker y puertos, reportar conflictos, comprobar aislamiento del certificado y del vhost SSL.
2. **Agente CLI idempotente.** PLAN, APPLY, VERIFY, ROLLBACK. Un certificado, contenedor, API key, hostname y puerto por organización/ambiente. Proteger los secretos 0600 y persistencia read-only; limitar root al host VPS.
3. **Integración con Zolvi.** Wizard Control Plane y persistencia cifrada; estado por organización y ambiente; preflight fail-closed; confirmación humana para PROD.
4. **Certificación.** Validar TrustMe intacto, MetaTraining TEST intacto, bloqueos PROD, aislamiento entre tenants, fallas y rollback.

## Barreras de seguridad

- Ningún APPLY sobre VPS ni cambio de credenciales dentro de esta rama.
- No incorporar certificados, passwords, tokens ni cadenas JWS al repositorio.
- No reenviar DTE ni activar PRODUCCIÓN sin autorización MH y aprobación separada.
- No reutilizar firmador TEST como PROD, no alterar TrustMe.
- Mantener una base PostgreSQL dedicada por cliente como requisito antes del cutover.

## Ejecución del primer hito

El prototipo local de preflight de solo lectura está disponible como entregable adjunto en la conversación del proyecto: `preflight.mjs` + tests y un manifiesto de ejemplo. Antes de integrarlo en el repo se debe contrastar contra el inventario real de WHM y revisar el alcance de acceso (Docker/Apache).

Referencia: `docs/modules/dte-signer-multitenant-block.md`, `docs/modules/dte-signer-routing-runbook.md`, `docs/context/current-state.md`; guía fuente *Guía Zolvi — Firmadores DTE y MariaDB*, sección 07.

## Criterio de salida del hito 1

Un reporte de inventario por emisor/ambiente sin secretos, con colisiones detectadas, distinción TEST/PROD, estado de Dedicated DB Only, bloqueo MH PROD y pasos explícitos antes de cualquier APPLY.
