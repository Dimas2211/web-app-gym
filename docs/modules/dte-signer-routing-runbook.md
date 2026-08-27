# Routing de Firmadores DTE por Ambiente — Runbook

Cierre técnico: FSE 14 + separación permanente de firmadores TEST/PRODUCTION.
Fecha del incidente 802 y de este cierre: 25/08/2026.

## 1. Qué problema resolvió esto

TEST y PRODUCTION de Hacienda (MH) son **criptográficamente independientes**.
El mismo NIT emisor puede estar asociado temporalmente a **certificados
distintos** en cada ambiente mientras MH sincroniza una rotación.

El 25/08/2026 se confirmó, con el mismo FSE previamente rechazado
(`DTE-14-M001P001-000000000020001`, `codigoGeneracion
DC22651E-85B4-43AF-91F0-4F14548331A0`):

- MH TEST autentica correctamente.
- Consulta histórica TEST funciona.
- El certificado **nuevo** (el que ya usa PRODUCTION) devolvía `HTTP 400 /
  codigoMsg 802 / "Firma no válida"` al firmar en TEST.
- El certificado **anterior** firmó el mismo FSE y MH TEST lo procesó:
  `HTTP 200`, `estado: PROCESADO`, `codigoMsg: 001`, `selloRecibido:
  2026407BF0413AB54B138E5CF2F1DB9A85EBF5WP`.

**El error 802 no era causado por el FSE ni por el correlativo.** Era un
certificado activo equivocado para el ambiente TEST. La causa raíz de fondo
es arquitectónica: antes de este cierre, toda la plataforma firmaba siempre
contra un único `DTE_SIGNER_URL` global, sin relación con el
`environment` real del `DteOutgoingDocument` que se estaba firmando. Nada
impedía que un documento TEST fuera firmado con el signer/certificado de
PRODUCTION, o viceversa, con solo cambiar una variable de entorno o el
ambiente activo en la UI.

## 2. Arquitectura final

```
APPLICATION
│
├── DTE TEST (dte.environment === "TEST")
│      │
│      └──> DTE_SIGNER_URL_TEST
│             │
│             └──> FIRMADOR-TEST-SERVICE :8114
│                     │
│                     └──> certificado que TEST reconoce hoy
│
└── DTE PRODUCTION (dte.environment === "PRODUCTION")
       │
       └──> DTE_SIGNER_URL_PRODUCTION
              │
              └──> FIRMADOR-SERVICE :8113
                     │
                     └──> certificado de PRODUCTION
```

Regla dura: **la aplicación nunca conoce nombres de archivo de
certificado.** Solo conoce `environment → URL de firmador`. El certificado
que cada puerto usa pertenece a la infraestructura del firmador, no al
builder DTE.

### 2.1 Servicios Windows (WinSW)

| Servicio | Ambiente | Puerto | CERTIFICATE_HOME | Directorio |
|---|---|---|---|---|
| `FIRMADOR-SERVICE` | PRODUCTION | 8113 | `C:\certificado` (machine env, sin cambios) | `C:\Certificado\` |
| `FIRMADOR-TEST-SERVICE` | TEST | 8114 | `C:\Certificado\SignerTest` (env del servicio, no global) | `C:\Certificado\SignerTest\` |

Ambos ejecutan el mismo jar (`svfe-api-firmador-0.1.1.jar`, en
`C:\Certificado\`) — no se duplicó binario. `FIRMADOR-TEST-SERVICE` fija su
propio `server.port=8114` vía `-Dserver.port=8114` y su propio
`CERTIFICATE_HOME` vía `<env>` en su WinSW XML — **no se tocó el
`CERTIFICATE_HOME` de máquina** que usa `FIRMADOR-SERVICE`. WinSW escribe
los logs del servicio TEST en su propio directorio
(`C:\Certificado\SignerTest\FIRMADOR-TEST-SERVICE.{out,err,wrapper}.log`),
separados de `C:\Certificado\WinSW.*.log` de PRODUCTION.

`FIRMADOR-TEST-SERVICE` quedó instalado con `StartType: Automatic` — arranca
solo con Windows, igual que `FIRMADOR-SERVICE`.

El certificado usado por TEST es una **copia byte a byte** de
`C:\Certificado\05280807241037_old.crt` (verificada por SHA-256 antes y
después de copiar), guardada en
`C:\Certificado\SignerTest\05280807241037.crt`. El original
`05280807241037_old.crt` no se movió, renombró ni borró.

### 2.2 Verificación operacional de ambos puertos

Con ambos servicios corriendo simultáneamente, un diagnóstico local (payload
trivial, sin datos fiscales reales, **nunca transmitido a MH**) confirmó:

- `POST http://localhost:8113/firmardocumento/` → `status: OK`, JWS válido,
  `alg: RS512`.
