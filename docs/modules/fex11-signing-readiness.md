# Factura de Exportación 11 — Criterio para firma controlada

> Microfase F3-C11. Documento de **análisis y decisión**. No se modificó `schema.prisma`, no se crearon migraciones, no se implementó firma, no se tocó UI, transmisión ni MariaDB. Basado en el estado real confirmado en F3-C10B (`docs/modules/fex11-enablement-checklist.md`, `generate-fex-json-pipeline.service.ts`, `sign-dte-document.service.ts`).

## 1. Resumen ejecutivo

FEX 11 ya genera y persiste JSON válido con datos reales locales: `generateAndPersistFexJsonForDte` (F3-C10B) construye `json_document`, lo persiste, lo valida contra el schema oficial MH vía AJV, y deja `dte_status = SCHEMA_VALIDATED` con `schema_validated_at` seteado — todo verificado contra PostgreSQL local con un `DteOutgoingDocument` tipo 11 real.

El siguiente paso técnico natural es firmar FEX 11 en ambiente TEST usando el firmador MH ya operativo para FE/CCFE/NC. Esa firma debe habilitarse de forma **controlada**: sin UI, sin transmisión y sin MariaDB. No debe abrirse transmisión todavía, y no debe abrirse producción bajo ninguna circunstancia.

Hallazgo relevante de esta auditoría: a diferencia de transmisión (`transmit-dte-document.service.ts`) y MariaDB (`build-external-dte-payload.service.ts`), que bloquean tipo 11 explícitamente con un `SUPPORTED_TYPE_CODES`/`SUPPORTED_TYPES` que no incluye `"11"`, el servicio de firma **`sign-dte-document.service.ts` no filtra por `dte_type_code` en absoluto**. Esto significa que, desde que F3-C10B permite que un documento FEX 11 llegue a `SCHEMA_VALIDATED`, el flujo de firma ya operativo (`signDteDocumentAction` → `signDteDocument`) podría firmarlo hoy sin ningún cambio de código, siempre que exista sesión `requireAdmin`, tenant/location coincidan y el firmador esté configurado. Esto no es una vulnerabilidad de firma en sí (el firmador solo firma, no transmite), pero sí es un gap de control de alcance: la firma de tipo 11 no está bloqueada por diseño, solo por ausencia de acceso desde UI/flujo normal.

## 2. Estado actual antes de firma

Confirmado en F3-C10B (`verify-fex11-generate-persist-local.ts`, ejecutado contra base local con datos reales `FEX11_TEST_*`):

- `DteOutgoingDocument` tipo 11 existe en base local (creado en F3-C8, reutilizado en F3-C10B).
- `json_document` se persiste (contiene `identificacion.tipoDte === "11"`, `numeroControl`, `codigoGeneracion` consistentes con el documento).
- `dte_status` llega a `SCHEMA_VALIDATED`.
- `schema_validated_at` se setea (no null).
- `signed_jws` sigue `null`.
- `mh_response` sigue `null`.
- `reception_stamp` sigue `null`.
- `retry_count` no cambia durante generación/validación.
- No hay transmisión: el script no importa `MhDteTransmissionAdapter`.
- No hay delivery externo: el script no importa `deliver-dte-to-external-db` ni `external-dte-mariadb.adapter`.

## 3. Flujo objetivo de firma controlada

```
DteOutgoingDocument tipo 11
→ estado SCHEMA_VALIDATED
→ json_document existente
→ llamar firmador (MhHttpDteSignerAdapter, ya operativo para FE/CCFE/NC)
→ guardar signed_jws
→ guardar signed_at
→ dte_status = SIGNED
→ NO transmitir
→ NO MariaDB
```

Este flujo reutiliza la infraestructura ya probada de `sign-dte-document.service.ts` — no requiere un firmador nuevo ni un adapter nuevo, solo una capa de control adicional específica para tipo 11 (ver Sección 9).

## 4. Revisión del flujo actual de firma FE/CCFE

