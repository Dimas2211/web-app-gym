# Fase 4: diseño técnico consolidado MH 2.0

Fecha: 2026-11-24. Rama de trabajo: `fix/mh-test-runs-runtime-actor` (solo lectura del código).

**Entradas:**

- los documentos de las Fases 1 a 3 de este directorio;
- lectura focalizada de `src/modules/commerce/dte/`, `src/modules/platform/dte-onboarding/mh-test-runs/` y `prisma/schema.prisma` (solo los modelos DTE, territorio, emisor y pruebas MH);
- fragmentos del `markdown/manual-tecnico-v2.md`.

No se modificó código, Prisma, schemas ni seeds. **Este documento es un diseño, no una autorización de producción.**

Documentos relacionados:

- `04-plan-implementacion.json`: tareas IMP20;
- `04-plan-migraciones.md`;
- `04-plan-pruebas.md`;
- `04-bloqueos-activacion.md`.

---

## 1. Decisiones arquitectónicas

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Un solo motor fiscal con "perfiles normativos"** (`MH_1_2`, `MH_2_0`). Los builders existentes reciben el perfil como parámetro; no se crea un segundo motor. | El onboarding y la producción ya comparten builders (`build*FromLoadedData`). Duplicarlos rompería esa garantía. |
| D2 | **Registro central de especificaciones** `(perfil, tipo) → {versión, schema, pendiente de confirmación}`. Es el único punto que conoce versiones. | Hoy las versiones están literales en 9 sitios (`generate-fe-json.service.ts:585`, `generate-ccfe-json.service.ts:551`, `generate-nc-json.service.ts:281`, `generate-fse-json.service.ts:423`, `build-invalidation-event-json.service.ts:160`, `build-contingency-event-json.service.ts:165`, `transmit-dte-document.service.ts:89-96`, `transmit-invalidation-event.service.ts:198`, `fex11-schema-version.ts`). |
| D3 | **Cada documento se valida y transmite con la versión que lleva en `identificacion.version`**, no con una tabla por tipo. | El Manual Técnico exige que el `version` del body coincida con el de la identificación. Esto permite revalidar documentos históricos y transmitir pendientes sin reconstruirlos. |
| D4 | **Activación por emisor y ambiente** con `DteIssuerConfig.mh_spec_profile` (nullable; null = `MH_1_2`), **más un interruptor de despliegue** `DTE_MH20_PROFILE_ENABLED`. Sin activación automática por fecha. | `DteIssuerConfig` ya es único por `tenant_id + location_id + environment` (`schema.prisma:2406-2471`): el perfil queda naturalmente separado por emisor, sede y ambiente. MH20-092/093/094 no fijan fecha. |
| D5 | **Persistir el perfil aplicado** en cada documento y evento (`mh_spec_profile`, nullable). Los históricos se infieren por versión, sin backfill. | Identifica la normativa aplicada. FEX v3 es igual en ambos perfiles y no se distingue por versión. |
| D6 | **Schemas 2.0 en carpeta propia** `schemas/mh/v2_0/`, copia literal de `originales/svfe-json-schemas/`. No se renombra ni borra ningún schema actual. FEX reutiliza `fex-11-v3.schema.json`, idéntico al 2.0 (Fase 2). | Conservar los históricos y que sea auditable por SHA. |
| D7 | **Proyección territorial canónica única**, generalizando `projectFexV3Territory`, para el emisor y el receptor de FE, CCF, NC, FSE y FEX, además de los receptores de onboarding. **Sin columnas nuevas** en `Customer`, `Supplier` ni `DteIssuerConfig`. | `Municipality` ya contiene `district_code`, `new_municipality_code` y `new_municipality_name` (`schema.prisma:1418-1452`). La proyección es determinista desde `(dept_code, code)`. |
| D8 | **Las reglas retiradas del schema 2.0 se mantienen como reglas semánticas de Zolvi** hasta que la normativa o el manual funcional confirmen su derogación. Se ejecutan después del AJV en el paso de validación. | Se retiraron 130 condicionales del schema, y MH seguirá validando reglas de negocio (MH20-085/095). |
| D9 | **Retorno y Operaciones Especiales son modelos propios**, siguiendo el patrón de `DteInvalidationEvent` y `DteContingencyEvent`. Nunca se modelan como invalidación. OE queda condicionado a una autorización por emisor. | MH20-059: el retorno no invalida el origen. MH20-063: OE solo aplica a emisores designados. |
| D10 | **El contrato MariaDB no se renombra.** El payload sigue siendo el JSON fiscal tal cual (`{...jsonDoc, codigoEmpresa, responseMH, token}`, `build-external-dte-payload.service.ts:163-168`). La entrega de documentos 2.0 depende de una capacidad declarada por destino. | El receptor externo recibirá otra forma en la raíz (sin `extension`, con `distrito`, `ivaRete`…), y hay que verificar su compatibilidad. |
| D11 | **Correlativos: ningún cambio de numeración en esta adaptación.** Solo se valida el formato M/S/B/P y se registran las decisiones pendientes (modalidad y reinicio anual). | Restricción explícita del prompt y MH20-004 sin confirmar. |

