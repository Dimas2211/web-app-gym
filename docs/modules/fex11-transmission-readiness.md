# Factura de Exportación 11 — Criterio para transmisión controlada

> Microfase F3-C13. Documento de **análisis y decisión**. No se modificó `schema.prisma`, no se crearon migraciones, no se implementó transmisión, no se llamó al MH, no se tocó UI ni MariaDB. Basado en el estado real confirmado en F3-C12 (`docs/modules/fex11-signing-readiness.md`, `verify-fex11-sign-local.ts`, `sign-dte-document.service.ts`).

## 1. Resumen ejecutivo

FEX 11 ya genera, valida, persiste y firma correctamente en ambiente local/TEST: `generateAndPersistFexJsonForDte` (F3-C10B) deja `json_document` persistido y `dte_status = SCHEMA_VALIDATED`, y `verify-fex11-sign-local.ts` (F3-C12) confirmó contra base local real que `signDteDocument` firma ese documento y lo deja en `dte_status = SIGNED` con `signed_jws` y `signed_at` persistidos, sin `mh_response` ni `reception_stamp`.

El siguiente paso técnico natural es transmitir FEX 11 al MH en ambiente TEST, reutilizando la infraestructura de transmisión ya operativa para FE/CCFE/NC (`transmit-dte-document.service.ts`, `MhDteTransmissionAdapter`, `MhAuthAdapter`). Esa transmisión debe habilitarse de forma **controlada**: sin UI, sin MariaDB y sin producción. No debe abrirse transmisión pública todavía, y no debe abrirse producción bajo ninguna circunstancia.

Hallazgo relevante de esta auditoría: a diferencia de la firma (`sign-dte-document.service.ts`, que no filtra por `dte_type_code`), el flujo de transmisión **sí bloquea tipo 11 explícitamente**. `transmit-dte-document.service.ts:55` declara `const SUPPORTED_TYPE_CODES = new Set(["01", "03", "05"])` y `transmitDteDocument` lanza `TransmitDteBusinessError` si `dteDoc.dte_type_code` no está en ese set (líneas 134-138). Esto significa que, a diferencia de la firma (donde F3-C11 detectó un gap de control), la transmisión de tipo 11 ya está bloqueada por diseño en el service compartido, no solo por ausencia de acceso desde UI. Para habilitar transmisión controlada de FEX 11 sin tocar ese allowlist compartido, la Sección 9 recomienda una función/script separado que no dependa de `transmitDteDocument` tal cual, o que se le añada `"11"` únicamente si se acepta el riesgo documentado en la Sección 7.11.

## 2. Estado actual antes de transmisión

Confirmado en F3-C12 (`verify-fex11-sign-local.ts`, ejecutado contra base local con datos reales `FEX11_TEST_*`):

- `DteOutgoingDocument` tipo 11 existe en base local.
- `json_document` existe (persistido desde F3-C10B).
- `dte_status` llega a `SIGNED`.
- `schema_validated_at` existe (seteado en F3-C10B).
- `signed_jws` existe (no null, contenido no impreso en logs).
- `signed_at` existe (no null).
- `mh_response` sigue `null`.
- `reception_stamp` sigue `null`.
- No hay transmisión: el script no importa `MhDteTransmissionAdapter`.
- No hay delivery externo: no se importa `deliver-dte-to-external-db.service.ts` ni `external-dte-mariadb.adapter.ts`.
- UI sigue bloqueada: no se tocó ninguna ruta de `src/app/(dashboard)/**`.
- Firma pública tipo 11 sigue bloqueada en `sign-dte-document.action.ts` (marcada en F3-C11B — no se auditó de nuevo en esta fase por estar fuera de alcance documental).

## 3. Flujo objetivo de transmisión controlada

```
DteOutgoingDocument tipo 11
→ estado SIGNED
→ signed_jws existente
→ llamar auth MH TEST (MhAuthAdapter.getCachedToken)
→ llamar recepción MH TEST (MhDteTransmissionAdapter.transmit)
→ interpretar respuesta (mhEstado: PROCESADO | RECHAZADO | inesperado)
→ dte_status = ACCEPTED / OBSERVED / REJECTED según respuesta
→ guardar mh_response saneado (sin token, sin signed_jws)
→ guardar reception_stamp si aplica (selloRecibido)
→ guardar sent_at / accepted_at / observed_at / rejected_at según corresponda
→ crear DteTransmissionLog operation_type = "SEND"
→ NO MariaDB
→ NO UI pública
→ NO producción
```

