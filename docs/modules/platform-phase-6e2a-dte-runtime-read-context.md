# FASE VI-E2A — DTE runtime context + read boundary

## Objetivo

Cerrar el mismo hallazgo crítico ya resuelto en VI-D6 para Sales/Purchases,
pero para el boundary de LECTURA fiscal DTE: `getDteApiContext()` no pasaba
`user` a `resolveEffectiveApiContext(base, user?)`, por lo que una identidad
`RUNTIME_CLIENT` caía silenciosamente al branch `PLATFORM_NATIVE` (Prisma
global) en vez de resolverse vía `requireRuntimeOrganizationContext`
(fail closed).

Alcance **estrictamente LECTURA**. No se tocó: creación DTE, builders
FE/CCFE/FEX/FSE/NC, issuer writes, credentials writes, correlatives writes,
signing, transmission, MH, reconciliation writes, invalidation, contingency,
metering, MariaDB delivery.

## Causa raíz

`src/app/api/dte/dte-api-context.ts` llamaba:

```ts
resolveEffectiveApiContext({ tenantId: tenant_id, locationId: baseLocationId })
```

Sin el segundo argumento `user`. `resolveEffectiveApiContext` solo reconoce
`RUNTIME_CLIENT` cuando recibe `user.auth_scope === "RUNTIME_CLIENT"` — sin
`user`, siempre resuelve `PLATFORM_NATIVE` (Prisma global), incluso para una
sesión runtime real.

## Cambio aplicado

`src/app/api/dte/dte-api-context.ts`:

1. `user = session.user as SessionUser` (antes: `session?.user` sin castear).
2. `resolveEffectiveApiContext({ tenantId, locationId: baseLocationId }, user)`
   — `user` se pasa siempre, nunca se omite.
3. Rechequeo de `getCapabilities(context.effectiveRole as UserRole).canManageStaff`
   **después** de resolver el contexto — para `RUNTIME_CLIENT`,
   `context.effectiveRole` es el rol LIVE revalidado contra `runtimeDb`, no
   el rol congelado en el JWT (hasta 8h de antigüedad). El chequeo original
   contra `user.role` (JWT) se conserva antes de resolver contexto — el
   rechequeo posterior es redundante para PLATFORM_NATIVE/SUPPORT_RUNTIME
   pero cierra el gap real para RUNTIME_CLIENT.

Patrón idéntico, línea por línea, al ya certificado en
`src/app/api/purchases/purchase-api-context.ts` y
`src/app/api/sales/sale-api-context.ts` (VI-D6) — no se inventó un router
nuevo.

## Comportamiento por modo

- **PLATFORM_NATIVE**: sin cambios — `context.client` resuelve a Prisma
  global, `context.tenantId`/`locationId` vienen del JWT/cookie de location
  activa, exactamente como antes.
- **SUPPORT_RUNTIME**: sin cambios — Support Session ("Operar como
  cliente") sigue resolviendo el runtime DB seleccionado, `readOnly=true`.
  La excepción `DELIVER_EXTERNAL` (fuera de esta fase) no se tocó.
  `require-runtime-dte-write-access.ts` no se tocó.
- **RUNTIME_CLIENT**: ahora resuelve vía `requireRuntimeOrganizationContext`
  — `context.client` = runtime Prisma de su propia organización,
  `context.tenantId`/`locationId` revalidados contra `runtimeDb` (nunca el
  valor crudo del JWT), `context.effectiveRole` = rol LIVE. Fail closed: si
  la organización es inválida, el perfil runtime no existe, el usuario
  runtime no existe/está inactivo, o hay tenant/location mismatch,
  `requireRuntimeOrganizationContext` lanza — nunca degrada a Prisma
  global/Control Plane.

## Las 4 rutas GET

`issuer-config` GET, `outgoing/[id]` GET, `outgoing/[id]/logs` GET,
`outgoing/by-sale/[saleId]` GET — **no requirieron cambios propios**. Los
cuatro ya consumían `ctx.client`/`ctx.tenant_id`/`ctx.location_id` de forma
genérica (nunca `import { prisma }` directo), así que corrigiendo
únicamente el contexto compartido, los cuatro quedan runtime-safe sin tocar
sus archivos.

## Ownership / aislamiento cross-tenant

Las queries que consumen esos 4 GETs ya filtraban por `id + tenant_id`
(nunca solo `id`):

- `get-dte-outgoing-document-by-id.ts` — `findFirst({ where: { id, tenant_id } })`.
- `get-dte-outgoing-detail-by-id.ts` — scoping `tenantId + locationId`.
- `list-dte-outgoing-documents-by-sale.ts` — scoping `tenant_id + location_id`.
- `list-dte-issuer-configs.ts` — scoping `tenant_id + location_id`.

`outgoing/[id]/logs` además valida explícitamente
`doc.location_id !== ctx.location_id` → 403 antes de listar logs. Un
documento de tenant B consultado desde runtime A resuelve `null`/404, sin
fuga — certificado con test dedicado
(`get-dte-outgoing-document-by-id.test.ts`).

## Tests nuevos

- `src/app/api/dte/dte-api-context.test.ts` (7 casos): propagación de
  `user`, `context.client` es el runtime fake client (no Prisma global),
  tenant efectivo proviene del runtime context (no del JWT crudo),
  rechequeo de rol LIVE deniega con rol degradado, PLATFORM_NATIVE
  preservado, SUPPORT_RUNTIME usa runtime client + `readOnly=true`, fail
  closed sin location resuelta (409, sin fallback global).
- `src/modules/commerce/dte/queries/get-dte-outgoing-document-by-id.test.ts`
  (2 casos): tenant A no puede leer documento de tenant B; tenant B sí lee
  el suyo.

## Validación

- `npx vitest run` — **645/645 PASS** (antes 636; +9 de esta fase).
- `npx tsc --noEmit` — limpio.
- `npm run lint` — sin errores nuevos (warnings preexistentes en archivos
  no tocados por esta fase).
- `npm run build` — PASS.

## Impacto en bases de datos y sincronización local/remota

- **Schema**: sin cambios en `schema.prisma`.
- **Migraciones**: ninguna nueva generada.
- **Base tocada**: ninguna — el cambio es exclusivamente de código
  TypeScript (resolución de contexto en Route Handlers), sin queries DDL.
- **Local/remoto**: no aplica desincronización — no hay migración que
  aplicar en ningún entorno.
- **Comandos pendientes para el usuario**: ninguno relacionado a Prisma.

## Explícitamente NO declarado en esta fase

`DTE_CREATION_RUNTIME_READY = NO`, `DTE_ISSUER_WRITES_RUNTIME_READY = NO`,
`DTE_CREDENTIAL_WRITES_RUNTIME_READY = NO`,
`DTE_CORRELATIVES_RUNTIME_READY = NO`, `DTE_SIGNING_RUNTIME_READY = NO`,
`DTE_TRANSMISSION_RUNTIME_READY = NO`. El `DTE_RUNTIME_OPERATIONAL_LAYER`
completo **no** queda cerrado — solo el boundary de lectura.

## Pendiente / próxima fase (VI-E2B+)

- Migrar creación/generación de DTE (builders FE/CCFE/FEX/FSE/NC) al
  contrato runtime.
- Migrar issuer config writes, credentials, correlativos.
- Migrar signing/transmission/MH/reconciliation writes/invalidation/
  contingency/metering/MariaDB delivery.
