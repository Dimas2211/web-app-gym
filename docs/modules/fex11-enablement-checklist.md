# Factura de Exportación 11 — Criterio de habilitación y checklist de riesgos

> Microfase F3-C9. Documento de **análisis y decisión**. No se modificó `schema.prisma`, no se crearon migraciones, no se tocó código fuente, no se habilitó tipo 11 en ningún flujo real. Basado en el estado real de F3-C0 a F3-C8 (ver `docs/modules/fex11-data-contract.md` y los servicios listados en la Sección 2).

## 1. Resumen ejecutivo

FEX 11 ya tiene base técnica avanzada: existe la migración de `SaleExportDetails` + campos `Customer` extranjero + `UnitOfMeasure.mh_unit_code` (F3-C3), el builder `generateFexJsonForSale`/`buildFexJsonFromLoadedData` (F3-C4), el schema AJV `fex-11.schema.json` registrado en `validate-dte-json-schema.service.ts` (F3-C5), un fixture in-memory que valida builder + AJV en 3 escenarios (F3-C6), una action de preview read-only `previewFexJsonAction` (F3-C7), y una verificación local end-to-end contra PostgreSQL local con datos reales — unidad, producto, cliente extranjero, venta, `SaleExportDetails` y `DteOutgoingDocument` tipo 11 reales — confirmando `generateFexJsonForSale` OK y AJV OK (F3-C8).

FEX 11 **todavía no está habilitada para usuarios**: no se puede crear un `DteOutgoingDocument` tipo 11 desde el flujo normal de ventas, no hay UI para capturarlo, no se persiste `json_document` FEX 11 desde el pipeline real, y no debe firmarse ni transmitirse todavía — quedan gaps de fórmula sin confirmar contra ejemplos reales de MH (`descuento` vs `totalDescu`, `totalPagar` vs `montoTotalOperacion`, ver `fex11-data-contract.md` §10) y no existe evidencia de aceptación real de Hacienda.

La siguiente decisión no es "cómo terminar FEX 11", sino **cómo habilitar generación controlada de JSON sin abrir firma, transmisión, UI pública ni MariaDB prematuramente** — permitiendo seguir validando el builder contra casos reales mientras se cierran los gaps de fórmula, sin exponer el flujo a usuarios finales ni a Hacienda todavía.

## 2. Estado actual por capa

