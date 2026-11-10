# DTE — Onboarding fiscal automatizado (firmador + MariaDB opcional)

Estado: **implementado y probado en local; migración NO aplicada a ninguna base remota** (2026-11-10, rama `feat/ui-visual-refresh`, sin commit).
Guía operativa de referencia: `docs/modules/guia-zolvi-firmador-dte-mariadb.md` (§06–09 + anexo).

## Flujo (Control Plane → Organización → "Onboarding fiscal")

Cliente → Configuración fiscal → Firmador → MariaDB (opcional) → Verificaciones → Activación.
Estados: `DRAFT → VALIDATING → INFRA_READY → SIGNER_READY → MH_TEST_ACCEPTED → MARIADB_READY → READY_TEST` y, por separado, `READY_PROD`.
`READY_TEST` nunca implica `READY_PROD`. Para PROD hacen falta:

- BD dedicada;
- emisor PROD;
- credenciales MH propias;
- firmador efectivo propio y aislado de TEST;
- preflight sin bloqueos;
- atestación de la autorización MH (super_admin).

## Bloque A — Firmadores por organización/ambiente

| Pieza | Archivo |
|---|---|
| Núcleo compartido (validación, nombres, plantillas `zolvi-signer-v1`, puertos 8120–8199; 8113/8114/8115 reservados) | `ops/dte-signer-executor/lib/signer-core.mjs` |
| Ejecutor VPS (solo `inspect/apply/verify/rollback`, execFile sin shell, HMAC + nonce, protegido `dte-firmador-metatraining-test`) | `ops/dte-signer-executor/zolvi-signer-executor.mjs` + `README.md` + `systemd/` |
| Planner puro (colisiones de hostname/puerto/contenedor, conflictos no administrados, drift de API Key) | `src/modules/platform/dte-onboarding/signer-provisioning.planner.ts` |
| Orquestador INSPECT/PLAN/APPLY/VERIFY/ROLLBACK (lock, API Key generada una vez y cifrada antes del VPS, rollback solo del run propio) | `signer-provisioning.service.ts` |
| Transporte y verificación remota (DNS, TLS, 403 sin/con clave errónea, acceso con clave) | `signer-executor.transport.ts`, `signer-remote-verifier.ts` |

Variables del servidor:

- `ZOLVI_SIGNER_EXECUTOR_URL` (https);
- `ZOLVI_SIGNER_EXECUTOR_SECRET` (≥ 32 caracteres);
- opcionales: `ZOLVI_SIGNER_ALLOWED_ROOT_DOMAINS`, `ZOLVI_SIGNER_VPS_IP`.

Sin estas variables, PLAN funciona sin observación del VPS y APPLY/VERIFY/ROLLBACK fallan de forma explícita.

El certificado `.crt` **nunca** pasa por Zolvi: lo coloca el operador en `/opt/zolvi-signers/<id>/cert/<NIT>.crt`.

Credenciales:

- Al guardar `signerApiKey` se rechaza en el servidor si coincide con `apiPassword`, `signerPrivateKeyPassword` o `apiUser` (`dte-credential-secret-guard.ts`). Lo mismo aplica en `register-dte-signer-credential.ts`.
- La UI solo muestra la huella de la clave (16 hex).
- El preflight PRODUCTION verifica el firmador **efectivo del emisor**: `GLOBAL_ENV` bloquea, igual que una URL o API Key no propias, secretos confundidos, un NIT distinto o la reutilización del firmador TEST.

## Bloque B — MariaDB por organización (opcional)

- Configuración en `PlatformExternalIntegration` (cifrada).
  - Al crearse queda inactiva.
  - Una contraseña en blanco conserva la guardada.
  - No admite un destino host/puerto/base/tabla compartido con otra organización.
  - La prueba usa `EXPLAIN INSERT` y nunca inserta.
  - Para habilitarla hace falta una prueba `SUCCESS`; la entrega automática fija `auto_delivery_enabled_at`.
- Sin integración, el estado es `NOT_CONFIGURED`: no bloquea la emisión y no hereda nada.
- Outbox persistente `PlatformDteExternalDeliveryJob`:
  - clave estable por organización/ambiente/tipo/documento;
  - reclamo atómico con lease;
  - estados `PENDING / IN_PROGRESS / DELIVERED / FAILED_RETRYABLE / UNCERTAIN / RECONCILED_DELIVERED / CANCELLED`.
