# FASE IV-B.1 — MH DTE Query + Reconciliation Core

Núcleo reutilizable de consulta/reconciliación MH para DTE inciertos
(`dte_status=SIGNED` con resultado real desconocido tras timeout/error
técnico). Sin UI, sin scheduler — ver `docs/modules/platform-phase-4-dte-monthly-metering.md`
para el motor de metering sobre el que esto se apoya.

## HECHO MH (fuente: `manual-tecnico-firma-transmision.md` §8, más el
Catálogo oficial "Sistema de Transmisión" v1.2 10/2025 — `database/catalogs/`)

```
TEST: https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/
PROD: https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/
POST

Body: nitEmisor, tdte, codigoGeneracion

Response: version, ambiente, versionApp, estado, codigoGeneracion,
          selloRecibido, fhProcesamiento, clasificaMsg, codigoMsg,
          descripcionMsg, observaciones

Éxito: HTTP 200, estado=PROCESADO, codigoMsg=001, descripcionMsg=RECIBIDO, selloRecibido presente.
Error: HTTP 400, estado=RECHAZADO, selloRecibido=null, codigoMsg=ERROR_CODIGO, descripcionMsg=ERROR_DESCRIPCION.
```

## NO DOCUMENTADO

Ningún documento oficial disponible en este repositorio (manual, ni el
Catálogo CAT-001..CAT-032 v1.2) define un `codigoMsg`/`estado` inequívoco
para "codigoGeneracion no encontrado/no recibido". `RECHAZADO` de
`consultadte` **no** se interpreta como evidencia de que el DTE original
fue fiscalmente rechazado ni de que nunca fue recibido.

## POLÍTICA ZOLVI (fail-closed)

Solo `estado=PROCESADO` con `codigoGeneracion`/`ambiente` consistentes y
`selloRecibido` no vacío se considera resultado conclusivo
(`QUERY_PROCESSED`). Todo lo demás — `RECHAZADO`, error técnico,
inconsistencia, o la categoría reservada `QUERY_NOT_FOUND` (sin ningún
mapping activo hoy) — mantiene el documento en `SIGNED` y el ledger en
`PENDING`. Nunca se libera cupo por una consulta no conclusiva.

`PROCESADO` se clasifica `OBSERVED` solo con evidencia positiva real:
`codigoMsg==="002"`, o `descripcionMsg` contiene "observaci", o
`hasMeaningfulMhObservations(observaciones)` — un array como `["", ""]`
(ejemplo oficial "Sin Observaciones") **no** cuenta como observación real.

**Hotfix aplicado en FASE IV-B.3**: el pipeline SEND
(`transmit-dte-document.service.ts`, `determineFinalStatus`, ahora
exportado) usaba `Array.isArray(observaciones) && observaciones.length > 0`,
el mismo criterio defectuoso ante `["", ""]`. Corregido para reutilizar
`isMhProcessedObserved` — mismo helper y misma semántica que
`dte-reconciliation.service.ts`. Sin cambios en la API pública del
service (`transmitDteDocument`/`TransmitDteDocumentResult` intactos).
Regresión: `transmit-dte-document.service.determine-final-status.test.ts`
(7 tests).

## `fhProcesamiento`

Se conserva **RAW** dentro de `mh_response`/`DteTransmissionLog.response_body`.
No se convierte a `accepted_at`/`observed_at` en esta fase — el Manual
documenta el formato (`dd/MM/yyyy HH:mm:ss`) pero no la zona horaria
contractual del string, y `new Date(year, month, ...)` depende de la
timezone del proceso. `accepted_at`/`observed_at` usan `now` de la
reconciliación — misma semántica que el pipeline SEND actual. Existe un
parser (`dte-mh-fh-procesamiento.utils.ts`) solo como utilidad testeada
para diagnóstico futuro — no se usa para persistir timestamps fiscales.

## `sent_at`

Nunca se escribe con la hora de la consulta (una consulta no es un
envío). Si ya existe, se preserva. Si es `null`, se busca el primer
`DteTransmissionLog(operation_type="SEND")` por `created_at asc` y se usa
esa fecha como mejor evidencia interna disponible. Si no hay ningún SEND
previo, permanece `null`.