---

## 2. Versionado normativo

### 2.1 ¿Lo permiten los modelos actuales?

| Necesidad | Estado actual | ¿Hace falta cambio? |
|---|---|---|
| Leer la versión de un documento | `json_document.identificacion.version` + `readDteJsonIdentificacionVersion` (`utils/fex11-schema-version.ts:22-37`) | No (se generaliza el helper) |
| Validar un histórico con su schema | `SCHEMA_MAP` por tipo (`validate-dte-json-schema.service.ts:57-63`) | Sí: la clave pasa a ser tipo + versión |
| Identificar la normativa aplicada | No existe | Columna aditiva `mh_spec_profile` |
| Activación por emisor y ambiente | No existe; la FEX usa una constante (`FEX11_SCHEMA_VERSION`) | Columna aditiva `DteIssuerConfig.mh_spec_profile` |
| Catálogos con versión | `DteCatalogItem.version` en `@@unique([catalog_code, item_code, version])` (`schema.prisma:2719-2740`) | No: CAT-028 2.0 y CAT-033 se agregan como `version = "2.0"` |
| Guardia de versión en firma y transmisión | Solo FEX (`fex11LegacyVersionError`, `sign-dte-document.service.ts:123`, `transmit-dte-document.service.ts:202`) | Se generaliza |

### 2.2 Registro de especificaciones (archivo nuevo `src/modules/commerce/dte/spec/dte-spec-registry.ts`)

| Tipo | `MH_1_2` (vigente) | `MH_2_0` | Estado |
|---|---|---|---|
| 01 FE | v1 `fe-01.schema.json` | v2 `v2_0/fe-f-v2.json` | Confirmado (SCH20-001) |
| 03 CCF | v3 `ccfe-03.schema.json` | v4 `v2_0/fe-ccf-v4.json` | Confirmado (SCH20-102) |
| 05 NC | v3 `fe-nc-v3.json` | v4 `v2_0/fe-nc-v4.json` | Confirmado (SCH20-222) |
| 11 FEX | v3 `fex-11-v3.schema.json` | v3 (el mismo archivo) | `pendingConfirmation: INC-003` |
| 14 FSE | v1 `fse-14.schema.json` | v2 `v2_0/fe-fse-v2.json` | Confirmado (SCH20-446) |
| INV | v2 `anulacion-schema-v2.json` | v3 `v2_0/invalidacion-schema-v3.json` | Confirmado (SCH20-513). Plazos: INC-004/006 |
| CONT | v3 `contingencia-schema-v3.json` | v4 `v2_0/contingencia-schema-v4.json` | `pendingConfirmation: INC-005` |
| 18 Retorno | — | v1 `v2_0/fe-eret-v1.json` | Nuevo. Endpoint no documentado (MT-GAP-001) |
| 17 OE | — | v1 `v2_0/fe-eop-v1.json` | Nuevo, por autorización. INC-001 |

API mínima propuesta, sin código definitivo:

- `getDteSpec(profile, kind)`: devuelve `{ version, schemaId, pendingConfirmation? }`.
- `getSchemaByVersion(kind, version)`: se usa para validar cualquier documento según su propia versión.
- `inferProfileFromDocument(kind, version)`: devuelve `MH_1_2`, `MH_2_0` o `AMBIGUOUS` (FEX v3).
- `resolveActiveDteSpecProfile(issuerConfig, env)`: si el interruptor está apagado, devuelve siempre `MH_1_2`. Si no, devuelve `issuerConfig.mh_spec_profile ?? "MH_1_2"`.

**Regla de seguridad.** Si el perfil activo es `MH_2_0` y la entrada del registro tiene `pendingConfirmation`, la generación falla de forma cerrada en `PRODUCTION`. En `TEST` está permitida, con una advertencia.