- `POST http://localhost:8114/firmardocumento/` → `status: OK`, JWS válido,
  `alg: RS512`.
- Los archivos de certificado que cada instancia resuelve son distintos por
  hash SHA-256 (verificado con `certutil -hashfile` sobre los dos
  `.crt`), y cada servicio solo tiene visibilidad de su propio
  `CERTIFICATE_HOME` — `FIRMADOR-TEST-SERVICE` no tiene ninguna ruta de
  acceso al certificado de `C:\Certificado\05280807241037.crt` salvo que
  alguien reconfigure manualmente su `<env>`.

El certificado MH (`.crt`) de este proveedor **no es PEM/DER estándar**
(es un contenedor XML propietario de MH que incluye clave privada
cifrada). Por eso la comparación cruzada de firma se hizo por identidad de
archivo (hash) + aislamiento de configuración, no por extracción de
`x5c` del JWS — el JWS que devuelve este firmador no embebe `x5c` en el
header. Si se necesita una prueba matemática adicional (verificar la firma
contra la clave pública exacta de cada certificado), está pendiente como
acción manual — ver §7.

## 3. Variables de entorno

```
DTE_SIGNER_URL_TEST=http://localhost:8114/firmardocumento/
DTE_SIGNER_URL_PRODUCTION=http://localhost:8113/firmardocumento/
DTE_SIGNER_TIMEOUT_MS=10000
```

`DTE_SIGNER_URL` (legacy) se mantiene en `.env`/`.env.example` marcada
**DEPRECATED** — ningún flujo de firma real depende de ella. Se conserva
solo por compatibilidad con scripts dev antiguos que la leen directamente.

Nota de corrección menor encontrada en este cierre: el valor por defecto
hardcodeado en código (usado solo si la variable de ambiente falta) tenía
la ruta vieja `/firma/firmardocumento/` (con segmento `firma/` extra), que
nunca fue la ruta real del firmador (`/firmardocumento/`). Se corrigió el
default junto con este cambio; no afecta el comportamiento en ningún
ambiente donde `DTE_SIGNER_URL_TEST`/`DTE_SIGNER_URL_PRODUCTION` estén
configuradas (como en este entorno).

## 4. `resolveDteSignerConfig(environment)` — fuente única de verdad

Archivo: `src/modules/commerce/dte/config/dte-signer.config.ts`.

```ts
resolveDteSignerConfig("TEST")       // → DTE_SIGNER_URL_TEST
resolveDteSignerConfig("PRODUCTION") // → DTE_SIGNER_URL_PRODUCTION
```

- Nunca hace fallback cruzado TEST↔PRODUCTION.
- Si falta la variable del ambiente pedido, lanza `DteSignerConfigError`
  explícito — nunca resuelve en silencio a la otra URL.
- `getDteSignerConfig()` (sin ambiente) queda marcada `@deprecated` — ya no
  la usa ningún flujo de firma real.

`MhHttpDteSignerAdapter.sign()` y `.checkHealth()` (en
`dte-signer.adapter.ts`) ya **no resuelven su propia URL** — reciben
`DteSignerConfig` como parámetro obligatorio. El adapter quedó agnóstico de
ambiente: no puede firmar contra el signer equivocado porque no decide cuál
usar.

## 5. `signDteDocument()` y los demás flujos de firma

Todos resuelven el signer **desde el `environment` real del registro que
están firmando**, nunca desde UI ni desde una variable global:

| Archivo | Antes | Ahora |
|---|---|---|
| `services/sign-dte-document.service.ts` | `getDteSignerConfig()` global | `resolveDteSignerConfig(dteDoc.environment)` — `environment` agregado al `select` |
| `services/sign-contingency-event.service.ts` | `getDteSignerConfig()` global | `resolveDteSignerConfig(event.items[0].dte_document.environment)` |
| `services/sign-invalidation-event.service.ts` | `getDteSignerConfig()` global | `resolveDteSignerConfig(dteDoc.environment)` — `environment` agregado al `select` del DTE original |
| `platform/.../support-dte-sign-runner.ts` | `getDteSignerConfig()` global (aunque ya cargaba `environment` sin usarlo) | `resolveDteSignerConfig(data.environment)` |

