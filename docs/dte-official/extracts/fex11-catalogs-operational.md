# FEX 11 — Integración de catálogos al sistema central (Microfase F3-C23)

Fuente: **Catálogo - Sistema de Transmisión v1.2**.

## Qué cambió

Antes de esta microfase, FEX 11 leía sus catálogos MH desde un archivo
TypeScript local (`src/modules/commerce/sales/export/utils/fex-catalogs.ts`),
con arreglos hardcodeados de INCOTERMS, régimen, recinto fiscal, país y tipo
de persona. Ese archivo no era la fuente central de catálogos DTE del
proyecto — el proyecto ya tenía esa infraestructura (`DteCatalogItem`), pero
FEX 11 no la usaba para estos códigos todavía.

A partir de F3-C23, **el sistema central de catálogos DTE es la única
fuente** para estos códigos. `fex-catalogs.ts` solo conserva lo que no es un
catálogo MH cargable (el enum `tipoItemExpor` del schema oficial y la
constante de tributo `C3`, cuya existencia real igual se valida contra
CAT-015).

## Infraestructura reutilizada (sin cambios de schema)

- Modelo `DteCatalogItem` (`prisma/schema.prisma`) — catálogo global sin
  `tenant_id`, único por `(catalog_code, item_code, version)`.
- Query `listDteCatalogItems({ catalog_code })`
  (`src/modules/commerce/dte/queries/list-dte-catalog-items.ts`).
- Endpoint `GET /api/dte/catalogs?catalog_code=CAT-XXX`
  (`src/app/api/dte/catalogs/route.ts`).
- Seed CLI `prisma/seeds/seed.dte-catalog-items.ts` (idempotente, upsert).
- Seed runner de plataforma
  `src/modules/platform/lib/seed-runners/dte-catalog-items-runner.ts`
  (usado por el flujo de aprovisionamiento de bases cliente).

No se creó ningún modelo, tabla ni migración nueva. No se tocó
`schema.prisma`.

## Catálogos FEX 11 integrados

| Catálogo | Código | Estado | Detalle |
|---|---|---|---|
| CAT-014 Unidad de medida | — | Ya integrado (no es `DteCatalogItem`) | Se valida contra `UnitOfMeasure.mh_unit_code`. No se duplica en FEX. |
| CAT-015 Tributos | `C3` | Subset operativo | Solo el tributo fijo usado por toda línea FEX 11. |
| CAT-016 Condición de operación | 1, 2, 3 | Ya integrado (reusado, sin cambios) | Compartido con FE/CCFE. |
| CAT-017 Forma de pago | 01–99 | Ya integrado (reusado, sin cambios) | Compartido con FE/CCFE. |
| CAT-020 País | `9540` | Subset operativo | Solo el país confirmado ACCEPTED en MH TEST. |
| CAT-022 Tipo de documento del receptor | 00, 02, 03, 13, 36, 37 | Ya integrado + se agregó `36` NIT | `36` faltaba y es requerido por FEX 11 (receptor con NIT). La UI de FEX excluye `00` (Consumidor final no aplica a receptor extranjero). |
| CAT-027 Recinto fiscal | 01–99 (46 ítems) | Catálogo completo | Lista completa provista por la fuente v1.2. |
| CAT-028 Régimen | `EX-1.1000.000` | Subset operativo | Solo el régimen confirmado ACCEPTED en MH TEST. |
| CAT-029 Tipo de persona | 1, 2 | Catálogo completo (valores fijos del schema oficial) | `1` disponible pero no probado; `2` confirmado ACCEPTED. |
| CAT-031 INCOTERMS | `09` | Subset operativo | Solo el INCOTERM confirmado ACCEPTED en MH TEST. |

"Subset operativo" = no es el catálogo MH completo — son los valores ya
verificados o mínimos necesarios para operar. Ampliarlos requiere confirmar
cada código nuevo contra el PDF oficial (Catálogo - Sistema de Transmisión
v1.2), no inventar valores. `CAT-027` y `CAT-029` sí quedaron completos
porque la fuente los listaba en su totalidad.

## Cómo se cargan en bases nuevas / clientes futuros

Mismo mecanismo que el resto de catálogos DTE (CAT-001, CAT-002, CAT-016,
CAT-017, CAT-018, CAT-022, CAT-024):

1. **Seed CLI directo**: `npx tsx prisma/seeds/seed.dte-catalog-items.ts`
   (upsert idempotente — seguro de re-ejecutar).