| Capa | Estado | Evidencia | Riesgo |
|---|---|---|---|
| Schema oficial `fe-fex-v1.json` | Listo | Extraído y auditado en F3-C1 (`docs/dte-official/extracts/fex11-schema-analysis.md`, `fe-fex-v1.json`) | Bajo — puede quedar desactualizado si MH publica nueva versión |
| Prisma/schema (`SaleExportDetails`, `Customer` extranjero, `UnitOfMeasure.mh_unit_code`) | Listo | Migración aplicada en F3-C3; usada por builder y verificador local (F3-C8) | Bajo — estructura ya en uso real |
| Datos de exportación en base local | Confirmado | F3-C8: `UnitOfMeasure`, `Product`, `Customer` extranjero, `Sale`, `SaleExportDetails`, `DteOutgoingDocument` tipo 11 reales en local | Medio — solo verificado en local, no en remoto |
| Builder `generate-fex-json.service.ts` | Listo funcionalmente, con gaps de fórmula documentados | F3-C4/F3-C6/F3-C8; TODOs explícitos en el código (`noGravado`, `descuento`/`totalDescu`, `totalPagar`) | Medio — fórmulas no confirmadas contra ejemplos reales MH |
| AJV schema FEX 11 | Listo | Registrado en `validate-dte-json-schema.service.ts` (`SCHEMA_MAP["11"]`) y en `preview-fex-json.action.ts` | Bajo — válido contra AJV, no garantiza aceptación MH |
| Tributo C3 | Confirmado | F3-C5, usado como constante fija en el builder (§9 de `fex11-data-contract.md`) | Bajo |
| Fixture in-memory | Listo | `dev/verify-fex11-json.fixture.ts`, 3 escenarios (F3-C6) | Bajo |
| Prueba local con datos reales | Listo | `dev/verify-fex11-preview-local.ts` (F3-C8) | Medio — datos `FEX11_TEST_*` persistentes en local (ver Riesgo 12) |
| `previewFexJsonAction` | Listo, read-only, no conectado a UI | `actions/preview-fex-json.action.ts` (F3-C7) | Bajo — no persiste nada, pero duplica validación AJV (ver Riesgo 11) |
| Pipeline `createPendingDteForSale` | **Bloqueado** | `dte-outgoing.service.ts:13,40,45,48` — `DTE_MVP_TYPE_CODES` solo admite `"01"`/`"03"` | — |
| Persistencia `json_document` (flujo normal) | **No existe para tipo 11** | Equivalente FE/CCFE: `generate-fe-json-for-sale.action.ts` → `generateFeJsonForDte`; no existe análogo para FEX | — |
| `dte_status` → `SCHEMA_VALIDATED` (flujo normal) | Parcialmente listo | `validate-dte-json-schema.service.ts` ya acepta `"11"` en `SCHEMA_MAP`, pero nunca se alcanza porque no hay forma de llegar a `GENERATED` para tipo 11 fuera del preview | Bajo técnico, alto de proceso — pieza suelta sin conexión |
| Firma | **No probado** | Sin evidencia de firma FEX 11 | Alto si se activa sin pruebas |
| Transmisión | **Bloqueada** | `transmit-dte-document.service.ts:55` — `SUPPORTED_TYPE_CODES = {"01","03","05"}` | — |
| MariaDB delivery | **Bloqueada** | `build-external-dte-payload.service.ts:47,61` — `SUPPORTED_TYPES = {"01","03","05"}` | — |
| UI (`sale-dte-section.tsx`, `/dashboard/sales`) | **No implementada** | No hay captura de `SaleExportDetails` ni cliente extranjero en UI | Alto si se activa antes de validar captura completa |
| Dashboard outgoing (`dte-outgoing-filters-bar.tsx`) | Sin cambios | No filtra ni distingue tipo 11 | Bajo — no bloqueante |
| Support Session | No tocado | Fuera de alcance de F3-C0 a F3-C9 | — |

## 3. Qué ya se puede considerar listo

1. **Contrato de datos** (`fex11-data-contract.md`) — mapeo completo campo a campo contra el schema oficial, con gaps ya identificados y no ocultos.
2. **Tabla `SaleExportDetails`** — migrada, 1:1 con `Sale`, usada real por el builder y por el verificador local.
3. **Campos `Customer` extranjero** (`is_foreign`, `country_code`, `country_name`, `customer_person_type`) — migrados y validados por `buildFexJsonFromLoadedData` (líneas 375-396 de `generate-fex-json.service.ts`).
4. **`UnitOfMeasure.mh_unit_code`** — migrado, consumido por el builder para `uniMedida` (línea 469-472), con validación explícita de línea faltante.
5. **Builder `generateFexJsonForSale`** — separa función con efectos (I/O a Prisma) de función pura (`buildFexJsonFromLoadedData`), permitiendo probarla sin base de datos.
6. **Schema AJV tipo 11** — registrado y usado en dos puntos independientes (`validate-dte-json-schema.service.ts`, `preview-fex-json.action.ts`) sin errores de compilación.
7. **Tributo C3** — confirmado como constante de negocio fija para toda línea de exportación gravada (0%), sin depender de `tax_rate_snapshot`.
8. **Fixture in-memory** — 3 escenarios pasan sin tocar base de datos, evidencia de que el builder es correcto en aislamiento.
9. **Prueba local real** (F3-C8) — evidencia de que el builder funciona contra datos reales de PostgreSQL local, no solo contra fixtures sintéticos.
10. **`previewFexJsonAction`** — permite inspeccionar el JSON candidato y sus errores AJV desde servidor con sesión real, sin ningún efecto secundario, útil para seguir iterando sin riesgo.

## 4. Qué NO está listo

