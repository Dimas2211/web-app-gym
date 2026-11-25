# Fase 5.1A / 5.1B: catálogos versionados e incidencias territoriales

Fecha: 2026-11-24 · `BLOQUE_5_1A_PASS` · `BLOQUE_5_1B_PASS` (las incidencias externas quedan aisladas)

## 1. Persistencia: no requiere migración

`DteCatalogItem` ya tenía `@@unique([catalog_code, item_code, version])` y `version` con default `"1"`. Las filas V1.2 (`version "1"`) y las 2.0 (`version "2.0"`) **coexisten sin migración**. M1 no se tocó.

El problema estaba en las consultas, que no filtraban por versión, y en las limpiezas del seed 1.2.

## 2. Resolución por perfil

Fuente única: `src/modules/commerce/dte/spec/dte-catalog-version.ts`.

| Perfil | Catálogo con contenido 2.0 (CAT-002, 017, 024, 028, 033) | Catálogo sin cambios de códigos en 2.0 |
|---|---|---|
| MH_1_2 (default) | `version "1"` | `version "1"` |
| MH_2_0 | `version "2.0"` | `version "1"` (decisión explícita, no fallback implícito) |

`MH_1_2` **nunca** resuelve `"2.0"`, por lo que los códigos 2.0 (CAT-017 11 Bitcoin, CAT-028 `cccc.ccc`, CAT-033) no pueden aparecer en flujos 1.2.

## 3. Consumidores actualizados

| Consumidor | Cambio |
|---|---|
| `commerce/dte/queries/list-dte-catalog-items.ts` | `where` = `dteCatalogWhere(catalog_code, spec_profile)`; `spec_profile` opcional (default MH_1_2) |
| Selectores de venta (`sales/new`, `sales/export`), `export-sale.service.ts` (validación CAT-015/022/027/028/029/031) | Sin cambios de código: heredan MH_1_2 al consultar con la versión filtrada. Los códigos 1.2 de CAT-017/002/024 son un subconjunto de los 2.0, así que el selector 1.2 es seguro (fail-safe) aunque el emisor esté en 2.0 |
| `app/api/dte/catalogs/route.ts` | `spec_profile` opcional; `MH_2_0` → 409 con el interruptor global apagado; valor inválido → 400 |
| `platform/actions/get-support-sale-form-data.action.ts` (CAT-017 directo) | Filtro `version "1"` |
| `platform/lib/database-preflight.ts` (conteos de catálogos requeridos y FEX) | Filtro `version "1"`: las filas 2.0 no pueden hacer pasar un preflight 1.2 |
| `platform/lib/seed-runners/dte-catalog-items-runner.ts` (onboarding) | Dry-run y `totalAfter` limitados a `version "1"`; **limpieza FEX11 limitada a `version "1"`** |
| `prisma/seeds/seed.dte-catalog-items.ts` | **Limpieza FEX11 limitada a `version "1"`** |

Defecto evitado: la limpieza FEX11 (`deleteMany … item_code notIn`) no filtraba por versión. La primera ejecución del seed 1.2 después de sembrar 2.0 habría **borrado las 90 filas CAT-028 2.0** (`cccc.ccc` ∉ códigos `EX-n…`). Hay una prueba de integración que lo cubre.

Conteos informativos sin filtro (`get-client-view-data`, `inspect-database-profile`, `get-support-session-data`): muestran el total de filas y no son decisiones. Tras sembrar 2.0, el total sube en 122.

Builders, validadores fiscales y configuración del emisor no consultan `DteCatalogItem` (usan códigos fijos o el modelo `Municipality`/`Country`), por lo que no requieren cambios.

## 4. Seed 2.0

`prisma/seeds/seed.dte-catalog-items-mh20.ts` (`seedDteCatalogItemsMh20`):
- upsert por `(catalog_code, item_code, "2.0")`; nunca crea, actualiza ni elimina filas `"1"`; nunca elimina filas 2.0;
- idempotente: la segunda ejecución da `created 0 / updated 0 / unchanged 122`;
- **fuera** del seed por defecto y del onboarding; la CLI exige `MH20_CATALOG_SEED_CONFIRM=<nombre exacto de la base>`.

Dataset: `prisma/seeds/data/dte-catalog-items-mh20.data.ts` (de Fase 5): 13 + 12 + 3 + 90 + 4 = 122 filas.

## 5. Verificación en base desechable

`zolvi_mh20_51a_scratch_<ts>` en localhost:5432. Destino verificado (host local y nombre `_scratch_`), migraciones aplicadas con `migrate deploy` y base eliminada al final. Prueba: `spec/dte-catalog-version.integration.test.ts` (9/9):

