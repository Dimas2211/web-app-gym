# FASE VI-E2B — DTE fiscal foundation (issuer config + credentials + correlativos)

Segundo paso de la migración del subsistema fiscal DTE hacia el contrato
`RUNTIME_CLIENT` (ver VI-C/VI-D). VI-E2A cerró la frontera de LECTURA
(`getDteApiContext`, GET de `issuer-config`/`outgoing`). Esta fase cierra la
capa de **configuración base**: `DteIssuerConfig`, `DteCredential` y el
servicio de `DteCorrelative` (status + baseline admin).

**Fuera de alcance, explícitamente**: creación de `DteOutgoingDocument`
(`dte-outgoing.service.ts`, `create-credit-note-dte.service.ts`,
`export-sale.service.ts`), builders FE01/CCFE03/FEX11/FSE14/NC05, firma
(`sign-dte-document.service.ts`), transmisión, invalidación, contingencia,
metering y delivery a MariaDB. Todo eso sigue exactamente igual que antes de
esta fase — Prisma global, sin cambios de comportamiento.

## Source of truth

- Control Plane (Prisma global) sigue siendo la fuente de verdad de
  `Organization`, `PlatformPlan`, `Modules`, `Entitlements`, `Overrides`,
  `Database Profiles` y capacidades comerciales.
- La runtime DB del tenant es la fuente de verdad de `DteIssuerConfig`,
  `DteCredential` y `DteCorrelative` — nunca se copian datos comerciales a
  la runtime DB, ni se leen `PlatformPlan`/módulos/entitlements desde ahí.

## DB boundary

Los tres servicios (`dte-issuer-config.service.ts`,
`dte-credential.service.ts`, `dte-correlative.service.ts`) aceptan ahora un
parámetro `db: PrismaClient = prisma` en cada export que toca la DB. El
default preserva el comportamiento PLATFORM_NATIVE exacto (Prisma global,
sin cambios); un caller RUNTIME_CLIENT o SUPPORT_RUNTIME debe pasar
explícitamente `context.client`.

Los 6 Server Actions de escritura del dominio usan
`requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`
— el helper genérico ya certificado en VI-D2, no una capa DTE-específica
nueva. Resuelve en una sola llamada: selección de DB efectiva, tenant/
location, bloqueo de escritura bajo Support Session, rol LIVE, y el gate
comercial `fiscal.dte`. Las dos rutas API de escritura
(`POST /api/dte/issuer-config`, `PATCH /api/dte/issuer-config/:id`)
reutilizan `getDteApiContext` (el helper DTE-específico ya existente desde
VI-E2A) — se le añadió `readOnly: boolean` al contrato de retorno.

## Environment semantics

`DteCredential` no tiene `tenant_id`/`location_id`/`environment` propios —
solo `issuer_config_id` (FK a `DteIssuerConfig`, que sí tiene
`environment`). El aislamiento TEST/PRODUCTION es estructural: una
credencial pertenece a exactamente un issuer, y ese issuer tiene
exactamente un ambiente. No existe combinación posible de "credencial TEST
colgada de un issuer PRODUCTION" a nivel de schema — no se agregó
validación redundante.

## Support behavior

`SUPPORT_RUNTIME` sigue siendo solo lectura para todo este dominio: los 6
Server Actions y las 2 rutas API de escritura devuelven 403 con
`RUNTIME_READONLY_MESSAGE` antes de tocar la DB. La única excepción DTE
conocida (`DELIVER_EXTERNAL`, en `require-runtime-dte-write-access.ts`) no
se tocó ni se extendió.

## Residual global paths

- `getActiveDteIssuerConfig` (query) — runtime-capable, sin callers
  productivos hoy (código muerto, clasificado `DEAD_CODE` en el censo).
- `getFseCorrelativeStatusForPurchase` (query) — runtime-capable, pero su
  único caller real (`purchases/[id]/page.tsx`) sigue sin migrar porque
  todo el módulo `purchases` está cerrado y fuera de alcance de esta fase
  (`getPurchaseById` tampoco es runtime-aware). Migrar ese caller
  aisladamente habría dejado la página con lecturas mixtas
  (compra desde Prisma global + estado de correlativo desde runtime) — se
  prefirió dejar ambas en Prisma global hasta que `purchases` se migre
  como unidad.
- `align-dte-correlative.action.ts` (Platform Admin, resuelve `tenant_id`
  vía `PlatformOrganization`) y `get-dte-correlative-alignment-panel-data.ts`
  — herramientas cross-tenant de Platform Admin, intencionalmente fuera de
  alcance (no son RUNTIME_CLIENT).
- `reserveDteControlNumber` y todos sus callers (creación real de DTE) —
  fuera de alcance por diseño, ver arriba.

## Siguiente fase

VI-E3/VI-E4: migrar `dte-outgoing.service.ts` y el resto del pipeline de
creación/firma/transmisión de DTE a runtime DB, apoyándose en esta
foundation (issuer config + credenciales + correlativos ya runtime-capable).
