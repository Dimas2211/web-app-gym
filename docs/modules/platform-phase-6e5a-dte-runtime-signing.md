# FASE VI-E5A — DTE signing runtime awareness

Migra la **firma** de DTE (FE01, CCFE03, FSE14, FEX11, NC05) para que un
RUNTIME_CLIENT firme íntegramente contra su propia runtime DB, siguiendo el
mismo patrón `requireOperationalContext` / `db` explícito ya certificado en
VI-E3 (FE/CCFE), VI-E4A (FSE/FEX) y VI-E4B (NC05 creación).

DTE creación: ✅ (VI-E3/E4A/E4B, sin cambios en esta fase)
DTE firma: ✅ (esta fase, PLATFORM_NATIVE y RUNTIME_CLIENT)
DTE transmisión a Hacienda: ❌ explícitamente fuera de alcance (VI-E5B)

No hay ciclo DTE end-to-end runtime-aware todavía — un RUNTIME_CLIENT puede
crear y firmar su DTE en su propia base, pero la transmisión a MH sigue
sobre Prisma global y queda deliberadamente bloqueada para ese caso hasta
VI-E5B.

## 1. Inventario de entry points de firma (antes de esta fase)

| Path / entry point | Tipos | DB source (antes) | Auth source | Tenant/location source | Credential client | Environment source | Support | ¿Llama signer? | Runtime-safe antes |
|---|---|---|---|---|---|---|---|---|---|
| `sign-dte-document.action.ts` → `signDteDocumentAction` | 01,03,05,14 (11 solo bajo fex11-feature-guard) | Prisma global | `requireAdmin` (JWT) | `sessionUser.tenant_id` + `getEffectiveLocationId` | Ninguno (global) | `dteDoc.environment` | No filtraba Support/read-only propio (dependía de `resolveCommercialEnforcementContext` manual, sin `readOnly`) | Sí | NO |
| `sign-dte-document.service.ts` → `signDteDocument` | agnóstico de tipo | Prisma global (`import { prisma }`) | — (recibe tenantId/locationId ya resueltos) | params | Ninguno (default global vía `resolveDteSignerConfigForIssuer` sin `client`) | `dteDoc.environment` | N/A (service puro) | Sí | NO |
| `create-and-transmit-credit-note.action.ts` (NC05 combinado) | 05 | `context.client` para create/generate/validate (VI-E4B); `signDteDocument`/`transmitDteDocument` sin `client` → Prisma global | `requireOperationalContext` | `context.tenantId/locationId` | Ninguno para el paso de firma | `dteDoc.environment` | Bloqueado por `requireOperationalContext({ write:true })` para los 3 primeros pasos, pero firma/transmisión seguían alcanzables si el gate de escritura pasaba | Sí (firma) + Sí (transmite) | NO (firma llegaba a Prisma global; transmisión también) |
| `reopen-rejected-dte-for-resign.action.ts` / `.service.ts` | cualquiera REJECTED por 802 | Prisma global | `requireAdmin` manual + `resolveCommercialEnforcementContext` manual | `sessionUser.tenant_id` + `getEffectiveLocationId` | N/A (no firma, solo reabre a SCHEMA_VALIDATED) | N/A | No filtraba read-only propio | No (prepara para re-firma) | NO |
| `reopen-signed-dte-for-resign.service.ts` | SIGNED nunca transmitido | Prisma global | N/A — **sin ninguna Server Action que lo invoque** | params | N/A | N/A | N/A | No | N/A (código sin entry point productivo) |
| `support-dte-sign-runner.ts` + `support-dte-sign.action.ts` (F2-B2) | 01, 03 | `PrismaClient` dinámico del `PlatformDatabaseProfile` (vía `withTemporaryPrismaClient`) | `requireSuperAdmin` + Safety Gate D0 (confirmación textual, `hasBackupConfirmation`, dry-run previo) | `profile.organization.tenant_id` | N/A (usa `DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` de proceso, no `DteCredential`) | `dteDoc.environment`, pero **hard block** si `profile.environment === "PRODUCTION"` o no está en `{LOCAL,TEST,SANDBOX}` | Feature de soporte deliberada — SÍ firma, pero solo en LOCAL/TEST/SANDBOX, nunca PRODUCTION, con superadmin + confirmación explícita | Sí (deliberado, gateado) | Ya blindado — no forma parte del pipeline RUNTIME_CLIENT |
| `dte/dev/verify-*.ts` (verify-fse14-e2e-local, verify-contingency-fe01-transmission-mh-test, verify-fex11-sign-local) | 01,03,14 | Prisma global | Script de consola, no HTTP | hardcoded en el script | N/A | hardcoded | N/A | Sí, contra un firmador real de desarrollo | No son entry points de producción — fuera de alcance de esta migración por diseño (documentado, no tocados) |
| `export-sale-dte.actions.ts` (FEX export) | 11 | ya runtime-aware (VI-E4A) | `requireOperationalContext` | context | N/A — **solo lectura de `signed_jws`/estado, no firma** | N/A | Ya cubierto en VI-E4A | No | Ya certificado en VI-E4A (lectura, no firma) |