1. `createPendingDteForSale` bloquea tipo 11 explícitamente vía `DTE_MVP_TYPE_CODES` (`dte-outgoing.service.ts:40,45`).
2. No existe flujo oficial para reservar `DteOutgoingDocument` tipo 11 desde una venta fuera del verificador de desarrollo (F3-C8 lo hace con script directo a Prisma, no vía action de producto).
3. No se persiste `json_document` FEX 11 desde pipeline normal — no existe un `generateFexJsonForSaleAction` equivalente a `generateFeJsonForSaleAction`/`generateCcfeJsonForSaleAction`.
4. No se marca `SCHEMA_VALIDATED` tipo 11 desde flujo normal — `validate-dte-json-schema.service.ts` ya lo soportaría técnicamente, pero nunca se alcanza el estado `GENERATED` para tipo 11 por el punto anterior.
5. No hay UI para capturar `SaleExportDetails` (país, incoterms, régimen, recinto, seguro, flete, tipo de ítem exportado).
6. No hay UI de cliente extranjero especializada (`is_foreign`, `country_code`, `country_name`, `customer_person_type`).
7. No se ha probado firma FEX 11 — ningún signer se ha ejecutado contra un JSON tipo 11.
8. No se ha probado transmisión MH TEST FEX 11 — `transmit-dte-document.service.ts` bloquea el tipo explícitamente.
9. MariaDB bloquea tipo 11 — `build-external-dte-payload.service.ts` solo admite `"01"/"03"/"05"`.
10. No se ha probado aceptación real de Hacienda (ni siquiera en ambiente TEST) para tipo 11.
11. `previewFexJsonAction` fue verificado en F3-C8 con script directo (`verify-fex11-preview-local.ts`) leyendo Prisma sin pasar por `requireAdmin`/sesión real; falta una prueba desde un request HTTP/server-action real con sesión autenticada.

## 5. Riesgos principales

1. **Country code FEX no ISO** — `country_code` debe ser el catálogo MH/aduanero (~240 valores), no ISO alpha-2 como `Country.code`. No hay tabla de validación en base; el único control es AJV al momento de generar JSON, tarde en el flujo (`fex11-data-contract.md` §5).
2. **`UnitOfMeasure.mh_unit_code` faltante** — el seed actual solo cubre unidades mínimas; productos de exportación con unidad sin código MH bloquean la línea completa (`generate-fex-json.service.ts:469-472`).
3. **Fórmulas de resumen pendientes de confirmación fiscal** — `descuento` vs `totalDescu`, `totalPagar` vs `montoTotalOperacion` están marcadas `TODO FEX FORMULA REVIEW` en el propio builder (líneas 34-42, 624-633).
4. **`noGravado` por línea limitado a 0** — no hay caso de negocio confirmado para cargos/abonos no gravados; si aparece un caso real, el JSON generado hoy sería fiscalmente incorrecto sin que AJV lo detecte (AJV valida forma, no exactitud fiscal).
5. **`totalPagar` vs `montoTotalOperacion`** — hoy se asumen iguales; sin confirmación, un DTE real podría transmitirse con montos equivocados si se avanza a firma antes de resolver esto.
6. **`descuento` vs `totalDescu`** — mismo tratamiento hoy, semántica MH exacta no confirmada.
7. **MariaDB delivery acoplado a tipos 01/03/05** — `SUPPORTED_TYPES` en `build-external-dte-payload.service.ts` y `transmit-dte-document.service.ts` bloquean tipo 11 en dos puntos distintos; hay que tocar ambos, no solo uno.
8. **Validación AJV no garantiza aceptación MH** — AJV valida forma contra el schema JSON, no reglas de negocio fiscal que Hacienda pueda aplicar en su propio validador de aceptación.
9. **Activar UI antes de capturar todos los datos** puede generar DTEs con `SaleExportDetails` incompleto o cliente mal marcado como extranjero, fallando tarde en AJV en vez de en captura.
10. **Activar transmisión antes de validar persistencia local** puede ensuciar `dte_status`/correlativos si algo falla a mitad de camino en un flujo nunca antes ejercitado en producción.
11. **Duplicación temporal de validación AJV** — `preview-fex-json.action.ts` reimplementa su propia función `validateFexAjv` en vez de reusar `validate-dte-json-schema.service.ts`; mientras ambas existan, un cambio de schema o de configuración AJV (p. ej. `multipleOfPrecision`) hecho en una puede no reflejarse en la otra.
12. **Datos de prueba `FEX11_TEST_*` persistentes en base local** — el verificador de F3-C8 crea registros reales (`UnitOfMeasure`, `Product`, `Customer`, `Sale`, `SaleExportDetails`, `DteOutgoingDocument`) en PostgreSQL local; si no se limpian, pueden interferir con reportes, listados o pruebas futuras que no filtren por estos datos sintéticos.