### 2.3 Ciclo de un documento durante la transición

| Estado al cambiar el perfil | Política propuesta | Configurable |
|---|---|---|
| `PENDING_GENERATION` | Se genera con el perfil activo | — |
| `GENERATED` / `SCHEMA_VALIDATED` (sin firmar) | La firma rechaza el documento si su perfil difiere del activo y exige regenerarlo. Es la misma lógica que la FEX, y conserva el `numeroControl` y el `codigoGeneracion`. | No |
| `SIGNED` sin transmitir, o en contingencia | Se transmite con su propia versión (D3). Si MH lo rechaza por versión, se reabre con `reopen-signed-dte-for-resign.service.ts` y se regenera con el mismo `codigoGeneracion` (MH20-021). | `DTE_MH20_PENDING_POLICY = TRANSMIT_AS_IS \| REGENERATE_REQUIRED` (bloqueado por MH20-094) |
| `ACCEPTED` / `OBSERVED` | Inmutable. Se visualiza y descarga con su `json_document` original. | — |
| Evento sobre un histórico (invalidación de una FE v1) | El evento usa el perfil activo del emisor y el `documento` referencia los datos del DTE original | Hipótesis; bloqueada por MH20-094 |

---

## 3. Territorio

### 3.1 Implementación actual localizada

- `utils/dte-territory.resolver.ts`:
  - `resolveDteMunicipality` lee `Municipality` por `(dept_code, code, status=active)`;
  - `validateDteAddressCodes` es la validación que usan FE, CCF, NC, FSE y FEX.
- `utils/fex11-v3-territory.ts` y `projectFexV3Territory` proyectan:
  - `departamento = dept_code`;
  - `municipio = CAT-013(dept_code, new_municipality_name)`;
  - `distrito = district_code.slice(4)`.

  Aplica fail-closed ante jerarquía inconsistente, nombre ausente o coincidencia múltiple.
- `utils/cat013-fex-v3-municipalities.ts`: artefacto CAT-013 V1.2 con 44 filas, privado de la FEX. Cabañas: `09|10 OESTE` y `09|11 ESTE` (`:60-61`).
- Verificado en `prisma/importers/generated/municipalities.data.ts`: `district_code.slice(4) === code` en las filas inspeccionadas (por ejemplo, `0619` → `060119`). Esto confirma que el `code` antiguo es el distrito CAT-008, como se concluyó en la Fase 3.

### 3.2 Diseño: un servicio canónico

Archivo nuevo `utils/dte-territory-projection.ts`, con `projectMhTerritory(resolved, { cat013Source })`. Devuelve una de estas variantes:

- `{ ok: true, territory: { departamento, municipio, distrito } }`;
- `{ ok: false, code, error }`, con `code` entre:
  - `NOT_FOUND`;
  - `INCOMPLETE`;
  - `HIERARCHY_MISMATCH`;
  - `CAT013_NO_MATCH`;
  - `CAT013_AMBIGUOUS`;
  - `CAT_INC_001_CABANAS`.

| Consumidor | Uso |
|---|---|
| FEX 11 | `projectFexV3Territory` delega en el servicio canónico, con salida idéntica. Los tests actuales de `fex11-v3-territory.test.ts` deben seguir en verde. |
| FE, CCF, NC y FSE con perfil `MH_2_0` | Emisor y receptor/sujeto excluido: se proyectan `{departamento, municipio, distrito}`. Con `MH_1_2` no cambia nada: `municipio = Municipality.code`. |
| `DteIssuerConfig` | Vista previa y preflight 2.0 (`dte-production-preflight.service.ts`) |
| Receptores de onboarding | Los fixtures conservan `deptCode` + `municipalityCode` (código antiguo = distrito). La proyección se aplica igual que en producción. |

**Fuente CAT-013.** El artefacto se versiona como `cat013-municipalities.ts` con `source: "V1_2" | "V2_0"`. Las filas de Cabañas llevan la marca `disputed: "CAT-INC-001"`.

| Perfil | Cabañas (`dept 09`) |
|---|---|
| `MH_1_2` / FEX actual | Se mantiene el comportamiento vigente (V1.2), sin regresión |
| `MH_2_0` (FE, CCF, NC, FSE) | **Fail-closed** con `CAT_INC_001_CABANAS` hasta que MH confirme. No se infiere. |