2. **Aprovisionamiento de bases cliente**: el runner
   `runDteCatalogItemsSeed()` en
   `src/modules/platform/lib/seed-runners/dte-catalog-items-runner.ts` ya
   incluye las mismas filas y se invoca vía
   `run-database-profile-dte-catalog-seed.action.ts` desde el panel de
   plataforma (mismo flujo ya usado para los catálogos base).

A propósito **no se agregaron los códigos FEX** (`CAT-015`, `CAT-020`,
`CAT-027`, `CAT-028`, `CAT-029`, `CAT-031`) a `REQUIRED_DTE_CATALOG_CODES` /
`REQUIRED_DTE_CATALOGS`: esas listas son BLOCKER para *todo* tenant, y FEX 11
es una funcionalidad controlada por feature flag
(`DTE_FEX11_ENABLED` / `DTE_FEX11_TEST_ENABLED`), no un módulo de
plataforma activado por defecto. Bloquear el preflight general de una base
sin FEX 11 por catálogos que no usa sería incorrecto.

## Preflight

Se agregó un check nuevo en `database-preflight.ts`:
`GLOBAL_FEX11_CATALOG_ITEMS` — severidad **WARNING** (no BLOCKER), verifica
que los 6 catálogos FEX (CAT-015, CAT-020, CAT-027, CAT-028, CAT-029,
CAT-031) tengan al menos un ítem activo. Si faltan, el preflight general
sigue en estado `PARTIAL` (no `NOT_READY`), y el remediation apunta al mismo
seed.

## Cómo lo consume `/dashboard/sales/export`

`src/app/(dashboard)/dashboard/sales/export/page.tsx` (server component) hace
`listDteCatalogItems` para los 8 catálogos que usa la pantalla (CAT-016,
CAT-017, CAT-020, CAT-022, CAT-027, CAT-028, CAT-029, CAT-031) y los pasa
como props (mismo patrón que ya existía para CAT-016/CAT-017), bajando por
`ExportSalePage` → `ExportSaleWorkspace` → `ExportTopBar` /
`ExportFiscalModal` / `ExportCustomerModal`.

Todos los selects fiscales (INCOTERM, Régimen, Recinto fiscal, País, Tipo de
persona, Tipo de documento del receptor) son `<select>` poblados desde estos
catálogos — no hay inputs libres para códigos fiscales. El usuario ve el
label (`item_label`); el sistema guarda el código (`item_code`).
`descIncoterms` se deriva automáticamente del catálogo al elegir el código
(`ExportFiscalModal`), igual que el nombre de país al elegir `country_code`
(`ExportCustomerModal`).

## Validación server-side agregada

- `fex-validation.ts::validateExportSaleBusinessRules` — ahora recibe los
  ítems de CAT-027/CAT-028/CAT-031 ya cargados y valida contra ellos (antes
  usaba arreglos hardcodeados en `fex-catalogs.ts`).
- `fex-validation.ts::validateForeignCustomerCatalogs` (nuevo) — valida
  `country_code` contra CAT-020, `customer_person_type` contra CAT-029 e
  `id_type_code` contra CAT-022 antes de crear el cliente extranjero.
- `export-sale.service.ts::createExportSale` — carga CAT-027/028/031/015
  antes de validar, y bloquea la creación si CAT-015 no tiene el ítem `C3`
  cargado (guardia de integridad de catálogo).
- `export-sale.service.ts::createForeignCustomer` — carga CAT-020/022/029 y
  llama a `validateForeignCustomerCatalogs` antes de insertar.

## Cómo validar manualmente

1. Confirmar que el seed está cargado:
   `npx tsx prisma/seeds/seed.dte-catalog-items.ts` (o vía panel de
   plataforma → aprovisionamiento → catálogos DTE).
2. Con `DTE_FEX11_TEST_ENABLED=YES` (o `DTE_FEX11_ENABLED=YES`) fuera de
   producción, abrir `/dashboard/sales/export`.
3. Verificar que los selects de "Datos fiscales FEX 11" (INCOTERM, Régimen,
   Recinto fiscal) y del modal de receptor extranjero (País, Tipo de
   persona, Tipo de documento) muestran las opciones cargadas desde catálogo
   — no texto libre.
4. Cambiar el INCOTERM y confirmar que el label mostrado en la barra
   operativa (`export-top-bar.tsx`) y el resumen coinciden con el catálogo.
5. Crear un cliente extranjero nuevo y confirmar que el nombre de país se
   autocompleta al elegir el código.