## 6. Criterio de habilitación por etapas

### Etapa 1 — Generación controlada sin UI

Objetivo: habilitar internamente la creación/generación de JSON FEX 11 desde un pipeline controlado, sin UI, sin firma y sin transmisión.

Debe permitir:

```
Sale real
→ DteOutgoingDocument tipo 11
→ generateFexJsonForSale
→ validar AJV
→ persistir json_document
→ dte_status SCHEMA_VALIDATED
```

Debe seguir bloqueado: firma, transmisión, MariaDB, UI pública.

### Etapa 2 — UI interna/controlada

Objetivo: permitir seleccionar tipo 11 y capturar `SaleExportDetails` en UI, todavía sin transmisión automática.

Debe exigir: cliente extranjero, país MH, `customer_person_type`, unidad MH en líneas, `item_type_export`, incoterm si aplica, régimen/recinto si aplica, correo cuando `montoTotalOperacion >= 10000`.

### Etapa 3 — Firma MH TEST

Objetivo: firmar FEX 11 en ambiente TEST.

Debe estar probado antes: JSON persistido, AJV OK, datos reales, validaciones de negocio, estado DTE correcto.

### Etapa 4 — Transmisión MH TEST

Objetivo: transmitir FEX 11 a Hacienda TEST.

Debe estar probado antes: firma OK, ambiente TEST, token MH TEST, no transmisión PROD, interpretación ACCEPTED/OBSERVED/REJECTED.

### Etapa 5 — MariaDB delivery

Objetivo: permitir delivery externo tipo 11.

Debe estar probado antes: MH TEST acepta/observa/rechaza de forma controlada, payload externo genérico soporta `dte_type_code 11`, no asume NIT/NRC nacional, no asume IVA normal de FE/CCFE.

## 7. Recomendación de siguiente microfase

**Opción A** — F3-C10: habilitar generación controlada de JSON FEX 11 en pipeline, sin firma/transmisión.

**Opción B** — F3-C10: crear script local que use el flujo real para persistir `json_document` y `dte_status SCHEMA_VALIDATED` sin UI.

**Recomendación: Opción A.** Ambas opciones terminan tocando los mismos archivos (`create-pending-dte-for-sale.action.ts`/`dte-outgoing.service.ts`, un nuevo `generate-fex-json-for-sale.action.ts`), pero la Opción A construye la pieza real reutilizable como action de producto (mismo patrón ya usado en FE/CCFE), mientras que la Opción B produce un artefacto de desarrollo que luego habría que reescribir. Un script local no aporta valor adicional sobre lo que ya hizo el verificador de F3-C8 — ya se probó que `generateFexJsonForSale` funciona con datos reales; lo que falta ahora es la pieza de pipeline, no otra prueba aislada.

## 8. Gates técnicos que deben abrirse en F3-C10

Archivos identificados a modificar en F3-C10 (no tocados en esta microfase):

