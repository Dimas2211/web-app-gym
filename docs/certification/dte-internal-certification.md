# Certificación interna DTE precomercial (sin MH)

Batería repetible para certificar la integración DTE de Zolvi **sin**
Ministerio de Hacienda, **sin** base de datos real y **sin** secretos
reales. No reemplaza la certificación externa ante MH: la prepara.

```bash
npm run dte:certify                 # suite + tests DTE existentes + tsc
npm run dte:certify -- --with-build # + npm run build
npm run dte:certify -- --quick      # solo la suite de certificación
```

Salida: reporte en consola y artefacto JSON saneado en
`.certification/dte-internal-certification/<timestamp>.json` +
`latest.json`. La carpeta está en `.gitignore`: los resultados no se
commitean. Exit code 0 solo si todo es PASS.

## Principio: mismo código productivo, fakes solo en las fronteras

```
Server Actions DTE reales (requireOperationalContext real: READ_ONLY, módulo fiscal.dte)
  → services / builders / correlativos reales
  → validador AJV + schemas oficiales MH del repo
  → resolveDteSignerConfigForIssuer / resolveMhAuthCredentials + AES real
  → adapters HTTP reales (firmador, auth MH, recepción, anulación)
  → fetch  ←── FakeFiscalNetwork (único punto de red)
```

| Pieza | Real | Sustituida |
|---|---|---|
| Ventas (`createSaleDraft` → `addSaleItemToDraft` → `confirmSale`), `createExportSale` | ✅ | — |
| Actions DTE, guards, builders FE/CCFE/NC/FSE/FEX, invalidación, metering | ✅ | — |
| Base runtime | — | `InMemoryPrismaDb`: harness en memoria derivado del schema Prisma (DMMF) que reproduce los modelos, relaciones y restricciones necesarias para la certificación (uniques, FKs, registro inexistente, Decimal/Json, rollback de `$transaction`). No sustituye una prueba de concurrencia/transacciones reales de PostgreSQL |
| Firmador / MH | — | `FakeFiscalNetwork` sobre `fetch`: firmador, `/seguridad/auth`, `/fesv/recepciondte` y `/fesv/anulardte` de MH TEST. Cualquier otra URL o un host de MH PRODUCTION genera una violación y error |
| Sesión (`requireAdmin`, `resolveEffectiveTenantContext`) | — | Sesión sintética. `readOnly`, `runtimeMode`, tenant y location se controlan por caso |
| Contexto comercial (Control Plane) | — | `fiscal.dte` habilitado o deshabilitado por caso |
| Prisma global, Control Plane, Runtime Router, MariaDB | — | **Trampas**: cualquier acceso queda registrado y la certificación falla. Única excepción permitida: `dteCatalogItem` (catálogo oficial global, GLOBAL_REFERENCE) |

Los fakes viven solo en `src/modules/commerce/dte/certification/`. No
existe flag ni env que los active en runtime.

## Fixtures

Todo se genera en cada corrida: tenants, locations, usuarios y emisores
con UUID nuevos; NIT/NRC con prefijo reservado `0000`; credenciales MH y
de firmador aleatorias, cifradas con una `PLATFORM_ENCRYPTION_KEY`
efímera. La suite borra de `process.env` `DATABASE_URL`, `DIRECT_URL`,
`DTE_*`, `EXTERNAL_DTE_*` y `PLATFORM_ENCRYPTION_KEY`, y el runner
tampoco se los pasa al proceso hijo. Ningún cliente real (TrustMe, GYM,
MetaTraining) se resuelve por nombre ni por id.

Topología:

- **DB A**: tenant A con L1 y L2 (con emisor) y L3 (sin emisor), más un
  tenant C intruso en la misma base física (aislamiento lógico).
- **DB B**: tenant B en una base dedicada separada (aislamiento físico).

## Matriz certificada

El catálogo de casos está en `harness/certification-catalog.ts`. Un caso
del catálogo que no se ejecuta se reporta como MISSING, que cuenta como
FAIL.