Delgado (`06|19`):

- el distrito se resuelve por código (`19`), no por nombre;
- el municipio 2.0 se resuelve con `new_municipality_name = "San Salvador Centro"`;
- se marca `REVIEW_LABEL` en el dry-run (CAT20-297). No bloquea la emisión porque el código coincide, pero requiere revisión manual antes de activar.

### 3.3 Migración no destructiva

- **Sin cambio de schema ni de datos maestros.** Lo que viaja a MH se deriva en tiempo de generación.
- **Dry-run obligatorio**: script de solo lectura `prisma/scripts/mh20-territory-dry-run.ts` sobre:
  - `Customer`;
  - `Supplier`;
  - `DteIssuerConfig`;
  - los receptores de los planes `PlatformDteMhTestRun.plan` (Control Plane).

  Clasifica cada registro como `OK`, `INCOMPLETE`, `NOT_FOUND`, `CAT_INC_001_CABANAS` o `REVIEW_LABEL`. Escribe JSON o CSV fuera del repositorio. **No escribe en ninguna base.**
- Los snapshots `json_document` aceptados no se tocan.

---

## 4. Builders y validadores

En todos los casos, la rama `MH_1_2` del builder produce **exactamente** el JSON actual. Se protege con un test de regresión golden.

| Doc | Cambios con `MH_2_0` | SCH20 / MH20 | Archivo |
|---|---|---|---|
| FE v2 | Se quitan `emisor.codEstableMH`, `codPuntoVentaMH`, `tipoEstablecimiento`, `extension` y `resumen.reteRenta`. `ivaRete1` pasa a `ivaRete`. Se agrega `resumen.observaciones`. Se agrega `direccion.distrito` en emisor y receptor (proyección §3). Las etiquetas "CAT-023" de los comentarios se corrigen a CAT-005. | 001-013, 032 / 001, 026, 032, 075 | `generate-fe-json.service.ts` (`:585,611,621,623,642,643,666`) |
| CCF v4 | Igual que FE, además de `ivaPerci1` → `ivaPerci` | 102-117 / 035 | `generate-ccfe-json.service.ts` (`:551,576,586,588,607-609,630`) |
| NC v4 | Receptor: se quita `nit` y se agregan `tipoDocumento` (`"36"`) y `numDocumento`. Por ítem: `ivaPerci`, `ivaRete`, `totalIva` y `noGravado`. En el resumen se quitan `descu*` y `subTotal`, y se agregan `totalIva`, `totalNoGravado`, `totalPagar`, `codigoRetencionMH` (null) y `observaciones`. Se agrega `identificacion.fusion` (null). | 222-251 / 037, 038, 007 | `generate-nc-json.service.ts` (`:218-301,319,438-440,457`), `create-credit-note-dte.service.ts` (`:206,212`) |
| FSE v2 | `sujetoExcluido` pasa a `receptor`. Se quitan `ivaRete1`, `codEstableMH` y `codPuntoVentaMH`. `totalDescu` deja de admitir null. Se agrega `distrito` en emisor y receptor. `totalPagar = totalCompra − reteRenta`. | 446-453, 482 / 042, 075 | `generate-fse-json.service.ts` (`:387-394,423,451-479`), `types/fse-json.types.ts` (`:10,79,81,93`), `supplier-to-sujeto-excluido.mapper.ts` |
| FEX v3 | Sin cambio estructural. `tipoRegimen` toma valor de CAT-033 cuando hay bienes y CAT-028 pasa al formato 2.0. Se corrige `dev/verify-fex11-transmit-local.ts:48` (versión 1). | 347 / 040, 078 | `generate-fex-json.service.ts` (`:546,792`), `sales/export/utils/fex-validation.ts:83`, `prisma/seeds/data/fex11-catalog-rows.ts` |
| INV v3 | `fecAnula`/`horAnula` pasan a `fecEmi`/`horEmi`. Se quitan `montoIva`, `tipoEstablecimiento` y `nomEstablecimiento`. `codEstableMH` y `codPuntoVentaMH` pasan a requeridos y no nulos (fail-closed). `documento.correo` y `telefono` deben estar siempre presentes, aunque sea en null. Se agrega `fusion` (null). | 513-562 / 006, 052 | `build-invalidation-event-json.service.ts` (`:160-220`), `types/dte-invalidation-event-json.types.ts`, `transmit-invalidation-event.service.ts:198` |
| CONT v4 | `codPuntoVenta` pasa a `codPuntoVentaMH` y se toma de `cod_punto_venta_mh`, no de `point_of_sale_code`. `codEstableMH` pasa a requerido. `detalleDTE` admite tipo 18. | 565-587 / 006, 053, 055 | `build-contingency-event-json.service.ts` (`:165-181`), `types/dte-contingency-event-json.types.ts` |