- `src/modules/commerce/dte/services/dte-outgoing.service.ts` — `DTE_MVP_TYPE_CODES` (línea 40 y comentario línea 13) debe ampliarse para admitir `"11"` en un flujo controlado (posiblemente un guard adicional, no simplemente agregar al arreglo compartido con FE/CCFE, para no exponerlo igual que el MVP).
- `src/modules/commerce/dte/actions/create-pending-dte-for-sale.action.ts` — actualmente delega en `createPendingDteForSale`; no necesita cambio propio si el guard vive en el service, pero su comentario de cabecera (línea 14) queda desactualizado y debe revisarse.
- **Nuevo archivo** `src/modules/commerce/dte/actions/generate-fex-json-for-sale.action.ts` — análogo a `generate-fe-json-for-sale.action.ts`/`generate-ccfe-json-for-sale.action.ts`, debe invocar `generateFexJsonForSale` (ya existe) y persistir `json_document` + `dte_status: "GENERATED"`.
- **Nuevo archivo o extensión de servicio** — se necesita una función tipo `generateFexJsonForDte` (paralela a `generateFeJsonForDte` en `generate-fe-json.service.ts`) que persista el resultado de `generateFexJsonForSale`; hoy `generate-fex-json.service.ts` solo construye y devuelve, no persiste (por diseño explícito, ver cabecera del archivo líneas 8-13).
- `src/modules/commerce/dte/services/validate-dte-json-schema.service.ts` — **no requiere cambios**, ya acepta `"11"` en `SCHEMA_MAP` (línea 57); una vez que exista `json_document` con `dte_status: GENERATED` para tipo 11, este servicio ya lo valida y marca `SCHEMA_VALIDATED` sin tocarlo.
- `src/modules/commerce/dte/actions/preview-fex-json.action.ts` — evaluar si conviene que reuse la validación AJV de `validate-dte-json-schema.service.ts` en vez de mantener `validateFexAjv` duplicada (Riesgo 11), sin cambiar su contrato read-only.

Puntos a documentar en F3-C10 (no en esta fase):

1. Dónde se bloquea tipo 11 hoy: `dte-outgoing.service.ts:40,45,48` (`DTE_MVP_TYPE_CODES`).
2. Qué enum/array hay que ampliar: `DTE_MVP_TYPE_CODES` en `dte-outgoing.service.ts`, y el `dte_type_code` aceptado por `createDteOutgoingDocumentDraftSchema` en `dte-issuer-config.schemas.ts` (línea 159) si ese schema restringe valores por Zod además del array de servicio.
3. Qué función debe llamar `generateFexJsonForSale`: una nueva acción de servidor (`generate-fex-json-for-sale.action.ts`) siguiendo el patrón de `generateFeJsonForSaleAction`.
4. Dónde se debe persistir `json_document`: dentro de la nueva función de servicio análoga a `generateFeJsonForDte`, no dentro de `generate-fex-json.service.ts` (que debe seguir siendo puro/sin efectos, por diseño F3-C4).
5. Dónde se debe cambiar `dte_status` a `SCHEMA_VALIDATED`: ya cubierto sin cambios por `validate-dte-json-schema.service.ts`.
6. Cómo evitar que firma/transmisión acepten tipo 11 todavía: no tocar `SUPPORTED_TYPE_CODES` en `transmit-dte-document.service.ts` (línea 55) ni el signer — deben seguir excluyendo `"11"` explícitamente.
7. Qué pruebas hay que correr: fixture in-memory, verificador local (ahora contra el flujo real, no un script de desarrollo), `npx tsc --noEmit`, regresión manual de creación de DTE tipo 01/03 para confirmar que `DTE_MVP_TYPE_CODES` ampliado no afloja validaciones existentes.

## 9. Gates que NO deben abrirse todavía

1. No habilitar botón UI para tipo 11 todavía.
2. No habilitar transmisión tipo 11 todavía.
3. No habilitar MariaDB tipo 11 todavía.
4. No habilitar Support Session FEX 11 todavía.
5. No habilitar producción.
6. No tocar invalidación.
7. No tocar NC.
8. No tocar FSE 14.
9. No tocar FE/CCFE salvo gates mínimos compartidos (p. ej. si `DTE_MVP_TYPE_CODES` se amplía, confirmar que el cambio no afloja ninguna validación existente de FE/CCFE).

## 10. Checklist antes de F3-C10