1. **Action que firma FE/CCFE**: `src/modules/commerce/dte/actions/sign-dte-document.action.ts` — `signDteDocumentAction(dteDocumentId)`. Requiere `requireAdmin`, resuelve `tenant_id`/`location_id` desde sesión, nunca del input. No devuelve `signed_jws` al frontend, solo `ok`/`signedAt`.
2. **Service que firma**: `src/modules/commerce/dte/services/sign-dte-document.service.ts` — `signDteDocument(params)`. Es el único punto que muta `dte_status` a `SIGNED`.
3. **Adapter que llama al firmador**: `src/modules/commerce/dte/adapters/dte-signer.adapter.ts` — `MhHttpDteSignerAdapter`, hace `fetch` HTTP al firmador oficial MH (`svfe-api-firmador`), envía `{ nit, passwordPri, dteJson, activo }`, espera `{ status: "OK"|"ERROR", body }`.
4. **Estados que permite**: solo `dte_status === "SCHEMA_VALIDATED"`. Cualquier otro estado (`GENERATED`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `OBSERVED`, `INVALIDATED`, o cualquier estado no reconocido) es rechazado antes de llamar al firmador.
5. **Campos que exige**: `json_document` no nulo (se parsea si viene como string); tenant/location coincidentes con la sesión (`findFirst` con `where: { id, tenant_id, location_id }`).
6. **Variables de entorno que usa**: `DTE_SIGNER_NIT`, `DTE_SIGNER_PASSWORD` (leídas directo del service), `DTE_SIGNER_URL`, `DTE_SIGNER_TIMEOUT_MS` (vía `getDteSignerConfig()` en `dte-signer.config.ts`, con default `http://localhost:8113/firma/firmardocumento/` y timeout 10000ms si no están definidas).
7. **¿Filtra tipos DTE soportados?** **No.** `signDteDocument` no lee ni valida `dte_type_code` en ningún punto — ni en el `select` del `findFirst`, ni en las validaciones de negocio. Filtra únicamente por `dte_status`.
8. **¿Bloquea tipo 11 actualmente?** **No, explícitamente no.** No existe ningún `SUPPORTED_TYPE_CODES` ni verificación de tipo en este service (a diferencia de `transmit-dte-document.service.ts:55` y `build-external-dte-payload.service.ts:47,61`, que sí declaran un allowlist explícito). El único motivo por el que tipo 11 no se firma hoy es que, hasta F3-C10B, ningún documento tipo 11 llegaba a `SCHEMA_VALIDATED` por el flujo normal — con F3-C10B eso ya es posible.
9. **Qué habría que ampliar para permitir firma tipo 11 de forma controlada**: no hay que "ampliar" el service compartido — hay que **envolverlo** con una validación explícita de contexto (tipo, ambiente, origen dev-only) antes de invocar `signDteDocument`, para no depender de que nadie llame `signDteDocumentAction` desde la UI de ventas con un documento tipo 11 real por accidente. Ver Sección 9.
10. **Qué NO debe tocarse**: `sign-dte-document.service.ts`, `sign-dte-document.action.ts`, `dte-signer.adapter.ts`, `dte-signer.config.ts` no deben modificarse para F3-C12. El riesgo de tocar el helper compartido es romper firma FE/CCFE, que está operativa y cerrada.

## 5. Variables requeridas para firmador

El flujo actual de firma FE/CCFE ya depende de estas variables (sin imprimir valores):

- `DTE_SIGNER_URL`
- `DTE_SIGNER_NIT`
- `DTE_SIGNER_PASSWORD`
- `DTE_SIGNER_TIMEOUT_MS` (opcional; si no está definida, se usa 10000ms por defecto)

F3-C11 no leyó valores de estas variables ni de `.env`/`.env.local` — solo confirmó, por lectura de código, cuáles variables consume el flujo existente.

## 6. Requisitos para firmar FEX 11

Precondiciones obligatorias antes de invocar firma sobre un `DteOutgoingDocument` tipo 11:

1. `dte_type_code === "11"`.
2. `environment === "TEST"`.
3. `dte_status === "SCHEMA_VALIDATED"`.
4. `json_document` existe (no null).
5. `signed_jws` es `null`.
6. `signed_at` es `null`.
7. `mh_response` es `null`.
8. `reception_stamp` es `null`.
9. `sale_id` existe.
10. El documento pertenece al tenant/location activo o al tenant/location local de prueba (`FEX11_TEST_*`).
11. El documento no está `ACCEPTED`, `REJECTED`, `OBSERVED`, `INVALIDATED`, `SENT` ni `SIGNED` (no transmitido, no ya firmado).
12. El firmador (`DTE_SIGNER_URL`) está configurado y accesible.
13. No se ejecuta en producción (`NODE_ENV !== "production"`, `DATABASE_URL` apunta a localhost).
14. No se transmite después de firmar, bajo ninguna condición, dentro del mismo script/flujo.