## Modelo de datos

Sin cambios de schema. `DteTransmissionLog.operation_type` ya es `String`
(no enum) — `"QUERY"` no requiere migración.

## FASE IV-B.2 — Caracterización empírica real (09/09/2026)

Dos llamadas reales a `MhDteQueryAdapter.query()` contra MH TEST
(nunca `reconcileDteWithMh`, nunca escritura en ninguna DB):

**Caso 1 — DTE TEST real existente** (`generation_code=A5C70414-49B4-4F88-80DF-8B66221FA645`,
`dte_type_code=14`, `dte_status` local ya `ACCEPTED`):

```
httpStatus = 202   (el Manual documenta 200 como ejemplo de éxito — MH TEST devolvió 202)
estado = PROCESADO   ambiente = "00"
codigoMsg = "001"   descripcionMsg = "RECIBIDO"
observaciones = []
selloRecibido == reception_stamp ya almacenado en DB (idéntico byte a byte)
fhProcesamiento (raw) = "01/09/2026 01:52:08"
```

Los 11 campos documentados por el Manual llegaron todos presentes. El
adapter clasificó correctamente `QUERY_PROCESSED`, y `isMhProcessedObserved`
habría clasificado ACCEPTED — coincide con el estado real almacenado.

## Hallazgo empírico MH TEST — 09/09/2026 — `codigoMsg="999"`

**Caso 2 — UUID de `codigoGeneracion` inexistente** (generado al azar,
confirmado `count=0` en `DteOutgoingDocument` antes de consultar):

```
HTTP 400
estado = null                (no "RECHAZADO" — distinto del ejemplo genérico de error del Manual)
codigoGeneracion = null
selloRecibido = null
clasificaMsg = null
codigoMsg = "999"
descripcionMsg = "No se encontro ningun registro que coincida"
```

**Advertencia explícita — esto NO es un contrato oficial**: ni el Manual
Técnico ni el Catálogo oficial (v1.2, 10/2025) disponibles en este
repositorio documentan `codigoMsg="999"` en ninguna parte. Es evidencia
de **una sola muestra**, contra MH TEST, en una fecha puntual. Aunque el
texto literal (`"No se encontro ningun registro que coincida"`, `estado=null`)
es una señal más clara de lo esperado, y se aleja estructuralmente del
`RECHAZADO` documentado, **no se activa ninguna automatización sobre
esta base**:

- `QUERY_NOT_FOUND` sigue **sin ningún trigger en código** — sigue
  siendo la categoría reservada de `dte-query.types.ts`, sin mapping.
- El adapter sigue devolviendo `QUERY_REJECTED_OR_ERROR` (categoría
  no conclusiva) para este caso — igual que para cualquier otro
  `estado` distinto de `PROCESADO`/`RECHAZADO`.
- Nunca se libera cupo (`RELEASED`) automáticamente por este código.
- Antes de considerar esto una base contractual haría falta repetir la
  prueba en otro momento y con otro tipo de DTE — una muestra no
  sustituye documentación oficial ni un contrato de la Administración
  Tributaria.

## Gap pendiente para reconciliación empírica

La señal de "no encontrado" (`codigoMsg="999"`) es una candidata fuerte
para una futura activación de `QUERY_NOT_FOUND`, pero permanece **fuera
de alcance** hasta contar con evidencia oficial o empírica repetida y
aprobada explícitamente — ver advertencia arriba.

## FASE IV-B.3 — Certificación real de `reconcileDteWithMh` (09/09/2026)

**Guard de escritura obligatorio** para cualquier certificación con
writes reales: abortar si el `runtimeDb` de escritura no contiene
`localhost`/`127.0.0.1`, contiene `supabase`, o no apunta exactamente a
`TrustmeDB`. Nunca escribir en los proyectos Supabase de Control Plane
(`nygdqnlzoalmhrqwijjn`) ni del runtime remoto TrustMe (`vkoywmzlgygypaddxjtn`).
Verificado: `.env` (`DATABASE_URL`/`DIRECT_URL`) local apunta exactamente
a `postgresql://...@localhost:5432/TrustmeDB` — guard satisfecho.

