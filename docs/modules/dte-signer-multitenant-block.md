# SignerProfile por tenant/emisor/ambiente — Bloque de arquitectura

Fecha: 01/09/2026.
Estado: base técnica implementada. No se firmó, transmitió ni entregó
ningún DTE durante este bloque. No se tocó PRODUCTION.

## 1. Problema que resuelve

El firmador oficial de Hacienda no debe asumirse multi-certificado dentro
de una misma instancia. El patrón correcto para multiempresa/multi-NIT es
una instancia de firmador por certificado/ambiente (cliente A TEST,
cliente A PRODUCTION, cliente B TEST, cliente B PRODUCTION, ...). Antes de
este bloque, la única fuente de verdad era `DTE_SIGNER_URL_TEST` /
`DTE_SIGNER_URL_PRODUCTION` + `DTE_SIGNER_NIT` / `DTE_SIGNER_PASSWORD`
globales de proceso — suficiente con TrustMe como único cliente runtime,
pero no escalable a un segundo cliente en el mismo ambiente. Ver
docs/modules/dte-trustme-fse14-test-closure.md §8.1 y §9.1.

## 2. Decisión de modelo — sin tabla nueva

**No se creó `DteSignerProfile`.** Auditoría de `DteCredential` +
`DteCredentialPayload` (`dte-credential-encryption.ts`) mostró que el
modelo ya existía y ya estaba sin usar para este propósito:

- `DteCredential` ya es 1 registro por `issuer_config_id`
  (`credential_type = "MH_CREDENTIALS"`), cifrado AES-256-GCM con la
  utilidad central `src/lib/security/encryption.ts` (`PLATFORM_ENCRYPTION_KEY`).
- `DteCredentialPayload` ya tenía `signerUrl`, `signerNit`,
  `signerPrivateKeyPassword` — pensados exactamente para esto, pero
  ningún flujo de firma real los leía todavía.
- `issuer_config_id` ya desambigua el ambiente por diseño: `DteIssuerConfig`
  tiene `@@unique([tenant_id, location_id, environment])`, así que un
  emisor TEST y su contraparte PRODUCTION son filas — e `issuer_config_id`
  — distintos. No hace falta un campo `environment` adicional en el
  perfil del firmador: ya viene implícito en qué `issuer_config_id` se usa.

Se agregó únicamente `signerApiKey?: string` al payload — campo opcional
dentro del JSON cifrado existente, **sin migración** (no es columna nueva).

Esto cumple exactamente lo pedido en el encargo: *"Si `DteCredential` ya
tiene estructura para guardar credenciales del firmador por
`issuer_config_id`, reutilizarla."*

### Por qué no un nivel intermedio tenant/organización todavía

El diseño pedía un fallback opcional a nivel tenant/organización antes del
fallback global. No se implementó en este bloque porque:

- El único cliente runtime activo (TrustMe) ya tiene (o puede tener)
  `DteIssuerConfig` + `DteCredential` propios por ambiente — el nivel
  issuer_config_id ya lo resuelve sin ambigüedad.
- Agregar un nivel intermedio requeriría o bien una tabla nueva scoped a
  `PlatformOrganization` (que vive en el control plane, base distinta de
  donde vive `DteIssuerConfig`/`DteCredential` en cada runtime — no se
  puede modelar como FK real de Prisma entre bases) o bien un campo nuevo
  en el propio `DteIssuerConfig`/tabla runtime — ambas opciones son un
  cambio de schema real, que el encargo pedía evitar "salvo necesidad
  real".
- `resolveDteSignerConfigForIssuer` ya acepta `tenantId` en su firma (sin
  usarlo todavía) precisamente para no tener que tocar los callers cuando
  se decida implementar ese nivel.

## 3. Resolver nuevo — `resolveDteSignerConfigForIssuer`

Archivo: `src/modules/commerce/dte/services/dte-credential.service.ts`.

```ts
resolveDteSignerConfigForIssuer({
  issuerConfigId,  // string | null | undefined
  tenantId,        // reservado, no usado todavía
  environment,     // "TEST" | "PRODUCTION" — SIEMPRE el del documento
  client,          // PrismaClient opcional (Runtime Database Router)
})
```

