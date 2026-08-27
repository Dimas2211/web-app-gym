# FEX 11 — Integración de catálogos al sistema central

Fuente: **Catálogo - Sistema de Transmisión v1.2** — el PDF y su versión
estructurada en Excel SÍ están en el repositorio, en
`database/catalogs/Catálogo - Sistema de Transmisión (1).pdf` y
`database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx` (no se
encontraron en el primer intento de F3-C23B por estar fuera de `docs/`; la
segunda pasada de esta misma microfase los localizó y son la fuente real de
todo lo que sigue).

## 🔴 HALLAZGO CRÍTICO — acción requerida antes de usar FEX 11 comercialmente con países distintos al ya probado

Corregir CAT-020 para usar los códigos ISO alpha-2 reales del catálogo v1.2
(`US`, `SV`, `GT`...) expuso una **inconsistencia real en el schema JSON
local** usado para validar FEX 11 antes de transmitir:

- `src/modules/commerce/dte/schemas/mh/fex-11.schema.json` (copia literal de
  `fe-fex-v1.json` del ZIP oficial `docs/dte-official/raw/svfe-json-schemas.zip`)
  define `receptor.codPais` como un **enum cerrado de 275 códigos numéricos
  de 4 dígitos** (p. ej. `"9540"`) — **no contiene ningún código alfabético**.
- El catálogo oficial v1.2 (Excel/PDF reales, fuente de mayor autoridad que
  el ZIP de schemas, que puede ser una versión más vieja) usa códigos ISO
  alpha-2 de 2 letras.