```
[ ] Confirmar archivo exacto que genera JSON FE/CCFE y persiste json_document:
    generate-fe-json-for-sale.action.ts → generateFeJsonForDte (generate-fe-json.service.ts);
    generate-ccfe-json-for-sale.action.ts → generateCcfeJsonForDte (generate-ccfe-json.service.ts).
[ ] Confirmar estados permitidos para generar JSON (PENDING_GENERATION → GENERATED).
[ ] Confirmar si DteOutgoingDocument tipo 11 puede crearse manual/controlado sin exponerlo igual que FE/CCFE MVP.
[ ] Confirmar que firma/transmisión seguirán bloqueando tipo 11 (SUPPORTED_TYPE_CODES en transmit-dte-document.service.ts).
[ ] Confirmar que UI seguirá bloqueando tipo 11 (sale-dte-section.tsx, dte-outgoing-filters-bar.tsx sin cambios).
[ ] Confirmar que MariaDB seguirá bloqueando tipo 11 (SUPPORTED_TYPES en build-external-dte-payload.service.ts).
[ ] Confirmar que la prueba local FEX11_TEST sigue pasando.
[ ] Confirmar que el fixture in-memory sigue pasando.
[ ] Confirmar tsc sin errores.
[ ] Confirmar que no se toca producción.
```

## 11. Checklist antes de UI

```
[ ] Formulario captura Customer extranjero.
[ ] Formulario captura SaleExportDetails.
[ ] Valida país MH.
[ ] Valida tipo persona.
[ ] Valida unidad MH en cada producto.
[ ] Valida item_type_export.
[ ] Valida régimen/recinto condicional.
[ ] Valida incoterms.
[ ] Valida correo >= 10000.
[ ] Muestra errores claros.
[ ] No rompe FE/CCFE.
```

## 12. Checklist antes de firma/transmisión

```
[ ] JSON FEX persistido.
[ ] AJV OK.
[ ] signed_jws null antes de firma.
[ ] Ambiente TEST.
[ ] Signer probado con tipo 11.
[ ] MH TEST recibe tipo 11.
[ ] Se interpretan observaciones/rechazos.
[ ] No se transmite PROD.
[ ] retry_count correcto.
[ ] logs correctos.
```

## 13. Checklist antes de MariaDB

```
[ ] build-external-dte-payload soporta tipo 11.
[ ] No asume receptor nacional.
[ ] No exige NRC.
[ ] No asume IVA normal.
[ ] Persiste json_document completo.
[ ] Persiste tipo DTE 11.
[ ] Persiste sello/estado si aplica.
[ ] No rompe delivery 01/03/05.
```

## 14. Decisión final

**GO para F3-C10** si el objetivo es generación controlada de JSON FEX 11 en pipeline real, sin firma ni transmisión ni UI pública (Opción A de la Sección 7).

**NO-GO para UI** — no capturar `SaleExportDetails`/cliente extranjero en pantalla hasta cerrar Etapa 1.

**NO-GO para firma/transmisión** — no tocar `transmit-dte-document.service.ts` ni ningún signer hasta cerrar Etapas 1 y 2, y hasta resolver los gaps de fórmula del builder (Sección 5, puntos 3, 5, 6).

**NO-GO para MariaDB** — no tocar `SUPPORTED_TYPES` en `build-external-dte-payload.service.ts` hasta cerrar Etapa 4.

**NO-GO para producción** — cualquier prueba de firma/transmisión debe ocurrir exclusivamente en ambiente TEST.

## 15. Validaciones

```
npx prisma validate
npx tsc --noEmit
npx tsx src/modules/commerce/dte/dev/verify-fex11-json.fixture.ts
```

Opcional, solo si `DATABASE_URL` es local y `FEX11_LOCAL_TEST=YES`:

```
npx tsx src/modules/commerce/dte/dev/verify-fex11-preview-local.ts
```

---

## Impacto en bases de datos y sincronización local/remota

- **Schema tocado**: ninguno. `prisma/schema.prisma` no fue modificado en esta microfase.
- **Migración generada**: ninguna.
- **Base aplicada**: ninguna — no se ejecutó `prisma migrate` ni `prisma db push` contra `DATABASE_URL` ni `DIRECT_URL`.
- **Alineación local/remoto**: sin cambios — no se vio afectada, ya que no hubo cambios de schema en esta microfase.
- **Pendiente**: F3-C9 es solo documentación; no requiere ninguna acción de sincronización de bases de datos.