Este flujo reutiliza la infraestructura ya probada de `transmit-dte-document.service.ts`, `MhAuthAdapter` y `MhDteTransmissionAdapter` — no requiere un adapter HTTP nuevo ni una lógica de interpretación de respuesta nueva, solo una capa de control adicional específica para tipo 11 (ver Sección 9), dado que el service compartido bloquea tipo 11 por diseño.

## 4. Revisión del flujo actual de transmisión FE/CCFE/NC

1. **Action que transmite FE/CCFE/NC**: `src/modules/commerce/dte/actions/transmit-dte-document.action.ts` — `transmitDteDocumentAction(dteDocumentId)`. Requiere `requireAdmin`, resuelve `tenant_id` y `location_id` desde sesión (`getEffectiveLocationId`), nunca del input. No devuelve `signed_jws` ni token al frontend, solo `dteStatus`/`mhEstado`/`descripcionMsg`/`selloRecibido` no sensibles.
2. **Service que transmite**: `src/modules/commerce/dte/services/transmit-dte-document.service.ts` — `transmitDteDocument(params)`. Es el único punto que llama al adapter de transmisión y muta `dte_status` a `ACCEPTED`/`OBSERVED`/`REJECTED`.
3. **Adapter que autentica contra MH**: `src/modules/commerce/dte/adapters/dte-auth.adapter.ts` — `MhAuthAdapter`, `POST /seguridad/auth`, cachea el token en memoria por ambiente (`tokenCache`, TTL configurable, se pierde en cold-start — aceptado para V1), nunca loguea password ni token completo.
4. **Adapter que envía a recepción MH**: `src/modules/commerce/dte/adapters/dte-transmission.adapter.ts` — `MhDteTransmissionAdapter`, `POST /fesv/recepciondte`, reintenta autenticación una sola vez si MH responde 401, nunca loguea `signed_jws` ni Authorization.
5. **Estados que permite**: solo `dte_status === "SIGNED"` (`transmit-dte-document.service.ts:118`). Cualquier otro estado es rechazado antes de llamar al adapter.
6. **Campos que exige**: `signed_jws` no nulo, `generation_code` no nulo, `control_number` no nulo (líneas 125-133); tenant/location coincidentes con la sesión (`findFirst` con `where: { id, tenant_id, location_id }`).
7. **Variables de entorno que usa**: `DTE_MH_USER`, `DTE_MH_PASSWORD` (vía `getDteMhConfig()`), `DTE_MH_AUTH_URL_TEST`/`DTE_MH_AUTH_URL_PROD`, `DTE_MH_RECEPTION_URL_TEST`/`DTE_MH_RECEPTION_URL_PROD`, `DTE_MH_TIMEOUT_MS`, `DTE_MH_TOKEN_CACHE_TTL_MS`, `DTE_ENVIRONMENT` (determina ambiente por defecto si el documento no lo trae explícito).
8. **¿Filtra tipos DTE soportados?** **Sí.** `SUPPORTED_TYPE_CODES = new Set(["01", "03", "05"])` en `transmit-dte-document.service.ts:55`.
9. **¿Bloquea tipo 11 actualmente?** **Sí, explícitamente.** La verificación `if (!SUPPORTED_TYPE_CODES.has(dteDoc.dte_type_code))` (línea 134) lanza `TransmitDteBusinessError` con mensaje `"Tipo DTE no soportado para transmisión: 11."` antes de construir el request o llamar al adapter.
10. **Qué habría que ampliar para permitir transmisión tipo 11 controlada**: no hay que modificar el allowlist compartido para una fase dev-only — el adapter de transmisión (`MhDteTransmissionAdapter.transmit`) y el de auth (`MhAuthAdapter`) son agnósticos de tipo DTE (reciben `dteTypeCode` como parámetro libre, no lo validan contra un set); solo `transmit-dte-document.service.ts` filtra. Un script dev-only puede invocar directamente `MhDteTransmissionAdapter` (bypaseando el service, no el adapter) para transmitir FEX 11 sin tocar `SUPPORTED_TYPE_CODES`, o bien crear una función de servicio paralela específica para FEX 11 que reutilice el adapter. Ver Sección 9.
11. **Qué NO debe tocarse**: `transmit-dte-document.service.ts`, `transmit-dte-document.action.ts`, `dte-transmission.adapter.ts`, `dte-auth.adapter.ts`, `dte-mh.config.ts` no deben modificarse para F3-C14 (en particular, no quitar ni ampliar `SUPPORTED_TYPE_CODES`). El riesgo de tocar el service/adapter compartido es romper transmisión FE/CCFE/NC, que está operativa y cerrada.