## 2. Después de esta fase

| Path / entry point | DB source (después) | Support behavior | Runtime-safe |
|---|---|---|---|
| `sign-dte-document.action.ts` | `context.client` (runtime DB para RUNTIME_CLIENT, Prisma global para PLATFORM_NATIVE) | `requireOperationalContext({ write:true })` rechaza `READ_ONLY` antes de tocar el documento o el firmador | SÍ |
| `sign-dte-document.service.ts` | `db` explícito (default `= prisma`) — documento + `DteIssuerConfig` + credencial (`resolveDteSignerConfigForIssuer({ client: db })`) + log/persistencia, todo en el mismo `db` | N/A (service puro, hereda el `db` del caller) | SÍ, cuando el caller pasa `db` |
| `create-and-transmit-credit-note.action.ts` | create/generate/validate/sign → `context.client`; transmit → Prisma global, pero **nunca alcanzado por RUNTIME_CLIENT** (fail-closed tras firmar) | Igual que arriba | SÍ hasta `SIGNED`; transmisión sigue fuera de alcance, bloqueada explícitamente para RUNTIME_CLIENT |
| `reopen-rejected-dte-for-resign.action.ts` / `.service.ts` | `context.client` / `db` explícito | `requireOperationalContext({ write:true })` | SÍ |
| `reopen-signed-dte-for-resign.service.ts` | `db` explícito (preparado, sin entry point todavía) | N/A | SÍ cuando se invoque con `db`; sigue sin Server Action — abierto para una fase futura si se decide exponerlo |
| `support-dte-sign-runner.ts` / `support-dte-sign.action.ts` (F2-B2) | Sin cambios — feature de soporte separada, ya blindada | Sin cambios | Sin cambios (fuera de alcance de esta fase, ya certificada independientemente) |

## 3. Flujos combinados (bypass) — auditoría

El único flujo combinado real que llega a firma+transmisión en una sola
Server Action es `create-and-transmit-credit-note.action.ts` (NC05). Se
confirmó leyendo el código (no se asumió por el nombre) que efectivamente
ejecuta: crear NC → generar JSON → validar schema → **firmar** →
**transmitir a MH**, en una sola invocación.

Decisión (spec Q), opción **(A)** — threadear `context.client` a través de
la firma y cortar fail-closed antes de la transmisión para RUNTIME_CLIENT:

- `signDteDocument` ahora recibe `context.client` — el paso de firma corre
  en la runtime DB del tenant, igual que los 3 pasos anteriores.