Puntos de atención:

- **Observaciones frente a Extensión.** `resumen.observaciones` toma `sale.notes` (o `purchase.notes`), recortado a 3000 caracteres. Si viene vacío, se envía null. Los datos de entrega y recepción (`nombEntrega`…) desaparecen sin sustituto, porque Zolvi ya enviaba `extension: null`.
- **Retenciones y percepciones.** Hoy FE, CCF y NC envían 0. Con la 2.0 se renombran, pero **el cálculo no cambia**. No se habilitan retenciones nuevas.
- **FSE.** Una compra con `retention_1pct_applies = true` ya no puede emitirse con el perfil `MH_2_0` (MH20-042). El builder devuelve un error de negocio. No se recalcula en silencio.
- **Inconsistencia actual detectada.** FE y CCF llenan `codEstableMH` con `establishment_code` (código interno), mientras FSE, INV y el número de control usan `cod_estable_mh`. Con la 2.0 el campo desaparece en FE y CCF. En INV y CONT, que siguen requiriéndolo, se usará **siempre** `cod_estable_mh` y `cod_punto_venta_mh`.
- **Reglas fuera de AJV** (archivo nuevo `rules/mh-semantic-rules.ts`). Reúne las familias de los 130 condicionales retirados:
  - `emisor/receptor.direccion`: departamento → municipio, unos 66 bloques. Los cubre la proyección territorial.
  - `receptor`: `tipoDocumento` → formato de `numDocumento` (NIT 9/14, DUI).
  - `identificacion`: `tipoModelo`/`tipoOperacion` → `tipoContingencia`/`motivoContin`.
  - `cuerpoDocumento`: `tipoItem` → `codTributo`/`uniMedida`.
  - `documentoRelacionado` y `otrosDocumentos.medico`.
  - `resumen`: totales.

  Cada regla lleva su ID SCH20 y estado `KEEP` hasta que se confirme la derogación. Se ejecutan en `validateDteJsonSchema` con el perfil 2.0.

---

## 5. Correlativos

**Estado verificado** (`services/dte-correlative.service.ts`, `utils/dte-control-number.ts`, `schema.prisma:2542-2576`):

| Aspecto | Implementación |
|---|---|
| Partición | `@@unique([tenant_id, location_id, issuer_config_id, environment, dte_type_code, year])`. Es decir: por emisor (sede y ambiente), por tipo y por año. |
| Piso de reserva | `max(last_sequence, máximo usado en DteOutgoingDocument por prefijo, baseline externo) + 1`, bajo lock de fila (`update` antes de leer en bloque) |
| Unicidad final | `DteOutgoingDocument @@unique([tenant_id, environment, control_number])` |
| Formato | `DTE-{tt}-{estab4}{pv4}-{seq15}`, 31 caracteres. Solo se valida la longitud 4 (`dte-control-number.ts:63-75`, `dte-issuer-config.schemas.ts:77-89`). |
| Fallidos | El número reservado queda consumido. Rechazos y reintentos reutilizan el mismo `control_number` y `codigoGeneracion`. |
| Onboarding | `reserveDteControlNumberBlock` con `firstSequence` explícito, máximo 500 por bloque, en `environment = TEST`. No toca PROD. |

**Hallazgos para decidir (no se corrigen en esta fase):**

1. **COR-01, reinicio anual no efectivo (MH20-005, P1).** `readMaxSequenceUsedInOutgoing` (`:56-87`) no filtra por año, y el `unique` del documento no incluye el año. El 1 de enero de 2027 la secuencia **continuaría** (max + 1), no reiniciaría a 1. Un reinicio real exigiría:
   - cambiar ese `unique`, incluyendo el año fiscal;
   - filtrar el piso por año.

   Es un cambio sensible a 5 semanas del cierre del ejercicio. Hace falta decidir si se reinicia ahora; la continuidad no repite números, pero no cumple el texto literal.