## 5. Variables requeridas para MH TEST

El flujo actual de transmisión FE/CCFE/NC ya depende de estas variables (sin imprimir valores):

- `DTE_MH_USER`
- `DTE_MH_PASSWORD`
- `DTE_MH_AUTH_URL_TEST` (opcional; si no está definida, se usa `https://apitest.dtes.mh.gob.sv/seguridad/auth` por defecto)
- `DTE_MH_RECEPTION_URL_TEST` (opcional; si no está definida, se usa `https://apitest.dtes.mh.gob.sv/fesv/recepciondte` por defecto)
- `DTE_MH_TIMEOUT_MS` (opcional; default 8000ms)
- `DTE_MH_TOKEN_CACHE_TTL_MS` (opcional; default 3 000 000ms / 50 min)
- `DTE_ENVIRONMENT` (determina ambiente por defecto si no se pasa explícito; debe resolver a `TEST` para esta fase)

F3-C13 no leyó valores de estas variables ni de `.env`/`.env.local` — solo confirmó, por lectura de código, cuáles variables consume el flujo existente.

## 6. Requisitos para transmitir FEX 11

Precondiciones obligatorias antes de invocar transmisión sobre un `DteOutgoingDocument` tipo 11:

1. `dte_type_code === "11"`.
2. `environment === "TEST"`.
3. `dte_status === "SIGNED"`.
4. `json_document` existe.
5. `signed_jws` existe.
6. `signed_at` existe.
7. `mh_response` es `null` o no contiene respuesta final aceptada.
8. `reception_stamp` es `null`.
9. `sale_id` existe.
10. El documento pertenece al tenant/location local de prueba usado en F3-C8/F3-C10B/F3-C12.
11. El documento está marcado como `FEX11_TEST_*` (venta con `notes: "FEX11_TEST_SALE"`) o pertenece inequívocamente a datos de prueba.
12. El documento no está `ACCEPTED`.
13. El documento no está `INVALIDATED`.
14. No se ejecuta en producción (`NODE_ENV !== "production"`, `DATABASE_URL` apunta a localhost).
15. Variables MH TEST configuradas (`DTE_MH_USER`, `DTE_MH_PASSWORD`, URLs TEST accesibles).
16. Transmisión pública sigue bloqueada para tipo 11 (`SUPPORTED_TYPE_CODES` sin cambios en `transmit-dte-document.service.ts`).
17. MariaDB sigue bloqueado (sin importar `deliver-dte-to-external-db.service.ts` ni `external-dte-mariadb.adapter.ts`).
18. UI sigue bloqueada (sin tocar `src/app/(dashboard)/**` ni `sale-dte-section.tsx`).

## 7. Riesgos de transmisión