## 7. Riesgos de firma

1. Firmar un JSON incorrecto aunque AJV haya pasado — AJV valida forma, no exactitud fiscal (los gaps de fórmula de `fex11-data-contract.md` §10 siguen sin confirmar: `descuento` vs `totalDescu`, `totalPagar` vs `montoTotalOperacion`).
2. Firmar con certificado/NIT equivocado si las variables de entorno del firmador apuntan a un ambiente distinto al esperado.
3. Firmar en ambiente incorrecto (TEST vs PROD) si no se valida `environment` antes de invocar el firmador.
4. Refirmar un documento ya firmado — `sign-dte-document.service.ts` ya bloquea esto vía `dte_status !== "SCHEMA_VALIDATED"`, pero un script nuevo dev-only debe repetir esa validación de forma independiente y explícita para tipo 11.
5. Confundir firma con transmisión — firmar no implica ni debe disparar transmisión; deben quedar como pasos manuales separados.
6. Dejar `signed_jws` persistido en base local de prueba de forma indefinida, generando un documento "firmado" de prueba que podría confundirse con un DTE real si no queda claramente marcado (`FEX11_TEST_*`).
7. Exponer `signed_jws` en logs o consola — el patrón ya usado en `sign-dte-document.service.ts` (no lo escribe en `DteTransmissionLog`, solo `{ status: "OK" }`) debe repetirse en cualquier script nuevo.
8. Permitir tipo 11 en UI antes de tiempo, aprovechando que la firma ya "funcionaría" técnicamente sin cambios de código (ver Sección 1).
9. Romper firma FE/CCFE si se modifica por error `sign-dte-document.service.ts`, `dte-signer.adapter.ts` o `dte-signer.config.ts` en vez de aislar la lógica de FEX 11 en una función nueva.

## 8. Criterio de habilitación

**GO** para una fase futura F3-C12 si:

- FEX 11 está `SCHEMA_VALIDATED` con datos reales locales (confirmado en F3-C10B).
- `json_document` existe.
- El firmador TEST está disponible (`checkHealth()` de `MhHttpDteSignerAdapter` responde OK, o al menos `DTE_SIGNER_URL` es alcanzable).
- Las variables del firmador están configuradas localmente (`DTE_SIGNER_URL`, `DTE_SIGNER_NIT`, `DTE_SIGNER_PASSWORD`).
- Se puede ejecutar un script dev-only con las mismas protecciones de ambiente ya usadas en `verify-fex11-generate-persist-local.ts` (bloqueo de producción, bloqueo de host remoto, flag explícito).
- La firma FE/CCFE no se rompe (no se modifica el service/adapter/config compartido).
- La transmisión sigue bloqueada (`SUPPORTED_TYPE_CODES` en `transmit-dte-document.service.ts` sin cambios).

**NO-GO** si:

- No hay firmador disponible.
- `json_document` de FEX 11 no existe.
- `dte_status` no es `SCHEMA_VALIDATED`.
- `environment` no es `TEST`.
- `signed_jws` ya existe.
- La prueba requeriría producción.
- La implementación exige tocar UI, transmisión o MariaDB.

## 9. Arquitectura recomendada para F3-C12