| Sección | Qué prueba |
|---|---|
| FE01 | Consumidor final; servicio con IVA incluido (2 × 113 → gravado 226, IVA 26); schema oficial; correlativo 1 → 2; firma; recepción |
| CCFE03 | Receptor con NIT/NRC; IVA separado (precio 100, tributo `20` = 26); schema; firma; recepción |
| NC05 | Solo sobre CCFE03 ACCEPTED; relación `CREDIT_NOTE_OF` con monto; `documentoRelacionado`; schema; firma; se bloquea una segunda NC |
| FSE14 | Compra FSE (COV bloqueada); proveedor EXCLUDED_SUBJECT; sin IVA; renta 10 % SERVICES/persona natural y sin retención en GOODS (vía `computeIncomeTaxWithholding` real); schema; firma |
| FEX11 servicios | Cliente extranjero; CAT-020 (rechaza código legado y SV); proyección CAT-013 v3 (05/28/11); CAT-014; FEX v3; schema; firma; **bienes y mixto siguen bloqueados** |
| Invalidación | FE01 ACCEPTED con receptor identificado; evento; schema `anulacion-schema-v2`; firma; recepción → INVALIDATED; bloqueos de estado y tipo |
| Respuestas MH | PROCESADO → ACCEPTED; `["",""]` → ACCEPTED (no OBSERVED); observaciones reales → OBSERVED; RECHAZADO → REJECTED; timeout y estado inesperado → se mantiene SIGNED |
| Guards | Sin emisor; dos emisores activos; location y tenant incorrectos; Support Session read-only (0 operaciones DB, 0 red); módulo deshabilitado; CCFE sin NRC (con rollback del correlativo); NC sin CCFE aceptado; datos FEX inválidos; unidad MH inválida; documento duplicado; retransmisión de un ACCEPTED |
| Aislamiento e idempotencia | Tenant A/B; location L1/L2; emisor y credencial de otro emisor no utilizables; correlativos que no se mezclan; solo el cliente runtime dedicado; el reintento técnico reutiliza el mismo documento, número y JWS; REJECTED regenera con correlativo nuevo; el ledger de metering no se duplica |
| Seguridad | Sin red real; sin MariaDB; sin Prisma global ni Control Plane; ningún secreto sintético aparece en consola, filas, logs, resultados ni red; solo fixtures sintéticos |

## Hallazgos de la primera ejecución (2026-10-12)

**BUG-1 (corregido): la invalidación no usaba la `DteCredential` del emisor.**
`MhInvalidationTransmissionAdapter` pedía el token MH con
`getCachedToken(env)`, sin `issuerConfigId`. Consecuencias:

- En TEST solo funcionaba si `.env` tenía `DTE_MH_USER/PASSWORD`. Así
  fueron aceptadas las invalidaciones históricas.
- En PRODUCTION, `resolveMhAuthCredentials` sin emisor siempre falla.

El evento quedaba en `SIGNED` y la action combinada no podía reintentarse.

Fix mínimo, alineado con `dte-transmission.adapter.ts`:
`DteInvalidationTransmissionInput.issuerConfigId`. El servicio pasa
`dteDoc.issuer_config_id` y el adapter lo usa para obtener y renovar el
token. Regresión: `dte-invalidation-transmission.adapter.test.ts` y un
caso nuevo en `transmit-invalidation-event.service.runtime-write.test.ts`,
que fallan sin el fix.

**BUG-2 — deuda conocida `CONTINGENCY_AUTH_ISSUER_CREDENTIAL_GAP` (no
corregida).** `dte-contingency-transmission.adapter.ts` también llama
`getCachedToken(env)` sin emisor. Sin entry point productivo actual
(`CONTINGENCY_PRODUCT_ENTRYPOINT = NONE`). Corregir con el mismo patrón
que BUG-1 antes de habilitar contingencia.

**OBS-1: FE01 a consumidor final sin documento.** Restricción observada
contra el schema de invalidación actualmente incorporado
(`anulacion-schema-v2.json` exige `tipoDocumento`, `numDocumento` y
`nombre` del receptor como strings, y el builder lo aplica): una FE01 sin
documento del receptor no pudo invalidarse en la certificación. Requiere
validación normativa antes de definir política comercial. No se modificó
código.

## Alcance NO certificado aquí

- Criptografía real del firmador y aceptación real por MH. Evidencia
  histórica TrustMe en MH TEST: FE01, CCFE03, FSE14, FEX11 servicios e
  invalidación ACCEPTED.
- **NC05 ante MH**: sin evidencia ACCEPTED vigente. Requiere
  recertificación externa.
- **Invalidación tras el fix BUG-1**: certificada internamente. Debe
  verificarse en la próxima ventana MH real.
- FEX11 bienes y mixto (bloqueados mientras no haya fuente oficial de
  `tipoRegimen`).
- Contingencia, entrega externa MariaDB, reconciliación y consulta MH.
- Concurrencia real de PostgreSQL (locks, serializable). La base en
  memoria serializa las operaciones.
- Creación de compras por el módulo purchases: la compra FSE se siembra
  en estado CONFIRMED con los campos que purchases persiste.

## Mantenimiento

- Agregar un caso: título en `CERT_SECTIONS` y `it()` con ese título en
  `dte-internal-certification.test.ts`.
- Si un servicio DTE empieza a usar un operador Prisma o SQL que la base
  en memoria no soporta, la suite **falla cerrado** con
  `[certification-db] …`. Se agrega soporte en `in-memory-prisma.ts`;
  nunca se ignora el operador.
- La suite también corre dentro de `npx vitest run`.