1. Enviar un JSON fiscalmente incorrecto aunque AJV y firma hayan pasado — AJV valida forma, no exactitud fiscal (los gaps de fórmula de `fex11-data-contract.md` §10 siguen sin confirmar contra respuesta real de MH).
2. Rechazo MH por catálogos de país, incoterm, régimen o recinto fiscal mal mapeados en el builder FEX 11.
3. Rechazo MH por fórmulas de resumen (`totalDescu`, `montoTotalOperacion`, etc.) que difieran de lo que MH espera para exportación.
4. Rechazo MH por manejo de `noGravado` o tributo `C3` específico de exportación.
5. Transmitir en ambiente equivocado (TEST vs PROD) si `environment` del documento o `DTE_ENVIRONMENT` no se valida explícitamente antes de invocar el adapter.
6. Transmitir más de una vez el mismo documento — `transmit-dte-document.service.ts` ya exige `dte_status === "SIGNED"` y mueve el estado fuera de `SIGNED` tras un resultado fiscal, pero un script dev-only que bypasee el service (invocando el adapter directo, ver Sección 9) debe repetir esa validación de forma independiente.
7. Ensuciar el estado local del documento con `REJECTED`/`OBSERVED` de forma irreversible si no se documenta que es una prueba TEST y se necesita reiniciar el ciclo con un nuevo `DteOutgoingDocument`.
8. Confundir transmisión TEST con producción — reforzado por el guard `assertLocalEnvironment` ya usado en F3-C10B/F3-C12.
9. Abrir MariaDB antes de conocer la respuesta MH — el delivery externo debe seguir fuera de alcance hasta una fase posterior explícita.
10. Exponer token MH, credenciales o `signed_jws` en logs o consola — el patrón ya usado en `transmit-dte-document.service.ts` (guarda `mh_response` saneado sin `signed_jws` ni token) debe repetirse en cualquier script nuevo.
11. Romper transmisión FE/CCFE/NC si se modifica por error `transmit-dte-document.service.ts`, `dte-transmission.adapter.ts`, `dte-auth.adapter.ts` o `dte-mh.config.ts` en vez de aislar la lógica de FEX 11 en una función o script nuevo que reutilice los adapters sin tocar el allowlist compartido.
12. Permitir tipo 11 en `transmitDteDocumentAction` pública antes de tiempo, exponiendo transmisión real de exportación desde la UI de ventas sin las validaciones de contexto específicas de FEX 11.

## 8. Criterio de habilitación

**GO** para una fase futura F3-C14 si:

- FEX 11 está `SIGNED` con datos reales locales (confirmado en F3-C12).
- `signed_jws` existe.
- `environment` es `TEST`.
- MH TEST está configurado localmente (`DTE_MH_USER`, `DTE_MH_PASSWORD`, URLs TEST accesibles).
- Se puede ejecutar un script dev-only con protecciones locales equivalentes a `verify-fex11-sign-local.ts` (bloqueo de producción, bloqueo de host remoto, flags explícitos).
- Transmisión pública sigue bloqueada para tipo 11 (`SUPPORTED_TYPE_CODES` sin cambios).
- MariaDB sigue bloqueado.
- UI sigue bloqueada.
- No se requiere producción.

**NO-GO** si:

- No hay credenciales MH TEST.
- No hay `signed_jws`.
- `dte_status` no es `SIGNED`.
- `environment` no es `TEST`.
- El documento ya tiene `reception_stamp`.
- El documento ya está `ACCEPTED`.
- La prueba requiere producción.
- La implementación exige tocar UI o MariaDB.
- La implementación exige quitar guards públicos (`SUPPORTED_TYPE_CODES` en la action/service compartidos).

## 9. Arquitectura recomendada para F3-C14

1. **No abrir `transmitDteDocumentAction` pública para tipo 11 todavía.**
2. **Mantener `transmit-dte-document.service.ts` con `SUPPORTED_TYPE_CODES = new Set(["01", "03", "05"])` sin cambios** — no agregar `"11"` a ese set; el bloqueo actual es la única barrera que impide que la UI de ventas transmita FEX 11 hoy.
3. **Reutilizar los adapters ya operativos** (`MhAuthAdapter`, `MhDteTransmissionAdapter`) desde un script dev-only controlado, dado que ambos son agnósticos de tipo DTE y no requieren modificación.
4. **Preferir extraer o crear una función controlada específica para FEX 11** (por ejemplo, un helper local dentro del propio script dev-only, no un service nuevo en `services/`) si se necesita reproducir la lógica de interpretación de respuesta (`determineFinalStatus`, sanitización de `mh_response`) sin importar el service compartido — esto evita depender de `transmitDteDocument` (que rechazaría tipo 11 por el allowlist) sin tener que tocar ese allowlist.
5. **Crear script dev-only**: `src/modules/commerce/dte/dev/verify-fex11-transmit-local.ts`.
6. El script debe:
   - exigir `FEX11_LOCAL_TEST=YES`;
   - exigir `FEX11_TRANSMIT_TEST=YES`;
   - exigir `DATABASE_URL` apuntando a `localhost`/`127.0.0.1` sin indicadores remotos (mismo `assertLocalEnvironment` reutilizable de F3-C12);
   - bloquear `NODE_ENV=production`;
   - operar únicamente sobre el `DteOutgoingDocument` tipo 11 marcado `FEX11_TEST_*` en `dte_status = SIGNED`;
   - no imprimir el token MH;
   - no imprimir `signed_jws` completo (solo longitud o presencia, igual que `verify-fex11-sign-local.ts`);
   - no llamar MariaDB;
   - actualizar `dte_status`, `mh_response` (saneado) y `reception_stamp` según la respuesta MH TEST real, con la misma lógica de `determineFinalStatus` (PROCESADO → ACCEPTED/OBSERVED, RECHAZADO → REJECTED, inesperado → mantiene SIGNED);
   - registrar `DteTransmissionLog` con `operation_type: "SEND"`, igual que el service compartido;
   - imprimir un resumen seguro (ids, estados, sin secretos).