Esto cierra la brecha original: antes, cambiar el ambiente activo en la UI
(o solo `DTE_SIGNER_URL` en el proceso) podía hacer que un DTE TEST ya
existente terminara firmado con el signer de PRODUCTION. Ahora el
`environment` viene siempre de la fila de base de datos del documento que
se firma.

## 6. Tests de routing

`src/modules/commerce/dte/config/dte-signer.config.test.ts` (8 tests,
verdes):

- TEST resuelve `DTE_SIGNER_URL_TEST`.
- PRODUCTION resuelve `DTE_SIGNER_URL_PRODUCTION`.
- TEST nunca devuelve la URL de PRODUCTION, aunque sea la única
  configurada.
- PRODUCTION nunca devuelve la URL de TEST, aunque sea la única
  configurada.
- Falta `DTE_SIGNER_URL_TEST` → error explícito.
- Falta `DTE_SIGNER_URL_PRODUCTION` → error explícito.
- `healthUrl` se deriva de la URL resuelta del ambiente pedido.
- `timeoutMs` cae a 10000ms con un valor inválido.

## 7. Preflight — ambos signers

`getDteProductionPreflight()` (en `dte-production-preflight.service.ts`)
agrega checks independientes por ambiente, sin firmar ni transmitir nada:

- `DTE_SIGNER_PRODUCTION_CONFIGURED` / `DTE_SIGNER_PRODUCTION_REACHABLE`
  (bloqueante si falta — es el ambiente que este preflight certifica).
- `DTE_SIGNER_TEST_CONFIGURED` / `DTE_SIGNER_TEST_REACHABLE`
  (informativo/warning, no bloquea — TEST puede no ser el ambiente activo).

`REACHABLE` usa `checkHealth()` contra `<signerUrl>status`
(`GET http://localhost:PORT/firmardocumento/status`), que el firmador
expone realmente (confirmado `200 OK` en ambos puertos) — nunca firma ni
transmite un documento real.

Este preflight ya se renderiza genéricamente en
`switch-dte-environment-dialog.tsx` (`preflight.checks.map(...)`), así que
los checks nuevos aparecen automáticamente en el diálogo de cambio de
ambiente sin tocar UI.

**Resultado real de la ejecución de cierre** (tenant/location de
producción activa), con `FIRMADOR-SERVICE` y `FIRMADOR-TEST-SERVICE`
corriendo:

```
status: READY
DTE_SIGNER_PRODUCTION_CONFIGURED: ok
DTE_SIGNER_PRODUCTION_REACHABLE:  ok
DTE_SIGNER_TEST_CONFIGURED:       ok
DTE_SIGNER_TEST_REACHABLE:        ok
... (resto de checks fiscales/PRODUCTION: ok)
issuer_config_id: 584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad
```

## 8. FSE 14 — delivery MariaDB sin depender de Sale

Auditoría dirigida (§12-14 del bloque de trabajo original) sobre
`build-external-dte-payload.service.ts`, `deliver-dte-to-external-db.service.ts`,
el adapter MariaDB y `dte-action-availability.utils.ts`:

**Hallazgo: no había ninguna dependencia de `sale_id` que bloqueara FSE.**
`SUPPORTED_TYPES` en `build-external-dte-payload.service.ts` ya incluía
`"14"`, y ningún paso de la construcción del payload ni del delivery
consulta o exige `Sale`. El gate de disponibilidad de la acción
(`canDeliverExternal` en `dte-action-availability.utils.ts`) solo depende
de `isFiscallyReceivedByMh(status, reception_stamp)` y de que no exista ya
un delivery exitoso — ambos agnósticos de si el origen es `Sale` o
`Purchase`. No fue necesario ningún cambio de código en el pipeline de
delivery.

Se agregó cobertura de tests explícita para dejarlo documentado y evitar
regresión futura:
`src/modules/commerce/dte/services/build-external-dte-payload.service.test.ts`
(7 tests, verdes) — FSE ACCEPTED + `purchase_id` + `sale_id` null construye
payload; FSE REJECTED bloqueado; FSE ACCEPTED sin `reception_stamp`
bloqueado; FSE OBSERVED con `reception_stamp` elegible; tipoDte 14
permitido; `json_document` con tipoDte distinto rechazado por
inconsistencia; sin dependencia de `sale_id`.

### 8.1 Origen: Purchase, no Sale

```
DteOutgoingDocument (tipoDte 14, FSE):
  purchase_id != null
  sale_id      = null

Flujo:
  Purchase CONFIRMED
  → FSE DTE (PENDING_GENERATION)
  → JSON generado (GENERATED)
  → SCHEMA_VALIDATED
  → SIGNED (signer resuelto por dte.environment)
  → transmitido a MH
  → ACCEPTED (reception_stamp presente)
  → delivery MariaDB (buildExternalDtePayload + deliverDteToExternalDb)
  → procesamiento externo / PDF / JSON / correo (fuera de esta app).
```