1. Solo 2.0 sembrado → el onboarding 1.2 sigue informando CAT-002/CAT-017 como faltantes; CAT-017 1.2 vacío.
2. Seed 1.2 posterior → las 122 filas 2.0 siguen ahí.
3. Seed 2.0 repetido → idempotente; snapshot V1.2 idéntico tras repetir 2.0 y 1.2.
4. CAT-017: 1.2 sin "11", 2.0 con 12 códigos.
5. CAT-028: 1.2 solo `EX-n…`, 2.0 solo `cccc.ccc` (90).
6. CAT-033: no existe en 1.2; en 2.0 incluye `" TA-1"` literal.
7. CAT-016 (sin cambios) → mismas filas en ambos perfiles.
8. Unicidad: duplicar `(CAT-017, 11, 2.0)` → P2002; `(CAT-017, 01)` existe en las dos versiones.
9. El conteo tipo preflight cuenta solo V1.2.

## 6. Incidencias de catálogo y territorio (5.1B)

Contrastadas con `originales/Catálogos - Facturación Electrónica.xlsx`, Hoja1:

| Incidencia | Evidencia (fila del Excel) | Clasificación | Tratamiento |
|---|---|---|---|
| **CAT-INC-001** Cabañas | A398 `10 CABAÑAS ESTE`, A399 `11 CABAÑAS OESTE` (V1.2: 10 = OESTE, 11 = ESTE) | **Ambigua**: contradicción entre fuentes oficiales | Error explícito `CAT_INC_001_CABANAS` en toda operación 2.0: FE/CCF/NC/FSE (ya existía) y **FEX con MH_2_0** (nuevo: `mh20TerritoryAmbiguityError`). MH_1_2 sin cambios. El dry-run lo marca `AMBIGUOUS` con el id del registro. |
| **CAT20-297** Ciudad Delgado | A174 `19 CIUDAD DELGADO`, en el bloque de San Salvador (A169 `14 SAN SALVADOR` … A175 `01 CANDELARIA`, inicio de Cuscatlán) | **No ambigua**: clave `06\|19` EXACTA; solo cambia la etiqueta | Proyecta `06 / 23 (SAN SALVADOR CENTRO) / 19` en ambos perfiles; `REVIEW_LABEL` informativo, no bloquea |
| **CAT-INC-003** CAT-008 sin columna de departamento | Bloque A57… sin departamento; la jerarquía se infiere por orden | Incertidumbre estructural | Zolvi no usa el Excel para la jerarquía: deriva el distrito de `Municipality.district_code`, que la valida (`dept ⊂ municipio ⊂ distrito`), y falla cerrado ante inconsistencias |
| **CAT-INC-004** CAT-033 `" TA-1"` | A1907 `' TA-1'` (U+0020 inicial) | Código oficial con espacio | Se conserva literal, sin normalizar (hay prueba sobre el carácter). No es utilizable: FEX de bienes sigue bloqueada |
| **CAT-028** equivalencias | 56 retirados `EX-n.cccc.ccc`; 51 con candidato (`posible_equivalente_2_0`), 5 sin candidato (CAT20-555/557/558/559/563, descripción distinta aunque el sufijo exista) | No confirmadas | Ninguna equivalencia se activa. El dry-run lista `SaleExportDetails.regime_code` como `CAT028_PENDING_EQUIVALENCE` / `CAT028_NO_CANDIDATE` (solo informa) |
| **CAT-INC-005 / CAT-INC-006** | No existen en el registro de Fase 3 (solo CAT-INC-001 a 004) | — | El informe de Fase 5 los confundió con INC-003 a INC-006 (normativos: FEX v2/v3, plazos y fecha de invalidación, contingencia 3/4), que siguen en el registro de perfiles (`pendingConfirmation` o `blocked`) |
| CAT-INC-002 | Excel titulado "V 1.1" | Documental | Sin efecto en el código |

### Dry-run territorial actualizado (`prisma/scripts/mh20-territory-dry-run.ts`)

- `byStatus`: `COMPATIBLE`, `REVIEW`, `AMBIGUOUS`, `INCOMPATIBLE`, `NO_ADDRESS`; cada fallo lleva `status` y el id del registro.
- `cat028`: hallazgos sobre `SaleExportDetails.regime_code`.
- Solo lectura; exige `MH20_TERRITORY_DRY_RUN=YES`. **No se ejecutó contra ninguna base real**. Se probó con fixtures: las 262 filas de `Municipality` dan 0 `INCOMPATIBLE`, solo Cabañas sale `AMBIGUOUS` y solo `06|19` en revisión.