## 10. Gates que NO deben abrirse en F3-C14

- No habilitar transmisión pública tipo 11 (`transmitDteDocumentAction` / UI de ventas).
- No habilitar UI.
- No habilitar MariaDB.
- No habilitar Support Session.
- No habilitar producción.
- No tocar invalidación.
- No tocar Notas de Crédito (NC).
- No tocar FSE 14.
- No tocar filtros del dashboard (`dte-outgoing-filters-bar.tsx`).
- No permitir transmisión automática desde ventas.

## 11. Checklist antes de implementar transmisión

```
[ ] F3-C12 pasó con datos reales.
[ ] DTE FEX 11 está SIGNED.
[ ] signed_jws existe.
[ ] signed_at existe.
[ ] environment TEST.
[ ] mh_response null.
[ ] reception_stamp null.
[ ] MH TEST configurado.
[ ] DTE_MH_USER configurado.
[ ] DTE_MH_PASSWORD configurado.
[ ] DTE_MH_AUTH_URL_TEST configurado o default confirmado.
[ ] DTE_MH_RECEPTION_URL_TEST configurado o default confirmado.
[ ] No se imprimen secrets.
[ ] No se imprime signed_jws completo.
[ ] UI sigue bloqueada.
[ ] MariaDB sigue bloqueado.
[ ] Producción sigue bloqueada.
```

## 12. Pruebas requeridas para F3-C14

1. `npx prisma validate`.
2. `npx prisma generate`.
3. `npx tsc --noEmit`.
4. Fixture in-memory FEX 11 sigue pasando (`verify-fex11-json.fixture.ts`).
5. `verify-fex11-generate-persist-local.ts` sigue pasando si se necesita resetear a `SCHEMA_VALIDATED`.
6. `verify-fex11-sign-local.ts` sigue pasando si se necesita dejarlo `SIGNED`.
7. Script de transmisión local (`verify-fex11-transmit-local.ts`):
   - antes: `SIGNED`, `signed_jws` existe, `reception_stamp` null;
   - después: `ACCEPTED`/`OBSERVED`/`REJECTED` según MH;
   - `mh_response` persistido y saneado;
   - `reception_stamp` persistido si MH lo devuelve;
   - `signed_jws` no se imprime;
   - sin MariaDB;
   - sin producción.
8. Verificar que FE/CCFE/NC no se rompieron a nivel TypeScript ni de comportamiento (`transmit-dte-document.service.ts`, `dte-transmission.adapter.ts`, `dte-auth.adapter.ts` sin cambios).

## 13. Decisión final

**GO para F3-C14** solo como transmisión controlada local/TEST, sin MariaDB y sin UI, reutilizando `MhAuthAdapter`/`MhDteTransmissionAdapter` mediante un script dev-only para tipo 11, sin modificar `SUPPORTED_TYPE_CODES` en el service compartido.

**NO-GO para transmisión pública.**
**NO-GO para UI.**
**NO-GO para MariaDB.**
**NO-GO para producción.**

---

## Impacto en bases de datos y sincronización local/remota

- **Schema tocado**: ninguno. `prisma/schema.prisma` no fue modificado en esta microfase.
- **Migración generada**: ninguna.
- **Base aplicada**: ninguna — no se ejecutó `prisma migrate` ni `prisma db push` contra `DATABASE_URL` ni `DIRECT_URL`.
- **Alineación local/remoto**: sin cambios — no se vio afectada, ya que no hubo cambios de schema en esta microfase.
- **Pendiente**: F3-C13 es solo documentación/análisis; no requiere ninguna acción de sincronización de bases de datos.