- Inmediatamente después de un `signResult.ok === true`, si
  `context.authScope === "RUNTIME_CLIENT"`, la action retorna
  `{ ok: false, stepFailed: "transmitir_deferred" }` sin invocar
  `transmitDteDocument`. La NC queda `SIGNED` en su propia runtime DB,
  lista para transmitirse manualmente una vez exista VI-E5B.
- PLATFORM_NATIVO conserva el flujo completo (create+sign+transmit) sin
  ningún cambio de comportamiento externo.

Se eligió (A) sobre (B) (dejar la action entera PLATFORM_NATIVE-only)
porque el objetivo declarado de VI-E5A es certificar la firma — dejar
también la firma bloqueada para RUNTIME_CLIENT en este único flujo
combinado habría creado una inconsistencia innecesaria con
`sign-dte-document.action.ts` (que sí firma runtime-aware) sin ganar nada
en seguridad, ya que `transmitDteDocument` (el verdadero riesgo, dato hacia
MH) queda igual de bloqueado en ambas opciones.

## 4. Precondiciones de documento — preservadas sin cambios

- Estado origen: `SCHEMA_VALIDATED` únicamente. `BLOCKED_STATUSES` (`GENERATED`,
  `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `OBSERVED`, `INVALIDATED`) sin cambios.
  Sin `json_document` → rechaza. `signed_jws` existente en el documento no se
  revalida aquí (ese caso ya cae en `dte_status !== SCHEMA_VALIDATED`).
- FEX 11: `SIGNABLE_TYPE_CODES` (01/03/05/14) sin FEX. FEX 11 pasa por
  `canUseFex11InServerFlow` (TEST + flag) — sin cambios de reglas, solo la
  fuente de datos del documento (`context.client` en vez de Prisma global).
- Reopen (`REJECTED`→`SCHEMA_VALIDATED`, `SIGNED`(no transmitido)→`SCHEMA_VALIDATED`):
  reglas de guarda sin cambios — solo threading de `db`.

## 5. Invariante misma-runtime-DB (`DTE_SIGNING_SAME_RUNTIME_DB`)

Para RUNTIME_CLIENT, en una sola invocación de `signDteDocument(params, db)`:
`DteOutgoingDocument` (paso 1), `DteIssuerConfig` (paso 3b, nuevo check de
ambiente), `DteCredential` (vía `resolveDteSignerConfigForIssuer({..., client: db})`)
y `DteTransmissionLog` + el `update` final (dentro de `db.$transaction`) usan
todos el mismo objeto `db` — nunca se abre un segundo `PrismaClient` ni se
cae a `prisma` global en ningún punto intermedio. Certificado por
`sign-dte-document.service.runtime-write.test.ts`, que reemplaza el Prisma
global por un Proxy que lanza si se le llama.

**Resultado: DTE_SIGNING_SAME_RUNTIME_DB = SÍ.**

## 6. Fuente del emisor (`DteIssuerConfig`)

Antes de esta fase, `sign-dte-document.service.ts` nunca cargaba
`DteIssuerConfig` — solo pasaba `issuer_config_id` y `environment` a
`resolveDteSignerConfigForIssuer`, que solo toca `DteCredential`. Se agregó
un paso 3b explícito: carga `DteIssuerConfig` por `{id, tenant_id, location_id}`
desde el mismo `db`, y rechaza si no existe o si su `environment` no
coincide con `dteDoc.environment`. Cierra un gap estructural real (J) — antes
solo la constraint única `@@unique([tenant_id, location_id, environment])`
de `DteIssuerConfig` prevenía la mezcla, sin ningún assert explícito en el
propio service de firma.

## 7. Fuente de la credencial (`DteCredential`)

Sin cambios de lógica — `resolveDteSignerConfigForIssuer` (dte-credential.service.ts,
ya `client`-aware desde VI-E4A) ahora recibe `client: db` en **todos** los
callers RUNTIME_CLIENT: `sign-dte-document.service.ts` (esta fase) y, de
forma transitiva, `create-and-transmit-credit-note.action.ts`. El fallback
a `DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` de proceso (para TEST) y el bloqueo
explícito en PRODUCTION sin credencial de emisor se preservan intactos.

## 8. Precedencia de configuración del firmador

Sin cambios: 1) `DteCredential` activa del `issuer_config_id` (con
`signerNit`+`signerPrivateKeyPassword` utilizables) → `signerUrl` propia si
existe, si no cae a `resolveDteSignerConfig(environment)`; 2) fallback global
`DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` + `DTE_SIGNER_URL_TEST`/`_PRODUCTION`.
Nunca cruza ambientes — reforzado ahora por el check explícito del paso 3b.

## 9. Consistencia de ambiente

**`DTE_SIGNING_ENVIRONMENT_CONSISTENT = SÍ`** — el nuevo check del paso 3b
en `sign-dte-document.service.ts` hace estructural (assert explícito, no
solo constraint de BD) que `dteDoc.environment === issuerConfig.environment`
antes de resolver ninguna credencial. Cubierto por el test
`"ambiente del emisor (PRODUCTION) no coincide con ambiente del documento
(TEST) -> bloquea antes de llamar al firmador"`.

## 10. Adapter del firmador (`dte-signer.adapter.ts`)

No se modificó funcionalmente. Sigue siendo HTTP puro (fetch a `signerUrl`,
header `X-DTE-Signer-Key` si hay `apiKey`, timeout vía `AbortController`,
mapeo de respuesta `{status, body}` → `DteSignerResult`). No depende de
Prisma. Todos los tests de esta fase mockean la clase completa
(`vi.mock("../adapters/dte-signer.adapter", ...)`) — **cero llamadas de red
reales**.

## 11. Semántica de fallos — preservada

- Timeout / error de red / respuesta no-JSON / estructura inesperada /
  `status: "ERROR"` → `signerResult.ok === false` → el service mantiene
  `SCHEMA_VALIDATED`, incrementa `retry_count`, registra
  `DteTransmissionLog` con `operation_type: "SIGN"` y el error — nunca deja
  el documento en `SIGNED` tras un fallo. Cubierto por
  `sign-dte-document.service.runtime-write.test.ts` (casos de fallo genérico
  y timeout específico).
- Error de credenciales (`resolveDteSignerConfigForIssuer` no-ok) → bloquea
  ANTES de invocar el adapter — `signerAdapterSignSpy` nunca se llama.

## 12. Persistencia tras éxito

`db.$transaction([db.dteOutgoingDocument.update(...), db.dteTransmissionLog.create(...)])`
— mismo orden y misma forma que antes, ahora sobre `db`. La llamada de red
al firmador permanece FUERA de la transacción (se llama antes, su resultado
ya resuelto se persiste después) — sin cambios de diseño.

## 13. Support Session

`signDteDocumentAction` y `reopenRejectedDteForResignAction` ahora usan
`requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`
— para `SUPPORT_RUNTIME` (`context.readOnly === true`), esto lanza
`OperationalContextError("READ_ONLY", ...)` **antes** de resolver
`context.client`, antes de tocar el documento y antes de llamar al
firmador. Certificado por el test `"Support Session (READ_ONLY) bloquea ->
el firmador NUNCA se invoca (signer mock call count = 0)"`.

El runner F2-B2 (`support-dte-sign-runner.ts`/`support-dte-sign.action.ts`)
es una feature de soporte **deliberadamente distinta y preexistente** que sí
firma, pero está fuera del `RuntimeMode` certificado aquí: requiere
`requireSuperAdmin`, bloquea `PRODUCTION` explícitamente, exige
confirmación textual (`"SIGN SUPPORT DTE"`) + Safety Gate D0 + dry-run
previo, y solo opera sobre `LOCAL`/`TEST`/`SANDBOX`. No se tocó — se
documenta aquí para dejar explícito que no es una brecha del pipeline
RUNTIME_CLIENT.

## 14. Rol efectivo

Ambas actions migradas usan `context.effectiveUser.id`/`context.tenantId`/
`context.locationId` (ya resueltos por `requireOperationalContext`, que a su
vez usa el rol LIVE para RUNTIME_CLIENT desde VI-D2/ETAPA A) — nunca
`sessionUser.role`/`sessionUser.tenant_id` directamente para la lógica de
negocio posterior a la resolución de contexto.

## 15. Cross-tenant / cross-location

`sign-dte-document.service.ts` sigue filtrando `DteOutgoingDocument` por
`{id, tenant_id, location_id}` — un documento de otro tenant/location es
indistinguible de "no existe" (fail closed), certificado en
`sign-dte-document.service.runtime-write.test.ts`
("documento no encontrado en la runtime db (cross-tenant/location) ->
bloquea, signer nunca se invoca"). Lo mismo para `DteIssuerConfig` en el
nuevo paso 3b ("emisor no encontrado en la misma runtime DB ... -> bloquea
antes de llamar al firmador").

## 16. Censo de Prisma global (grafo alcanzable desde firma)

| Módulo | Clasificación |
|---|---|
| `sign-dte-document.service.ts` | RUNTIME_SAFE (con `db` explícito) — `OPTIONAL_DEFAULT_SAFE` sin `db` (cae a global, solo para callers PLATFORM_NATIVE no migrados) |
| `sign-dte-document.action.ts` | RUNTIME_SAFE |
| `dte-credential.service.ts` (`resolveDteSignerConfigForIssuer`, `resolveMhAuthCredentials`) | RUNTIME_SAFE cuando el caller pasa `client`; `OPTIONAL_DEFAULT_SAFE` sin `client` (ya certificado en VI-E4A/E2B) |
| `reopen-rejected-dte-for-resign.service.ts` / `.action.ts` | RUNTIME_SAFE |
| `reopen-signed-dte-for-resign.service.ts` | RUNTIME_SAFE si se invoca con `db`; `DEAD_CODE` a nivel de entry point (sin Server Action) |
| `create-and-transmit-credit-note.action.ts` (pasos 1-4) | RUNTIME_SAFE |
| `create-and-transmit-credit-note.action.ts` (paso 5, `transmitDteDocument`) | RUNTIME_UNSAFE si se alcanzara — **por eso queda fail-closed para RUNTIME_CLIENT**; para PLATFORM_NATIVE es `PLATFORM_NATIVE_DEFAULT` (deliberado, fuera de alcance) |
| `transmit-dte-document.service.ts`, `MhDteTransmissionAdapter`, auth MH | `PLATFORM_NATIVE_DEFAULT` / no tocado — fuera de alcance total (VI-E5B) |
| `dte-signer.adapter.ts` | GLOBAL_REFERENCE — no usa Prisma, HTTP puro |
| `support-dte-sign-runner.ts` / `support-dte-sign.action.ts` (F2-B2) | `CONTROL_PLANE_ONLY` — usa un `PrismaClient` dinámico propio (no el singleton global ni el runtime del tenant vía `requireOperationalContext`), ya blindado independientemente |
| `dte/dev/verify-*.ts` | DEAD_CODE a nivel productivo — scripts de desarrollo, no reachable desde ninguna Server Action/Route Handler |

**`RUNTIME_CLIENT_DTE_SIGNING_CAN_HIT_GLOBAL_PRISMA = NO`**
**`RUNTIME_CLIENT_DTE_SIGNING_CAN_FALLBACK_GLOBAL = NO`** (nunca se invoca
`signDteDocument`/`reopenRejectedDteForResign` sin `db` desde ningún entry
point RUNTIME_CLIENT — `requireOperationalContext` siempre resuelve
`context.client` antes de llamar al service).

## 17. Auditoría de secretos

No se encontró ninguna exposición nueva. El paso 3b nuevo solo selecciona
`environment` de `DteIssuerConfig` (`select: { environment: true }`) — no
toca `DteCredential.encrypted_payload` ni ningún campo sensible. Los logs
existentes (`console.info(summarizeDteSignerConfigForLog(...))`) ya
sanitizaban antes de esta fase y no se modificaron. Ningún test nuevo
incluye secretos ni JWS completos en sus fixtures (`"jws-signed-value"` es
un valor dummy de prueba).

## 18. Tests agregados/modificados

- `src/modules/commerce/dte/services/sign-dte-document.service.runtime-write.test.ts` (nuevo, 9 tests)
- `src/modules/commerce/dte/actions/sign-dte-document.action.test.ts` (reescrito, 1 → 6 tests)
- `src/modules/commerce/dte/actions/reopen-rejected-dte-for-resign.action.test.ts` (nuevo, 4 tests)
- `src/modules/commerce/dte/actions/create-and-transmit-credit-note.action.test.ts` (modificado, 5 → 6 tests)

## 19. Resultado de validación

- `npx vitest run`: **122 archivos, 760 tests, todos en verde** (antes 741; +19 tests de esta fase).
- `npx tsc --noEmit`: sin errores nuevos. El único error preexistente
  (`generate-nc-json.service.runtime-write.test.ts`, un mismatch de tipos en
  un mock de un test de VI-E4B) se confirmó presente también en HEAD antes
  de esta fase (`git stash` + `tsc --noEmit` reproduce el mismo error) — no
  se tocó ese archivo, fuera de alcance de VI-E5A.
- `npm run lint`: sin errores, solo warnings preexistentes no relacionados
  con los archivos de esta fase.
- `npm run build`: verde.
- `git diff --check`: sin problemas de whitespace.

## 20. Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`: sin cambios.** No se agregó ni modificó ningún modelo,
  campo, índice ni relación.
- **Migraciones: ninguna generada ni requerida.** Toda esta fase es
  puramente de código de aplicación (threading de un parámetro `db`
  explícito) — no hay `SCHEMA_CHANGE` ni `MIGRATION_REQUIRED`.
- **Base tocada:** ninguna base de datos real (local ni remota) fue escrita
  por este trabajo — todos los tests usan mocks de Prisma (`vi.mock`), no
  una conexión real a `DATABASE_URL` ni `DIRECT_URL`.
- **`DATABASE_URL` (local) / `DIRECT_URL` (remota):** sin cambios, sin
  necesidad de alinear — no hubo ninguna migración que aplicar en ninguna
  de las dos.
- **Comandos a ejecutar por el usuario:** ninguno relacionado con Prisma.
  Se recomienda únicamente validar visualmente el flujo de firma real
  (`/dashboard/sales` o `/dashboard/dte/outgoing` → "Firmar DTE") contra un
  firmador de desarrollo real, ya que ningún test de este repo hace esa
  llamada de red.

## 21. Pendientes explícitos para VI-E5B

- `transmit-dte-document.service.ts` / `MhDteTransmissionAdapter` / auth MH:
  migrar a `db` explícito con el mismo patrón, y decidir cómo destrabar
  `create-and-transmit-credit-note.action.ts` para RUNTIME_CLIENT una vez
  la transmisión sea runtime-safe.
  - `sign-dte-document.action.ts` estándar (fuera del flujo combinado NC05)
    ya queda listo para transmitirse por separado una vez exista una action
    de transmisión runtime-aware — hoy esa transmisión standalone (fuera del
    combinado) no tiene una Server Action propia expuesta a RUNTIME_CLIENT.
- `reopen-signed-dte-for-resign.service.ts` sigue sin una Server Action que
  lo invoque — si se decide exponerlo, debe seguir el mismo patrón
  `requireOperationalContext` + `db` ya usado por `reopen-rejected-dte-for-resign.action.ts`.
- Nivel intermedio tenant/organización de `DteCredential` (reservado, no
  implementado — ver `dte-credential.service.ts` comentarios de diseño).