**ETAPA E — chequeo read-only de credencial TEST local**: la local
TrustmeDB tiene un `DteIssuerConfig` `environment=TEST` (`is_active=false`)
pero **cero filas `DteCredential`** asociadas — ninguna credencial TEST
funcional local. Por regla explícita de esta fase (no copiar credenciales
de producción/Supabase, no pedir password al usuario, no workaround
inseguro), la certificación real contra MH TEST usando
`reconcileDteWithMh` **se detuvo aquí**: `LOCAL_REAL_RECONCILIATION_BLOCKED=YES`.
Las ETAPAS F–J (fixture TEST + reconciliación real + verificación +
idempotencia + cleanup) no se ejecutaron.

**ETAPA K — certificación de la rama PRODUCTION (sin bloqueo, sin red)**:
`reconcileDteWithMh` ya acepta `queryAdapter` inyectable en su firma
pública (diseño de IV-B.1, sin refactor necesario) — se certificó la
rama PRODUCTION completa contra Postgres local real con un adapter
mockeado (cero llamadas de red, cero MH):

1. Fixture `SIGNED` + `DteFiscalMeteringReservation(PENDING)` +
   adapter mock devolviendo `QUERY_PROCESSED` consistente → resultado
   `RESOLVED`/`ACCEPTED`, reserva `CONSUMED`, exactamente 1
   `DteTransmissionLog(QUERY)` creado, atómico. **PASS**.
2. Fixture `SIGNED` sin ninguna reserva → `INCONSISTENT_LOCAL_STATE`,
   adapter **nunca invocado** (verificado por instrumentación), DTE
   permanece `SIGNED`, cero logs. **PASS**.
3. Fixture `SIGNED` con reserva `CONSUMED` (NOT_PENDING) → mismo
   resultado que (2): guard previo a cualquier llamada MH, ledger sin
   tocar. **PASS**.

Los 3 fixtures se crearon y eliminaron exclusivamente en local
TrustmeDB; conteos de `DteOutgoingDocument`/`DteTransmissionLog`/
`DteFiscalMeteringReservation` antes y después de la certificación:
idénticos (68/134/0). **`POSTGRES_PROD_BRANCH_CERTIFIED=YES`**.

## FASE IV-B.4 — Certificación E2E real + fix runtime-aware de credenciales (09/09/2026)

Con una `DteCredential` TEST legítima configurada por el usuario vía
`/dashboard/settings/dte` (issuer TEST `2d47dc24-...`, `is_active=false`
— no fue necesario activar el ambiente para guardar la credencial),
se certificó el flujo completo real contra MH TEST usando exclusivamente
`localhost:5432/TrustmeDB`:

```
AUTH   /seguridad/auth        -> ok, token Bearer recibido
QUERY  /fesv/recepcion/consultadte/ -> HTTP 202, QUERY_PROCESSED,
       selloRecibido idéntico al ya conocido de IV-B.2
reconcileDteWithMh: SIGNED -> RESOLVED/ACCEPTED
2ª invocación:      NO_OP/ALREADY_RESOLVED, 0 llamadas MH, log sigue =1
```

Fixture creado y eliminado exclusivamente en local TrustmeDB; pre/post
counts idénticos. `E2E_RECONCILIATION_TEST_CERTIFIED=YES`.

### Riesgo arquitectónico detectado y corregido: resolución de credenciales no runtime-aware

Auditoría post-certificación (`resolveMhAuthCredentials`,
`MhAuthAdapter`, `dte-reconciliation.service.ts`,
`transmit-dte-document.service.ts`): **confirmado** que
`resolveMhAuthCredentials` leía siempre `DteCredential` desde el prisma
singleton global (Control Plane), nunca desde el `runtimeDb` explícito
que `reconcileDteWithMh` ya recibe. En un despliegue multi-runtime real
(Control Plane ≠ runtime DB del cliente, caso TrustMe), esto habría
buscado la credencial en la base equivocada. En esta certificación no
se manifestó porque el proceso completo corrió con `DATABASE_URL`
apuntando exactamente a la misma DB que `runtimeDb` (ambos =
`localhost:5432/TrustmeDB`).