2. **COR-02, año según la zona horaria del servidor.** `new Date().getFullYear()` (`:94,204`) usa la zona del proceso. Solo afecta a la fila de partición mientras COR-01 siga vigente.
3. **COR-03, modalidad (MH20-004).** Zolvi numera por tipo y por sede/punto de venta. La 2.0 admite numeración centralizada o por establecimiento, y prohíbe la numeración por punto de venta o por tipo **salvo resolución**. No está confirmado cómo se interpreta la sección 2 (tipo) del número. **Se mantiene como bloqueo.** Solo se propone registrar la modalidad de forma declarativa (`numbering_modality`, nullable), sin efecto.
4. **COR-04, formato M/S/B/P.** La validación propuesta es `^[MSBP][0-9]{3}$` y `^P[0-9]{3}$`. Con el perfil 2.0 es dura en el preflight y en la generación; con 1.2 solo advierte. No altera números ya emitidos.

---

## 6. Persistencia (resumen; detalle en `04-plan-migraciones.md`)

| Migración | Base | Contenido | Dependencia fiscal |
|---|---|---|---|
| M1 `mh20_spec_profile` | Runtime | `DteIssuerConfig.mh_spec_profile`, `numbering_modality`; `mh_spec_profile` en `DteOutgoingDocument`, `DteInvalidationEvent` y `DteContingencyEvent` (todo nullable) | Común |
| M2 `mh20_return_events` | Runtime | `DteReturnEvent`, `DteReturnEventItem`, enum `DteReturnStatus`; en `DteInvalidationEvent`, `return_event_id` nullable y `dte_document_id` pasa a nullable con CHECK de exactamente un destino | Común (Retorno es general para FE/FEX/FSE) |
| M3 `mh20_special_ops` | Runtime | `DteSpecialOperationsAuthorization`, `DteSpecialOpsEvent`, `DteSpecialOpsEventItem`; `special_ops_event_id` en la invalidación | **Depende de autorización fiscal** |
| M4 `mh20_test_run_events` | Control Plane | `PlatformDteMhTestRunItem.runtime_return_event_id`, `runtime_special_ops_event_id` (nullable) | Común |
| Datos (sin DDL) | Runtime | Seeds de catálogo aditivos: CAT-002, CAT-017, CAT-024 (etiqueta), CAT-028 v2.0 y CAT-033 v2.0 | Común |

---

## 7. Eventos nuevos

### Retorno (tipo 18, `fe-eret-v1`)

| Aspecto | Diseño | Estado |
|---|---|---|
| Elegibles | FE, FEX y FSE con sello (MH20-058) | Confirmado |
| Modelo | `DteReturnEvent` (cabecera, estado y respuesta MH, igual que la invalidación) + `DteReturnEventItem` (`dte_document_id`, ítems y montos devueltos) | Diseño |
| Estados | `DRAFT → PENDING_SIGNATURE → SIGNED → SENT → ACCEPTED/REJECTED` (mismo patrón que `DteContingencyStatus`) | Diseño |
| Límites | Un tipo de documento por evento, ≤ 50 documentos, ≤ 2000 ítems, cada código de generación una sola vez por evento. La suma acumulada no puede superar el DTE (MH20-059): se valida con un agregado en una transacción. | Confirmado |
| Plazo | 3 meses. El origen del cómputo no está claro: desde el sello, según la normativa; desde la generación, según el MF (INC-013). Se configura, con el valor más restrictivo en TEST. | Pendiente |
| Firma | Reutiliza el firmador (`sign-*-event` como patrón). No requiere cambios de infraestructura. | Diseño |
| Transmisión | **Endpoint no documentado en el Manual Técnico v2** (MT-GAP-001) | **Bloqueado** |
| Entrega | Archivo del evento + representación gráfica (MH20-061). En MariaDB, solo después de verificar el contrato. | Pendiente |
| Efectos comerciales | Disminuyen la venta y el débito (FE), la exportación (FEX) o la compra (FSE). No es una NC ni una invalidación. Reportes de ventas/IVA y caja: el reembolso se registra como movimiento de caja **manual vinculado**, sin automatizar. El reingreso a inventario es opcional y explícito, nunca automático. | Diseño: decisión de producto |
| Invalidación | Invalidación v3 con `documento.tipoDte = "18"` (MH20-046). Orden: Retorno → invalidación del Retorno → invalidación de la FE (MH20-049). | Plazo: INC-004 |

### Operaciones Especiales (tipo 17, `fe-eop-v1`)