- `generateFexJsonForSaleAction` (la action real detrás del botón "Generar
  JSON" en `/dashboard/sales/export`) llama a `validateDteJsonSchema` (AJV)
  contra ese mismo `fex-11.schema.json` antes de permitir avanzar a
  `SCHEMA_VALIDATED`.

**Consecuencia**: con la corrección de catálogo de esta fase, un cliente
extranjero nuevo creado con país = `US` (o cualquier código ISO alpha-2) se
crea sin problema, pero **al intentar generar el JSON DTE, la validación AJV
local rechazará `codPais: "US"`** porque no está en el enum viejo del
schema — bloqueando el flujo antes de llegar a Hacienda.

**No se corrigió el schema en esta fase** — es un cambio de mayor alcance
(determinar si el campo debe dejar de tener `enum` fijo, o si hay que
reemplazar la lista completa, y confirmar contra una fuente autorizada que
la corrección no rompa nada más del schema) y no estaba en el objetivo de
esta microfase (catálogos, no schemas JSON de validación). Mientras tanto,
el caso histórico ACCEPTED (`codPais: "9540"`) sigue siendo válido porque
9540 sigue en el enum viejo — pero ya no se puede seleccionar 9540 desde la
UI (el país mostrado ahora es el catálogo real), así que **ninguna venta de
exportación nueva podrá completarse hasta resolver esta inconsistencia**,
salvo que se reintroduzca manualmente un código del enum viejo — algo que
no se hizo porque sería reintroducir el mismo problema original.

---

## 🔴 F3-C23C — Reconciliación CAT-020 vs schema FEX (veredicto final: Opción C, bloqueo)

Microfase dedicada a resolver el hallazgo crítico de arriba. Evidencia
verificada de primera fuente antes de tocar código:

1. **`fex-11.schema.json` NO está "desactualizado" respecto al ZIP oficial**:
   es una copia byte a byte de `fe-fex-v1.json` dentro de
   `docs/dte-official/raw/svfe-json-schemas.zip` (verificado con `diff`).
   Ese ZIP no trae ninguna versión más nueva del schema FEX — solo existe
   una copia de `fe-fex-v1.json`, fechada **14/03/2023** en el propio ZIP.
2. **El catálogo Excel oficial v1.2 es más reciente**: su hoja de control
   de versiones (página 1 del PDF) muestra `1.0 → 12/2022`, `1.1 → 08/2024`,
   `1.2 → 10/2025`. La entrada de cambios de la versión 1.1 dice
   textualmente *"CAT-020 País. Cambio: 249, se elimina: 33, nuevo: 7"* —
   es decir, el MH migró CAT-020 a ISO alpha-2 **después** de publicar el
   schema JSON de 2023, y nunca se republicó un schema FEX nuevo (al menos
   no dentro de este repositorio).
3. **Confirmado por lectura directa del Excel** (`openpyxl`, hoja única
   "Hoja1", fila 1168 en adelante): CAT-020 tiene 249 filas, todas de 2
   caracteres, código `US` = "Estados Unidos" (fila 1236). Coincide
   exactamente con el PDF (página 42).
4. **Confirmado por lectura directa del schema** (`fex-11.schema.json`,
   `receptor.codPais.enum`): 275 códigos numéricos de 4 dígitos, incluye
   `"9540"`, no incluye `"US"` ni ningún código alfabético.

**Veredicto: contradicción real entre dos fuentes oficiales del MH que no
se puede resolver localmente** (no hay una versión más nueva del schema en
el repo, y no hay forma de confirmar sin acceso al ambiente TEST del MH
si su validador de recepción real ya acepta ISO alpha-2 o sigue exigiendo
el enum de 2023). Se aplica **Opción C** de las tres planteadas para esta
microfase:

- **Se bloquea la operación comercial de FEX 11** para cualquier país cuyo
  `country_code` (ISO alpha-2, catálogo `Country`/CAT-020 v1.2) no esté en
  el enum de `fex-11.schema.json`. El bloqueo vive en
  `generate-fex-json.service.ts` (`FEX_COD_PAIS_SCHEMA_ENUM`, derivado del
  propio JSON del schema — no una lista duplicada a mano) y actúa **antes**
  de construir el JSON, devolviendo un error explícito en vez de dejar que
  falle tarde en AJV con un mensaje críptico.
- Como el enum del schema no contiene ningún código ISO alpha-2, esto
  bloquea **toda** venta de exportación nueva desde la UI real hasta que se
  resuelva la contradicción — coherente con "no permitir Generar JSON con
  datos que AJV rechazará".
- El único camino que sigue validando es el **regresivo/histórico**: el
  fixture dev (`verify-fex11-json.fixture.ts`) sigue probando el código
  numérico legado `9540` en aislado (Escenarios A/B/C) para confirmar que
  el schema/builder no se rompieron, dejando explícito en comentarios que
  `9540` **no es CAT-020 oficial**. El fixture añade un Escenario D que
  prueba el valor **real** que guarda hoy la UI (`US`) y espera que el
  builder lo bloquee — así queda demostrado que UI, validación
  server-side y AJV están alineados (los tres rechazan `US` mientras el
  schema no lo soporte; ninguno lo acepta "a medias").
- **No se tocó CAT-020** (sigue siendo el catálogo oficial real, ISO
  alpha-2, modelo `Country`) ni se disfrazó `9540` como si perteneciera a
  él.

**Para desbloquear en el futuro**: se necesita una fuente MH más autoritativa
que confirme (a) que el ambiente TEST/PROD del MH ya valida `codPais` ISO
alpha-2 para FEX 11, o (b) una versión más nueva de `fe-fex-v1.json`
publicada por el MH con el enum actualizado. Cualquiera de las dos
resolvería la Opción A (reemplazar el schema) sin necesidad de mantener
este bloqueo.

---

## 🟢 F3-C23D — Restauración de transmisión FEX 11 (versión actual, sin migrar a FEX v3)

El Ministerio publicó en **julio 2026** schemas nuevos (FEX ahora aparece
como **v3**, con `receptor.codPais` alineado a CAT-020 ISO). **Esa
migración general de schemas NO se hace en esta fase** — queda para una
fase futura dedicada. Esta microfase corrige únicamente que la versión
**actual** (schema local `fex-11.schema.json`, FEX v1) quede sin ninguna
forma de transmitir, que era el efecto colateral del bloqueo de F3-C23C:
correcto en el bloqueo, pero incompleto porque no daba ninguna vía real
de operación.

### Qué se hizo

- **No se tocó `fex-11.schema.json`.** No se migró `dteTypeCodeToVersion("11")`
  a 3. No se tocó FE/CCFE/NC/Invalidación/FSE.
- **No se tocó CAT-020** (`Country`, ISO alpha-2, 250 activos, `US` =
  "Estados Unidos" sigue cargado). Sigue siendo el catálogo país oficial
  vigente del sistema para todo lo que no sea `receptor.codPais` de FEX
  11 v1.
- Se agregó un catálogo de **compatibilidad** nuevo y separado:
  `catalog_code = "FEX-11-V1-CODPAIS"` (NO "CAT-020", nunca se documenta
  como catálogo oficial v1.2). Vive en `DteCatalogItem`, igual que
  CAT-027/028/029/030/031, y se genera **programáticamente** desde el
  enum real `receptor.codPais` de `fex-11.schema.json` (275 códigos) —
  ver `prisma/seeds/data/fex11-catalog-rows.ts`. Así nunca se
  desincroniza a mano del enum que valida AJV.
- De esos 275 códigos, el repo solo tiene una fuente confiable para el
  nombre de **uno**: `9540 = Estados Unidos`, confirmado porque fue la
  única transmisión FEX 11 ACCEPTED en MH TEST hasta la fecha. El resto
  queda con un label conservador `"Código país FEX v1 <código>"` — no se
  inventan nombres oficiales sin fuente.
- `/dashboard/sales/export` (modal de receptor extranjero) deja de usar
  el combobox de CAT-020/`Country` para el campo país y pasa a usar un
  combobox sobre `FEX-11-V1-CODPAIS`. El sistema ya no guarda
  `country_code = "US"` para clientes de exportación nuevos — guarda
  `country_code = "9540"` para Estados Unidos.
- La guardia `FEX_COD_PAIS_SCHEMA_ENUM` en `generate-fex-json.service.ts`
  (F3-C23C) **se mantiene sin eliminar** — sigue bloqueando cualquier
  `country_code` fuera del enum del schema (p. ej. datos heredados de
  antes de esta fase, o "US" si llegara por cualquier otra vía). No hace
  mapping silencioso ISO → numérico. El mensaje de error ahora distingue
  explícitamente si el valor bloqueado "tiene forma" de código CAT-020
  (2 letras) para orientar al usuario hacia el catálogo correcto.
- `validateForeignCustomerCatalogs` (`fex-validation.ts`) y
  `createForeignCustomer` (`export-sale.service.ts`) validan
  `country_code` contra `FEX-11-V1-CODPAIS` (vía `listDteCatalogItems`),
  ya no contra `getCountries()`/CAT-020.
- `verify-fex11-json.fixture.ts` prueba exactamente lo mismo que la UI:
  Escenarios A/B/C con `9540` (código real que guarda hoy la UI, no un
  valor de regresión aislado) y Escenario D con `US` (CAT-020 ISO, que la
  UI ya no ofrece para este campo) esperando bloqueo explícito.

### Qué NO se hizo (fuera de alcance a propósito)

- No se migró FEX a v3.
- No se actualizaron los demás schemas nuevos de julio 2026.
- No se tocó `schema.prisma` ni se crearon migraciones — `FEX-11-V1-CODPAIS`
  reutiliza el modelo `DteCatalogItem` ya existente.
- No se firmó, transmitió ni entregó a MariaDB durante esta implementación.

### Estado de catálogos tras F3-C23D

| Catálogo | Ítems | Nota |
|---|---|---|
| CAT-020 País (`Country`, ISO alpha-2) | 250 activos | Sin cambios — sigue siendo el catálogo país oficial del sistema. NO se usa para `receptor.codPais` de FEX 11 v1. |
| **FEX-11-V1-CODPAIS** (nuevo) | **275** | Catálogo de compatibilidad, códigos numéricos legados derivados del enum del schema. Solo `9540` tiene nombre confirmado (Estados Unidos); el resto usa label conservador. |
| CAT-027 Recinto fiscal | 46 | Sin cambios — completo. |
| CAT-028 Régimen | 56 | Sin cambios — completo. |
| CAT-029 Tipo de persona | 2 | Sin cambios — completo. |
| CAT-030 Transporte | 6 | Sin cambios — completo. |
| CAT-031 INCOTERMS | 11 | Sin cambios — completo. |

### Cómo probar manualmente (F3-C23D)

1. `npx tsx prisma/seeds/seed.dte-catalog-items.ts` (carga/actualiza
   `FEX-11-V1-CODPAIS` junto con el resto de catálogos FEX 11).
2. Con `DTE_FEX11_TEST_ENABLED=YES` fuera de producción, abrir
   `/dashboard/sales/export`.
3. Modal receptor extranjero → "Crear cliente nuevo" → País (FEX v1):
   combobox buscable sobre `FEX-11-V1-CODPAIS`; buscar "Estados Unidos"
   y confirmar que selecciona el código `9540`.
4. Crear la venta de exportación completa y usar "Generar JSON" — debe
   completar el builder y AJV sin bloqueo (a diferencia del estado
   post-F3-C23C, donde toda venta nueva quedaba bloqueada).
5. CAT-020 (`Country`) sigue disponible para otros módulos (proveedores,
   etc.) sin cambios — no se usa en este flujo.

---

## Historial

- **F3-C23**: primera integración al sistema central de catálogos DTE
  (`DteCatalogItem`). CAT-020, CAT-028 y CAT-031 quedaron como "subset
  operativo" (1 valor cada uno).
- **F3-C23B, primer intento**: sin acceso al PDF/Excel oficiales (no se
  buscó fuera de `docs/`), concluyó — incorrectamente — que CAT-020 usaba
  una numeración MH propia de 4 dígitos, basado únicamente en el enum del
  schema JSON local. Cargó 275 códigos numéricos sin nombres verificados.
- **F3-C23B, segundo intento (este documento)**: localizado
  `database/catalogs/` (PDF + Excel oficiales v1.2, ya en el repo desde
  antes). Se relee todo el catálogo desde el Excel (parseado
  programáticamente con la librería `xlsx`, ya dependencia del proyecto) y
  se corrigen todos los catálogos FEX con datos reales y completos.

## Infraestructura reutilizada (sin cambios de schema Prisma)

- Modelo `DteCatalogItem` — catálogo global sin `tenant_id`.
- Modelo `Country` — catálogo global ISO alpha-2 (ya existente, reusado
  para CAT-020, ver más abajo).
- Query `listDteCatalogItems({ catalog_code })` y `getCountries()`.
- Endpoint `GET /api/dte/catalogs?catalog_code=CAT-XXX`.
- Seed CLI `prisma/seeds/seed.dte-catalog-items.ts` + seed runner de
  plataforma `dte-catalog-items-runner.ts`.
- `prisma/seeds/data/fex11-catalog-rows.ts` — módulo de datos puro
  compartido entre ambos seeds (evita divergencia).

No se creó ningún modelo, tabla ni migración nueva. No se tocó
`schema.prisma`.

---

## CAT-020 (País) — veredicto final y corrección

### Veredicto

**Opción 1 confirmada, con evidencia de primera fuente**: el catálogo
oficial v1.2 (`database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx`,
hoja "CAT-020 País", fila 1168) usa **códigos ISO 3166-1 alpha-2 de 2
letras** — 249 registros, todos de longitud 2. Confirmado: `US` =
`"Estados Unidos"`.

Este catálogo es **exactamente el mismo** que el modelo `Country` ya
existente en el proyecto (`prisma/importers/generated/commerce-catalogs.data.ts`,
comentario original: *"CAT-020 — Países ISO 3166-1 alpha-2 (249 registros)"*
— ya lo tenía correctamente identificado desde antes de esta auditoría, solo
que FEX 11 no lo estaba usando).

### Qué se corrigió

- **CAT-020 ya NO se carga como `DteCatalogItem`.** Las 275 filas numéricas
  cargadas en el primer intento de F3-C23B se **eliminaron** de
  `dte_catalog_items` (limpieza dirigida por `catalog_code = "CAT-020"`,
  incluida en el seed — ver `seedDteCatalogItems()`).
- FEX 11 ahora usa `getCountries()` (`src/modules/commerce/suppliers/queries/get-countries.ts`,
  reusado sin cambios) para el campo país — mismo catálogo que ya usa el
  selector de país de proveedores. **Cero duplicación de catálogo.**
- `9540` **no existe en el catálogo oficial v1.2** en absoluto — no es
  "9300 vs 9540", es simplemente que el catálogo real no usa esa
  numeración. La transmisión histórica ACEPTADA con `codPais: "9540"` fue
  válida solo porque el schema JSON local (desalineado del catálogo v1.2)
  lo permitía — ver hallazgo crítico arriba.

### Archivos corregidos por este cambio

`prisma/seeds/data/fex11-catalog-rows.ts` (ya no construye CAT-020),
`prisma/seeds/data/fex11-cat020-country-codes.ts` (**eliminado** — contenía
datos incorrectos), `dte-catalog.types.ts` (se retiró `CAT_020_PAIS` de
`DTE_CATALOG_CODES`), `export-sale.service.ts`, `fex-validation.ts`,
`page.tsx`, `export-sale-page.tsx`, `export-sale-workspace.tsx`,
`export-customer-modal.tsx`, `catalog-search-select.tsx` (generalizado para
aceptar `{code,label}` en vez de estar acoplado a `DteCatalogItem`).

---

## Estado final por catálogo

| Catálogo | Ítems | ¿Completo? | Fuente |
|---|---|---|---|
| CAT-014 Unidad de medida | — (`UnitOfMeasure.mh_unit_code`) | N/A | Sin cambios. |
| CAT-015 Tributos | 1 (`C3`) | Subset operativo (a propósito) | Excel oficial — etiqueta ajustada para coincidir exactamente. |
| CAT-016 Condición de operación | 3 | Completo | Verificado contra Excel oficial — coincide exacto. |
| CAT-017 Forma de pago | 6 | **Parcial** (hallazgo, no corregido — fuera de alcance) | El Excel oficial trae 12 códigos (faltan 08 Dinero electrónico, 09 Monedero electrónico, 11 Bitcoin, 12 Otras Criptomonedas, 13 Cuentas por pagar del receptor, 14 Giro bancario). CAT-017 es compartido con FE/CCFE y esta fase solo pidió "reutilizar" — se reporta como hallazgo, no se amplía sin instrucción explícita. |
| **CAT-020 País** | **250 activos en `Country`** (249 del catálogo oficial + 1 preexistente) | **Completo, códigos y nombres reales** | Modelo `Country` ya existente — mismo Excel oficial. Ya NO vive en `DteCatalogItem`. |
| CAT-022 Tipo doc. receptor | 6 | Completo para FEX (el Excel oficial para *este* subcatálogo no lista "00" Consumidor final — se mantiene por compatibilidad con FE/CCFE, fuera de alcance tocar) | Excel oficial + `36` NIT (F3-C23). |
| CAT-027 Recinto fiscal | 46 | **Completo** | Verificado byte a byte contra Excel oficial — coincide exacto con F3-C23. |
| CAT-028 Régimen | **56** (61 filas crudas del Excel, 5 duplicadas descartadas) | **Completo** | Excel oficial completo — ya no bloqueado/parcial. |
| CAT-029 Tipo de persona | 2 | **Completo — CORREGIDO** | Era `1=jurídica,2=natural` (invertido); el Excel oficial es `1=Persona Natural, 2=Persona Jurídica`. Corregido. |
| CAT-030 Transporte | 6 | Completo (códigos con nombre real) | Excel oficial. El schema permite un 7º código sin nombre documentado — no se carga. No integrado a UI (`otrosDocumentos` no implementado). |
| CAT-031 INCOTERMS | **11** | **Completo** | Excel oficial completo (01–11) — ya no bloqueado en solo "09". |

### Errata CAT-029 — impacto

La transmisión histórica ACEPTADA usó `customer_person_type: "2"` pensando
que significaba "natural". Según el catálogo real, `2` = Jurídica. MH
aceptó el documento de todas formas porque el schema solo valida que sea un
entero 1 o 2, no la semántica declarada. No se reescribe ese registro
histórico (es un hecho ya ocurrido), pero queda documentado aquí. Ningún
código de la aplicación asume una semántica fija para 1/2 — solo la etiqueta
en el catálogo cambió, así que la corrección se propaga automáticamente a
la UI sin tocar lógica.

### CAT-028 — nota sobre duplicados en la fuente

El Excel oficial trae 61 filas para CAT-028, pero 5 códigos aparecen dos
veces: una vez con una etiqueta larga y descriptiva (consistente con el
resto del catálogo) y otra vez al final del bloque con una etiqueta corta
con espacios de relleno (aparente artefacto de una revisión anterior
mezclada en el mismo libro). Se conservó la primera aparición (etiqueta
larga) para los 5 códigos duplicados
(`EX-3.3052.000`, `EX-3.3054.000`, `EX-3.3055.000`, `EX-3.3056.000`,
`EX-3.3057.000`) y se agregó el único código genuinamente nuevo de ese
bloque (`EX-3.3071.000`). Resultado: 56 códigos únicos.

---

## Cómo se cargan en bases nuevas / clientes futuros

Mismo mecanismo que el resto de catálogos DTE:

1. **Seed CLI directo**: `npx tsx prisma/seeds/seed.dte-catalog-items.ts`
   (idempotente — upsert + limpieza dirigida de filas obsoletas dentro de
   los catálogos que gestiona FEX 11).
2. **Aprovisionamiento de bases cliente**: `runDteCatalogItemsSeed()` en
   `dte-catalog-items-runner.ts`, mismo comportamiento.
3. **País (CAT-020)**: se sirve desde `Country`, ya cargado por
   `prisma/seeds/seed.commerce-catalogs.ts` (`seedCommerceCatalogs` /
   importador `prisma/importers/import-excel-catalogs.ts`) — **no requiere
   ninguna acción adicional** para FEX 11 específicamente.

A propósito, los códigos FEX (`CAT-015`, `CAT-027`, `CAT-028`, `CAT-029`,
`CAT-030`, `CAT-031`) **no** están en `REQUIRED_DTE_CATALOG_CODES` (BLOCKER
para todo tenant) — FEX 11 es una funcionalidad de feature flag. El check de
preflight `GLOBAL_FEX11_CATALOG_ITEMS` (F3-C23) sigue siendo WARNING.

### Cómo verificar en DB que los catálogos están completos

```ts
const codes = ["CAT-015","CAT-016","CAT-017","CAT-018","CAT-022","CAT-027","CAT-028","CAT-029","CAT-030","CAT-031"];
for (const c of codes) {
  console.log(c, await prisma.dteCatalogItem.count({ where: { catalog_code: c, is_active: true } }));
}
console.log("Country (CAT-020)", await prisma.country.count({ where: { status: "active" } }));
```

Conteos verificados en esta fase (base local):

```
CAT-015: 1    CAT-016: 3   CAT-017: 6   CAT-018: 3
CAT-022: 6    CAT-027: 46  CAT-028: 56  CAT-029: 2
CAT-030: 6    CAT-031: 11
Country (CAT-020): 250
```

Si CAT-020 aparece con más de 0 filas en `DteCatalogItem`, el seed de
limpieza no corrió — ejecutar `npx tsx prisma/seeds/seed.dte-catalog-items.ts`.

---

## Cómo lo consume `/dashboard/sales/export`

**Actualización F3-C23D**: `page.tsx` hace `listDteCatalogItems` para
CAT-016/017/022/027/028/029/031 **y para `FEX-11-V1-CODPAIS`** (país, ya no
`getCountries()`/CAT-020 para este campo), pasando todo como props hacia
`ExportSalePage` → `ExportSaleWorkspace` → `ExportTopBar` /
`ExportFiscalModal` / `ExportCustomerModal`.

El select de País usa `CatalogSearchSelect` (combobox buscable, sin
dependencias nuevas) sobre `FEX-11-V1-CODPAIS`. Régimen (56 ítems), Recinto
fiscal (46), Tipo de persona (2) y demás siguen usando `<select>` nativo.
CAT-020/`Country` sigue existiendo y disponible para otros módulos
(suppliers, etc.), pero ya no se usa en esta pantalla.

Cero inputs libres para códigos fiscales en toda la pantalla. El usuario ve
el nombre real (o el label conservador "Código país FEX v1 &lt;código&gt;"
para los códigos sin nombre oficial confirmado); el sistema guarda el
código real del catálogo correspondiente.

## Validación server-side

**Actualización F3-C23D**: `fex-validation.ts` y `export-sale.service.ts`
validan `country_code` contra `FEX-11-V1-CODPAIS` (`DteCatalogItem`, ya no
contra `Country`/CAT-020), el resto contra `DteCatalogItem` sin cambios. La
ampliación de CAT-027/028/029/030/031 sigue reflejándose automáticamente sin
tocar lógica de validación (ésta ya consultaba la tabla, no un archivo
estático). `generate-fex-json.service.ts` mantiene su propia guardia
(`FEX_COD_PAIS_SCHEMA_ENUM`, derivada del schema) como última red de
seguridad antes de construir el JSON.

## Preflight

Sin cambios de arquitectura desde F3-C23 (`GLOBAL_FEX11_CATALOG_ITEMS`,
WARNING, global — no incluye CAT-020 porque ya no es un `DteCatalogItem`).

## Cómo probar manualmente

**Actualización F3-C23D** — ver también la sección "Cómo probar manualmente
(F3-C23D)" arriba, que reemplaza el paso 5 de esta lista (ya no aplica el
bloqueo total de F3-C23C: FEX 11 v1 vuelve a poder transmitir usando el
catálogo de compatibilidad).

1. `npx tsx prisma/seeds/seed.dte-catalog-items.ts` (o los conteos de
   arriba, incluyendo `FEX-11-V1-CODPAIS`).
2. Con `DTE_FEX11_TEST_ENABLED=YES` fuera de producción, abrir
   `/dashboard/sales/export`.
3. Modal receptor extranjero → "Crear cliente nuevo" → País (FEX v1):
   combobox buscable sobre `FEX-11-V1-CODPAIS`; buscar `Estados Unidos` y
   confirmar que selecciona el código `9540` (no `US`).
4. Modal "Datos fiscales FEX 11" → Régimen: 56 opciones con nombres reales.
   INCOTERM: 11 opciones reales. Tipo de persona en el modal de cliente:
   "Persona Natural" / "Persona Jurídica" en el orden correcto.
5. Completar la venta y usar "Generar JSON" — con país `9540` debe pasar el
   builder y AJV sin bloqueo. Si se fuerza un `country_code` tipo `US`
   (por datos heredados), el builder lo bloquea con un mensaje explícito
   que distingue CAT-020 del catálogo FEX v1.