### 8.2 Idempotencia

El gate de UI (`canDeliverExternal`) ya impedía un segundo delivery exitoso
desde la app: se desactiva en cuanto existe un
`DteTransmissionLog(operation_type=EXTERNAL_DELIVERY, error_message=null)`
para el documento. Antes de la entrega real del FSE 20001 se confirmó
explícitamente `0` logs `EXTERNAL_DELIVERY` previos para ese documento.

**Límite conocido:** el adapter MariaDB (`ExternalDteMariaDbAdapter`) es
**INSERT-only por diseño** (comentario explícito en el código: "el usuario
externo es INSERT-only") — no ejecuta ningún `SELECT` antes de insertar.
Se confirmó en este cierre que el usuario configurado
(`EXTERNAL_DTE_MARIADB_USER`) efectivamente **no tiene permiso `SELECT`**
sobre la tabla externa (`SELECT command denied`, verificado al intentar la
verificación read-only). Por lo tanto la idempotencia real, en este
momento, depende exclusivamente del gate de la app (el log
`EXTERNAL_DELIVERY` propio), no de una verificación contra el estado real
de la tabla externa. Si se requiere una verificación read-only
independiente, se necesita un usuario MariaDB con `SELECT` sobre
`dtes_trustme` — ver acción manual en §7 de la sección de cierre más
abajo.

## 9. Rotación de certificados — procedimiento futuro

**Nunca asumir que porque PRODUCTION acepta un certificado, TEST ya lo
acepta** (o viceversa). Son ambientes MH independientes.

### Rotación certificado PRODUCTION

1. Obtener el certificado nuevo de MH.
2. Backup del `.crt` actual de `C:\Certificado\` (copia, no mover).
3. Reemplazar el `.crt` activo en `C:\Certificado\` (el que resuelve
   `CERTIFICATE_HOME` de máquina, usado por `FIRMADOR-SERVICE`).
4. Verificación local: firmar un payload de diagnóstico contra `:8113` y
   confirmar `status: OK` (sin transmitir a MH).
5. Reiniciar únicamente `FIRMADOR-SERVICE`
   (`Restart-Service FIRMADOR-SERVICE`, o
   `C:\Certificado\WinSW.exe restart`) — no tocar `FIRMADOR-TEST-SERVICE`.
6. Validar preflight PRODUCTION (`DTE_SIGNER_PRODUCTION_REACHABLE: ok`).
7. Prueba controlada cuando corresponda (un solo DTE real).

### Rotación certificado TEST

1. **Confirmar primero que MH TEST reconoce el certificado nuevo** — no
   asumirlo por analogía con PRODUCTION.
2. Backup del `.crt` actual de `C:\Certificado\SignerTest\`.
3. Reemplazar **solo** el `.crt` dentro de
   `C:\Certificado\SignerTest\` — nunca el de `C:\Certificado\` (ese es de
   PRODUCTION).
4. Reiniciar únicamente `FIRMADOR-TEST-SERVICE`.
5. Verificar JWS local contra `:8114` (sin transmitir).
6. Prueba TEST controlada.

**Cero cambios de código en ninguno de los dos procedimientos.** La app
solo conoce `environment → URL de firmador`; el certificado que hay detrás
de cada puerto es responsabilidad exclusiva de la infraestructura del
firmador.

## 10. Estado final de este cierre

- `FIRMADOR-SERVICE` (PRODUCTION, `:8113`): `Running`, `StartType:
  Automatic`. No modificado.
- `FIRMADOR-TEST-SERVICE` (TEST, `:8114`): instalado y `Running`,
  `StartType: Automatic`. Nuevo.
- `DteIssuerConfig`: `PRODUCTION` activo, `TEST` inactivo (restaurado al
  final, exactamente 1 configuración activa).
- FSE `DTE-14-M001P001-000000000020001` /
  `DC22651E-85B4-43AF-91F0-4F14548331A0`: sigue `ACCEPTED`, mismo sello
  `2026407BF0413AB54B138E5CF2F1DB9A85EBF5WP`. No se retransmitió, no se
  refirmó, no se modificó su JSON.
- Delivery MariaDB del FSE: 1 entrega exitosa registrada
  (`insertId=12`, `affectedRows=1`, tabla `dtes_trustme`), 0 duplicados por
  el gate de la app.