1. **Reutilizar el service core de firma existente** (`signDteDocument` en `sign-dte-document.service.ts`) sin modificarlo — ya es agnóstico de tipo DTE y ya implementa las reglas de estado, credenciales y logging correctas.
2. **No crear una función nueva de firma paralela** (`signFexDteDocument`) que duplique la lógica de `signDteDocument` — el service compartido ya sirve; lo que falta es una capa de **validación de contexto previa**, específica para tipo 11, que se ejecute antes de llamar a `signDteDocument` y que garantice las 14 precondiciones de la Sección 6 (en particular tipo, ambiente y marca `FEX11_TEST_*`) sin que ese guard viva dentro del service compartido ni afecte a FE/CCFE.
3. **Crear script dev-only**: `verify-fex11-sign-local.ts`, siguiendo el mismo patrón que `verify-fex11-generate-persist-local.ts` (F3-C10B).
4. El script debe:
   - exigir `FEX11_LOCAL_TEST=YES`;
   - exigir `DATABASE_URL` apuntando a `localhost`/`127.0.0.1` y sin indicadores remotos (mismo `assertLocalEnvironment` reutilizable);
   - bloquear `NODE_ENV=production`;
   - no imprimir `signed_jws` completo (solo confirmar longitud o prefijo corto, igual que el patrón de no loguear el JWS en `DteTransmissionLog`);
   - operar únicamente sobre el `DteOutgoingDocument` tipo 11 marcado `FEX11_TEST_*` (misma venta marcada `notes: "FEX11_TEST_SALE"` usada en F3-C8/F3-C10B);
   - dejar `dte_status = SIGNED` si la firma resulta OK, delegando en `signDteDocument`;
   - no transmitir bajo ninguna condición;
   - verificar que `signed_jws` existe tras la operación;
   - verificar que `signed_at` existe tras la operación;
   - verificar que `mh_response` y `reception_stamp` siguen `null` tras la operación.

## 10. Gates que NO deben abrirse en F3-C12

- No habilitar transmisión tipo 11.
- No habilitar UI para tipo 11.
- No habilitar MariaDB para tipo 11.
- No habilitar Support Session para FEX 11.
- No habilitar producción.
- No tocar invalidación.
- No tocar Notas de Crédito (NC).
- No tocar FSE 14.
- No tocar `createPendingDteForSale` salvo que resulte estrictamente necesario y quede justificado explícitamente en F3-C12.
- No tocar filtros del dashboard de DTE (`dte-outgoing-filters-bar.tsx`).

## 11. Checklist antes de implementar firma

```
[ ] F3-C10B pasó con datos reales.
[ ] DTE FEX 11 está SCHEMA_VALIDATED.
[ ] json_document existe.
[ ] signed_jws es null.
[ ] signed_at es null.
[ ] environment TEST.
[ ] Firmador local/TEST disponible.
[ ] DTE_SIGNER_URL configurado.
[ ] DTE_SIGNER_NIT configurado.
[ ] DTE_SIGNER_PASSWORD configurado.
[ ] No se imprimen secrets.
[ ] No se imprime signed_jws completo.
[ ] Transmisión sigue bloqueada.
[ ] UI sigue bloqueada.
[ ] MariaDB sigue bloqueado.
```

## 12. Pruebas requeridas para F3-C12

1. `npx prisma validate`.
2. `npx prisma generate`.
3. `npx tsc --noEmit`.
4. Fixture in-memory FEX 11 sigue pasando (`verify-fex11-json.fixture.ts`).
5. `verify-fex11-generate-persist-local.ts` sigue pasando.
6. Script de firma local (`verify-fex11-sign-local.ts`):
   - antes: `SCHEMA_VALIDATED`, `signed_jws` null;
   - después: `SIGNED`, `signed_jws` existe, `signed_at` existe;
   - `mh_response` null;
   - `reception_stamp` null;
   - sin transmisión.
7. Verificar que la firma de FE/CCFE no se rompió a nivel TypeScript ni de comportamiento (`sign-dte-document.service.ts` sin cambios).

## 13. Decisión final

**GO para F3-C12** solo como firma controlada local/TEST, sin transmisión, reutilizando `signDteDocument` mediante un guard de contexto dev-only para tipo 11.

**NO-GO para transmisión.**
**NO-GO para UI.**
**NO-GO para MariaDB.**
**NO-GO para producción.**

---

## Impacto en bases de datos y sincronización local/remota

- **Schema tocado**: ninguno. `prisma/schema.prisma` no fue modificado en esta microfase.
- **Migración generada**: ninguna.
- **Base aplicada**: ninguna — no se ejecutó `prisma migrate` ni `prisma db push` contra `DATABASE_URL` ni `DIRECT_URL`.
- **Alineación local/remoto**: sin cambios — no se vio afectada, ya que no hubo cambios de schema en esta microfase.
- **Pendiente**: F3-C11 es solo documentación/análisis; no requiere ninguna acción de sincronización de bases de datos.