Orden de resolución:

1. `DteCredential` activa de `issuer_config_id`
   (`credential_type = "MH_CREDENTIALS"`) con `signerNit` +
   `signerPrivateKeyPassword` utilizables.
   - Si además trae `signerUrl`, se construye el `DteSignerConfig` con esa
     URL + `signerApiKey` del payload (si no hay `signerApiKey` propio,
     cae al `DTE_SIGNER_API_KEY` global).
   - Si no trae `signerUrl`, la URL/apiKey/timeout se resuelven igual que
     el fallback global para ese mismo `environment` — el emisor puede
     tener NIT/password propios sin necesitar su propia URL de firmador.
2. *(Reservado, no implementado)* SignerProfile a nivel tenant/organización.
3. Fallback global: `resolveDteSignerConfig(environment)` +
   `DTE_SIGNER_NIT` / `DTE_SIGNER_PASSWORD` — comportamiento **idéntico**
   al que ya tenía `signDteDocument()` antes de este bloque.

Nunca cruza ambientes: `environment` es siempre el valor real del
documento que se firma, nunca UI. No lanza — devuelve unión discriminada
`{ ok: true, source, config, nit, passwordPri }` |
`{ ok: false, error }`. Loguea un único `console.info` con resumen seguro
(`summarizeDteSignerConfigForLog` en `dte-signer.config.ts`): origen,
host/ruta (sin querystring), si apiKey está configurada sí/no, timeoutMs —
nunca secrets, nunca `signed_jws`.

### Piezas nuevas en `dte-signer.config.ts`

- `buildDteSignerConfig(signerUrl, apiKey?)` — construye un
  `DteSignerConfig` desde una URL explícita (la de `DteCredential`), en
  vez de resolverla desde `DTE_SIGNER_URL_TEST/PRODUCTION`.
  `resolveDteSignerConfig(environment)` ahora se implementa internamente
  sobre esta función — mismo comportamiento externo, cero cambio de
  contrato (los 12 tests existentes de `dte-signer.config.test.ts` siguen
  verdes sin tocarlos).
- `summarizeDteSignerConfigForLog(config, source)` — string seguro para
  logs.

## 4. Compatibilidad y fallback

`sign-dte-document.service.ts` ahora resuelve firmador + credenciales con
`resolveDteSignerConfigForIssuer({ issuerConfigId: dteDoc.issuer_config_id,
environment: dteDoc.environment })` en un solo paso (antes: lectura directa
de `DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` + `resolveDteSignerConfig(environment)`
por separado). Si el documento no tiene `issuer_config_id`, o su
`DteCredential` no tiene `signerNit`/`signerPrivateKeyPassword`
utilizables, el comportamiento es **exactamente el de antes**: variables
globales. Ningún flujo existente sin `DteCredential` configurado cambia de
comportamiento.

`fse14-test-purchase-runner.ts` (`--step SIGN`) se migró al mismo resolver,
pasándole el `client` runtime (Runtime Database Router) — sigue firmando
**solo TEST** (`environment: "TEST"` hardcodeado, rechaza cualquier
documento cuyo `environment` real no sea `"TEST"`, igual que antes). No se
ejecutó ningún `--mode EXECUTE` durante este bloque.

`sign-contingency-event.service.ts`, `sign-invalidation-event.service.ts`,
`support-dte-sign-runner.ts`, `dte-production-preflight.service.ts` y los
scripts `health-check-dte-signer-test.ts` / dev de FEX11 **no se tocaron**
— siguen usando `resolveDteSignerConfig(environment)` global directamente.
Quedan como trabajo futuro si se decide migrarlos al resolver por emisor.

## 5. UI — completado lo mínimo, resto documentado

Ya existía una pantalla de administración para esto:
`/dashboard/settings/dte` → `DteCredentialFormDialog` (guarda vía
`upsertDteCredentialAction` → `upsertDteCredential`) — permite cargar
usuario/password MH + `signerUrl`/`signerNit`/`signerPrivateKeyPassword`
por `DteIssuerConfig`, ya con validación de que el `issuer_config_id`
pertenece al tenant/location de la sesión (`requireAdmin` +
`getEffectiveLocationId`). Solo faltaba el campo nuevo:

- Se agregó `signerApiKey` (opcional) al schema Zod, a la Server Action y
  al formulario — mismo patrón "en blanco = conservar valor actual" que
  el resto de campos, nunca se muestran secretos existentes.

**Límite importante, no resuelto en este bloque:** esta pantalla opera
sobre el Prisma Client **global** (base local/GYM), no sobre el Runtime
Database Router. Para un cliente runtime como TrustMe, esta UI no puede
escribir su `DteCredential` — esa base solo es alcanzable hoy vía
`withRuntimePrisma` (usado por los runners de soporte). Esto es
consistente con el hallazgo ya documentado en
docs/modules/dte-trustme-fse14-test-closure.md §8.2: la escritura
runtime-aware desde UI para clientes runtime sigue pendiente de diseño
completo (permisos propios, alcance `tenant`/`location` real contra la
base correcta). No se intentó resolver eso en este bloque.

## 6. Cómo registrar el SignerProfile de TrustMe (sin secrets)

Como TrustMe es un cliente runtime, la única vía disponible hoy para
guardar su `DteCredential` (con `signerUrl`/`signerNit`/
`signerPrivateKeyPassword`/`signerApiKey` por `issuer_config_id` TEST o
PRODUCTION) es directamente contra la base runtime — no hay UI runtime-
aware para esto todavía. Dos caminos, ninguno ejecutado en este bloque:

1. **Manual, vía cliente Postgres autorizado**: usar
   `encryptJsonPayload` (`src/lib/security/encryption.ts`) desde un script
   Node/tsx local, one-off, que nunca imprima el resultado en consola —
   solo lo inserte directamente con Prisma contra el runtime resuelto por
   `withRuntimePrisma`/`controlPlanePrisma` (mismo patrón que
   `fse14-test-purchase-runner.ts`). Requiere aprobación explícita antes
   de escribir nada.
2. **Esperar la UI runtime-aware de escritura** (pendiente de diseño,
   ver §5) y usar el mismo `DteCredentialFormDialog` ya existente una vez
   que pueda apuntar al runtime correcto.

No se creó ningún script de escritura de credenciales en este bloque —
solo la lectura (`resolveDteSignerConfigForIssuer`). Si se aprueba el
camino 1, se implementará como script separado, auditable, sin imprimir
ningún secreto.

## 7. Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`: sin cambios.** No se agregó ninguna tabla, columna
  ni migración. El único campo nuevo (`signerApiKey`) vive dentro de
  `DteCredential.encrypted_payload` (JSON cifrado ya existente como
  columna `Text`), no como columna SQL nueva.
- No se generó ninguna migración Prisma. No hay comando de migración que
  correr.
- `DATABASE_URL` (local) y `DIRECT_URL` (remota) no requieren ninguna
  acción — no hay drift posible porque no se tocó el schema.
- No se escribió ningún dato real (`DteCredential`, `DteIssuerConfig`,
  DTE alguno) durante este bloque, ni en local ni en runtime TrustMe.

## 8. Validación ejecutada

- `npx tsc --noEmit -p tsconfig.json` — sin errores.
- `npx eslint` sobre los 10 archivos tocados — sin errores.
- `npx vitest run src/modules/commerce/dte/config/dte-signer.config.test.ts`
  — 12/12 tests verdes, sin modificar el archivo de test (el refactor de
  `resolveDteSignerConfig` sobre `buildDteSignerConfig` es transparente).

## 9. Qué queda pendiente

1. Nivel intermedio tenant/organización (Tier 2) — diseño explícito de
   dónde vive (no puede ser FK real cross-database a
   `PlatformOrganization`).
2. Escritura runtime-aware de `DteCredential` para clientes runtime
   (TrustMe incluido) — hoy solo alcanzable por script/runner, no por UI.
3. Migrar `sign-contingency-event.service.ts`,
   `sign-invalidation-event.service.ts` y `support-dte-sign-runner.ts` al
   mismo resolver, si se decide que también deben ser issuer-aware.
4. Registrar realmente el `DteCredential` de TrustMe TEST/PRODUCTION
   (§6) — pendiente de aprobación explícita, ningún valor fue escrito en
   este bloque.