- Resultados del adapter: `CONFIRMED`, `DUPLICATE`, `NOT_INSERTED` (reintentable) y `UNCERTAIN` (timeout o conexión perdida durante el INSERT).
  - `UNCERTAIN` bloquea los reintentos y exige conciliación manual con una nota.
  - **No se garantiza entrega exactamente-una-vez**: falta deduplicación en el receptor (`codigoGeneracion` UNIQUE).
- Worker: `npx tsx prisma/scripts/process-dte-external-delivery-outbox.ts --mode DRY_RUN|EXECUTE [--org <id>] [--limit N]`.
  - Solo descubre DTE `ACCEPTED` desde `auto_delivery_enabled_at`, sin re-entregar históricos.
  - Las entregas previas al ledger (logs sin `jobId`) cuentan como evidencia.
  - La transmisión a MH no se modificó.

## Cierre técnico (2026-11-10)

Correcciones sobre la implementación inicial (con pruebas de regresión):

1. **Descubrimiento del worker**: releía siempre los primeros 50 DTE desde `auto_delivery_enabled_at`, así que a partir del 51 nunca se encolaban. Ahora pagina y salta los ya presentes en el ledger (`listKnownDocumentIds`).
2. **APPLY**: el lock se toma antes de INSPECT y se relee la fila. Antes, un APPLY que había leído la fila sin clave podía generar una segunda API Key y sobrescribir la cifrada.
3. **Estados**:
   - Un firmador administrado solo cuenta como firmador efectivo con VERIFY exitoso (`SIGNER_READY`); `INFRA_READY` (lo que reporta APPLY) ya no basta para READY_TEST/READY_PROD.
   - `MH_TEST_ACCEPTED` solo cuenta DTE aceptados desde el registro de la credencial de ese firmador.
   - READY_PROD exige `SIGNER_REACHABLE = ok`; antes, con un health check fallido, el preflight quedaba en WARNING y aun así se aceptaba.
4. **Protección**: el ejecutor y el planner bloquean `PROTECTED_HOSTNAMES` (`firmador-metatraining-test.getzolvi.com`) y cualquier vhost cuyo directorio ya tenga includes ajenos (`CONFLICT_UNMANAGED`). Esto cubre los dominios TrustMe.
5. **Operación**:
   - `GET /healthz` local en el ejecutor y `DOCKER_CONFIG` en la unidad systemd.
   - README con prerrequisitos, health checks, foto de protección y desinstalación.
   - Plantillas systemd del worker en `ops/dte-external-delivery-worker/` (DRY_RUN por defecto, no habilitadas).

## Cierre de seguridad (2026-11-10)

1. **Integración MariaDB modificada**: si cambian host/puerto/base/tabla/usuario/contraseña, la integración queda `is_active = false`, `last_test_status = UNTESTED` y sin entrega automática. Eso bloquea, en el resolver del servidor, la entrega manual, la automática y las invalidaciones. Para rehabilitarla hace falta una prueba SUCCESS más una habilitación explícita. La prueba solo certifica la configuración que realmente probó: es una escritura condicional sobre el payload. No se tocan ni el ledger, ni los logs, ni las integraciones de otras organizaciones.
2. **Aislamiento tenant**: `resolveExternalDteMariaDbDestination` exige `tenantId` y compara contra `PlatformOrganization.tenant_id`. Si la organización no tiene tenant, falta el tenant del documento o los dos no coinciden, devuelve `TENANT_MISMATCH` y no se entrega. Cubre la entrega DTE, las invalidaciones (antes sin control) y el worker. `deliverDteToExternalDb` mantiene una segunda verificación, ahora también fail closed.
3. **Anti-replay del ejecutor**: los nonces aceptados se persisten como sha256 en `/var/lib/zolvi-signer-executor/nonces.json` (`StateDirectory` de systemd) antes de ejecutar la operación, con escritura atómica. Expiran a los 2×skew (10 min) y el almacén tiene un tope de 10 000. Si está lleno o no puede escribirse, la request se rechaza (`NONCE_STORE_UNAVAILABLE`). Si el archivo está corrupto, el servicio no arranca.

## Base de datos

- Migración `prisma/migrations/20261110000000_dte_fiscal_onboarding_automation/` (aditiva): 3 tablas, 2 enums y 2 columnas en `platform_external_integrations`.
- Se probó en una base local desechable: `migrate deploy` correcto, `migrate diff` sin diferencias y concurrencia real del ledger (20 `ensureJob` producen 1 fila; 20 `claim`, 1 ganador). Esa base se eliminó después.
- **No se aplicó** a `TrustmeDB` local ni a ninguna base remota.