- Solo para emisores con FVS o Comprobantes de Control Interno autorizados (MH20-063). Se modela con `DteSpecialOperationsAuthorization`: emisor, resolución, tipo (FVS/CCI) y vigencia. Sin autorización, la UI y la acción no existen para ese emisor.
- Detalle uno a uno o por rangos. Se sigue el schema (`docDel`/`docAl`), no la tabla impresa (INC-001), con validación AJV.
- Sin impacto en inventario ni caja: informa operaciones ya documentadas fuera del DTE.
- **Prioridad P2.** Se diseña completo y se implementa solo si existe un cliente en el supuesto.

---

## 8. Integración MH y MariaDB

| Contrato | Hallazgo (Manual Técnico v2) | Adaptación |
|---|---|---|
| Autenticación `/seguridad/auth` | Token de 48 h en TEST y 24 h en PROD (MH20-083) | Verificar el TTL de la caché del token en `dte-credential.service.ts`. Sin cambio de contrato. |
| `/fesv/recepciondte` | El `version` del body debe coincidir con la identificación | D3: se reemplaza `dteTypeCodeToVersion` (`transmit-dte-document.service.ts:89-96,251`) |
| `/fesv/anulardte` | El `version` del body es la del JSON de invalidación | Se reemplaza el literal `2` (`transmit-invalidation-event.service.ts:198`) |
| `/fesv/contingencia` + `/fesv/recepcionlote` + `consultadtelote` | La contingencia usa el servicio de lotes (máximo 100 por lote, 400 lotes) | **Zolvi no implementa lotes** (sin referencias en el código). Hoy transmite uno a uno después del evento. Es una brecha MH20-020/053 que queda como tarea independiente. |
| Política de reintentos | 8 s; consultar el estado antes de reenviar; máximo 2 reintentos | Verificar los adapters (`dte-transmission.adapter.ts`, `dte-query.adapter.ts`). MH20-021/023. |
| Retorno y OE | **Sin endpoint en el MT v2** | MT-GAP-001: bloquea la transmisión |
| Firma | Mismo firmador (JWS). El MT no indica cambios. | Sin cambio de infraestructura |
| Respuesta y sello | Sin cambio de campos (`version`, `versionApp`, `estado`, `selloRecibido`…) | `responseMH` del payload MariaDB sin cambios |

**Hay que distinguir tres artefactos:**

1. **JSON fiscal** que se envía a MH: el `json_document` firmado.
2. **Archivo DTE** para el cliente: JSON + `firmaElectronica` + `selloRecibido`, nombrado `<codigoGeneracion>.json` (MH20-024/025). Hay que verificar `app/api/dte/outgoing/[id]/json/route.ts`.
3. **Payload MariaDB**: el JSON fiscal en la raíz, más `codigoEmpresa`, `responseMH` y `token`.

Con la 2.0, el artefacto 3 cambia de forma en la raíz. No se renombran campos. Se agrega la capacidad `accepts_mh20` en la resolución del destino (`config/resolve-external-dte-destination.ts`). Mientras el receptor no la declare, los documentos 2.0 quedan en la cola con `DELIVERY_BLOCKED_CONTRACT` y no se pierden.

---

## 9. Onboarding fiscal

El runner ya reutiliza builders, validador, firma y transmisión de producción (Fase 2), así que **no se duplica nada**. Cambios:

1. **Perfil por corrida.** El campo `plan.specProfile` va en el JSON del plan (`mh-test-run.planner.ts`, sin migración). Debe coincidir con el `mh_spec_profile` del emisor TEST.
2. **Receptores.** Mantienen `deptCode` + `municipalityCode`. El panel (`platform-mh-test-runs-section.tsx`) muestra el distrito y el municipio 2.0 proyectados, y bloquea Cabañas mientras siga abierta CAT-INC-001.
3. **Emisor.** `MH_TEST_ISSUER_SELECT` (`mh-test-scenarios.ts:262-280`) incorpora `cod_estable_mh` y `cod_punto_venta_mh` para INV y CONT v3/v4.
4. **Plan de mínimos configurable** (archivo nuevo `mh-test-minimums.ts`). Preset "MF 2.0, p. 79":

   | Documento | Cantidad |
   |---|---|
   | FE | 90 |
   | CCF | 75 |
   | NC | 50 |
   | FEX | 90 |
   | FSE | 25 |
   | Invalidación | 5 |
   | Contingencia | 5 |
   | Retorno | 5 |
   | OE | 5, solo con autorización |

   **Verificado contra la Fase 1** (MH20-087/088, `01-impacto-onboarding.md` §3). `MAX_MH_TEST_RUN_ITEMS = 200` (`mh-test-run.planner.ts:23`) es menor que los 330 DTE, así que el preset se reparte en **varias corridas encadenadas por tipo**. No se sube el límite sin una prueba de carga.