**Fix aplicado (backward-compatible, sin romper callers legacy)**:

- `resolveMhAuthCredentials({ issuerConfigId, environment, client? })`
  — nuevo parámetro opcional `client: DteCredentialQueryClient`
  (`Pick<PrismaClient, "dteCredential">`, reutilizando el mismo tipo ya
  usado por `resolveDteSignerConfigForIssuer`). Sin `client`, cae al
  prisma global exacto de antes.
- `MhAuthAdapter` gana un constructor opcional
  `new MhAuthAdapter({ credentialClient })` que propaga ese client a
  cada `resolveMhAuthCredentials(...)` interno. Sin argumento, se
  comporta exactamente igual que antes (compatibilidad total con
  `MhDteTransmissionAdapter`, que sigue instanciando `new MhAuthAdapter()`
  sin cambios).
- `reconcileDteWithMh`: cuando no se inyecta `queryAdapter` (caso real,
  nunca en los tests existentes — los 24 tests de
  `dte-reconciliation.service.test.ts` siempre inyectan su propio mock),
  ahora construye
  `new MhDteQueryAdapter(new MhAuthAdapter({ credentialClient: runtimeDb }))`
  en vez de `new MhDteQueryAdapter()` — la autenticación de la
  reconciliación queda atada a la misma runtime DB que el resto del
  flujo.

### Cache de token — decisión de diseño

El cache de `MhAuthAdapter` sigue siendo un `Map` a nivel de módulo,
keyed por `issuerConfigId:environment` (sin cambios). Se evaluó incluir
una "runtime identity" adicional en la key y **se descartó**:
`issuer_config_id` es un UUID generado por `DteIssuerConfig.id` en una
única runtime DB — nunca se reutiliza entre dos runtime DBs distintas
por diseño (cada una genera sus propios UUIDs), así que dos runtimes
nunca colisionan en la misma key en la práctica. Agregar una dimensión
extra a la key habría sido complejidad sin un riesgo real demostrado.

### SEND / firma — fuera de alcance de este fix

`transmitDteDocument` (SEND) y `resolveDteSignerConfigForIssuer` (usado
por `sign-dte-document.service.ts`) siguen acoplados al prisma
singleton global por diseño — su API pública (`TransmitDteDocumentParams`)
no recibe un `runtimeDb` explícito, a diferencia de
`reconcileDteWithMh`. Extender SEND/firma a runtime-aware requeriría
agregar `runtimeDb` a esa API pública — un cambio de mayor alcance sobre
un pipeline productivo activo, fuera del alcance de esta microfase.
Queda documentado como trabajo pendiente para una fase futura si/cuando
SEND deba operar contra runtime DBs de clientes distintos del proceso
que lo ejecuta (hoy, para GYM, el prisma global YA es la runtime activa
— sin bug real todavía).

### Tests agregados

- `dte-credential.service.resolve-mh-auth-credentials.test.ts` (5): client explícito nunca toca prisma global; fallback legacy sin client; PRODUCTION nunca cae a `.env`; TEST cae a `.env` sin credencial; TEST bloqueado sin credencial ni fallback.
- `dte-auth.adapter.test.ts` (3): `credentialClient` del constructor se propaga a `resolveMhAuthCredentials`; sin constructor, `client` es `undefined` (legacy); cache de token sigue aislado por `issuerConfigId+environment` independientemente del `credentialClient`.
- `dte-reconciliation.service.runtime-aware-adapter.test.ts` (2): sin `queryAdapter` inyectado, construye `MhDteQueryAdapter(MhAuthAdapter({ credentialClient: runtimeDb }))`; con `queryAdapter` inyectado, nunca construye clases reales.