5. **Escenarios nuevos:**
   - `RET18_SOBRE_FE`, `RET18_PARCIAL_MULTIPLE`, `RET18_SOBRE_FEX`, `RET18_SOBRE_FSE`;
   - `INV_RETORNO`;
   - `OE17_RANGO`.

   Siguen el orden de MH20-049 con `depends_on_item_id`. Requieren la migración M4.
6. **Invariantes preservados**, con tests existentes ampliados:
   - solo `environment = TEST`;
   - cero inserciones en MariaDB (`mariadb-certification-exclusion.test.ts`);
   - auditoría en el Control Plane;
   - sin usuarios nuevos en las bases cliente (el runtime-port usa el actor de sistema, commit b682b70);
   - correlativos TEST con un bloque explícito;
   - aislamiento por `organization_id`, `tenant_id`, `location_id` y `issuer_config_id`.
7. **No se asume recertificación** (MH20-090). Repetir pruebas con emisores ya autorizados es una decisión operativa por cliente.

---

## 10. Compatibilidad histórica y despliegue

| Caso | Estrategia |
|---|---|
| DTE aceptados con la 1.2 | Inmutables. Se revalidan con su propia versión (D3). La visualización y la descarga leen `json_document`. |
| Firmados pendientes y reintentos | §2.3. El reintento conserva la versión. |
| Eventos sobre documentos anteriores | Usan el perfil activo; bloqueado por MH20-094 |
| Catálogos | Se agregan versiones (`DteCatalogItem.version = "2.0"`). No se borran filas V1.2. |
| Integraciones | Capacidad `accepts_mh20` por destino |
| Activación | 1) Interruptor de despliegue. 2) `mh_spec_profile` en el emisor **TEST**. 3) Lote MH TEST. 4) Emisor **PRODUCTION**, con autorización explícita y registro en `DteEnvironmentAuditLog` o una tabla equivalente. |
| Rollback | Volver el emisor a `MH_1_2`. Los documentos 2.0 ya firmados o aceptados no se revierten: se transmiten o se conservan con su versión. Las migraciones M1 a M4 son nullable y aditivas, así que no se borran columnas al hacer rollback. |
| Infraestructura | Se mantiene el modelo objetivo **Dedicated DB Only**. Hay que verificar después el perfil real de cada runtime existente: cuáles comparten base (Shared) según `project_dte_onboarding_shared_dedicated` y el Control Plane, porque M1 a M3 deben aplicarse en **cada** base runtime. |

---

## 11. Trazabilidad de los P0

| MH20 (P0) | Cobertura |
|---|---|
| 001 Versiones | IMP20-001, 002, 003, 013-019 (FEX: bloqueo INC-003) |
| 003 Sección 3 del número de control | IMP20-011 (formato) |
| 004 Modalidad de numeración | **Bloqueo** COR-03 + IMP20-039 (registro declarativo) |
| 006 Códigos MH en eventos | IMP20-018, 019, 022 |
| 024 Archivo DTE | IMP20-021 |
| 026 Extensión → Observaciones | IMP20-013, 014, 015 |
| 032 FE v2 | IMP20-013 |
| 035 CCF v4 | IMP20-014 |
| 037 NC v4 | IMP20-015 |
| 040 FEX | Ya implementado (v3) + IMP20-017. **Bloqueo** INC-003 |
| 042 FSE v2 | IMP20-016, 029 |
| 044 Plazos de invalidación | IMP20-018 (tabla configurable). **Bloqueo** INC-004 |
| 052 Invalidación v3 | IMP20-018 |
| 055 Contingencia | IMP20-019. **Bloqueo** INC-005 |
| 075 Distrito | IMP20-007, 008, 013-016, 031 |
| 077 Codificación de establecimientos | IMP20-011 |
| 092 Entrada en vigor | **Bloqueo**. IMP20-004 (sin fecha automática) |
| 093 Plazos de adaptación | **Bloqueo**. IMP20-004, 037 |
| 094 Coexistencia | **Bloqueo**. IMP20-003, 006 |
