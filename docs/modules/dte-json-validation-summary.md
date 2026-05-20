# DTE JSON Schema Validation — Summary

## Estado

**Fase 4I-4 cerrada (incluyendo subfases 4I-4B, 4I-4C, 4I-4D).**

Probado localmente y en Vercel. No hay pendientes de código en esta fase.
Fases 4I-5 (firma) y 4I-6 (transmisión) también cerradas. FE 01 y CCFE 03 aceptados en portal MH TEST. Ver docs/modules/dte-transmission-summary.md.

---

## Subfases cerradas

| Subfase | Descripción | Estado |
|---------|-------------|--------|
| 4I-4    | Validación JSON contra schemas oficiales MH. AJV integrado. | Cerrada |
| 4I-4B   | Activación de ajv-formats para date y email. | Cerrada |
| 4I-4C   | Corrección de catálogo municipios/distritos CAT-013 — CSV oficial. | Cerrada |
| 4I-4D   | Corrección CAT-022 (código 36 — NIT). Soporte FE 01 con empresa/NIT. | Cerrada |

---

## Estados DTE — aclaraciones semánticas

### GENERATED

- JSON preliminar construido internamente.
- No significa validado contra schema MH.
- No significa firmado.
- No significa transmitido ni aceptado por Hacienda.
- `signed_jws` = null, `reception_stamp` = null, `sent_at` = null, `accepted_at` = null.

### SCHEMA_VALIDATED

- JSON validado localmente contra JSON Schema oficial MH.
- No significa aceptado por Hacienda.
- La validación fue exitosa estructuralmente.
- `signed_jws` sigue null (firma no iniciada).
- `reception_stamp` sigue null.
- `sent_at` sigue null.
- `accepted_at` sigue null.

### ACCEPTED

- Reservado para fase futura cuando Hacienda devuelva sello de recepción.
- Solo puede alcanzarse tras SIGNED → SENT → respuesta MH = PROCESADO.

---

## Schemas oficiales MH usados

Schemas extraídos del archivo:
```
docs/dte-official/raw/svfe-json-schemas.zip
```

Copiados al runtime en:
```
src/modules/commerce/dte/schemas/mh/fe-01.schema.json
src/modules/commerce/dte/schemas/mh/ccfe-03.schema.json
```

No modificar estos archivos. Son schemas oficiales del MH de El Salvador.

---

## Dependencias de validación

| Paquete | Uso |
|---------|-----|
| `ajv` | Compilación y validación de JSON Schemas |
| `ajv-formats` | Soporte para `format: "date"` y `format: "email"` en los schemas |

### Qué valida AJV

- `required` — campos obligatorios según schema MH
- `type` — tipos de dato (string, number, integer, boolean, array, object, null)
- `enum` — valores permitidos (catálogos)
- `pattern` — expresiones regulares (NIT, NRC, codigoGeneracion, etc.)
- `additionalProperties: false` — campos extra no permitidos en secciones restrictivas
- `multipleOf` con `multipleOfPrecision` — precisión decimal en montos
- `format: "date"` — formato `YYYY-MM-DD`
- `format: "email"` — validación de correo electrónico

---

## Reglas FE 01 (Factura Electrónica)

### FE 01 — consumidor final

- `receptor` = `null` completo.
- No se incluye `tipoDocumento`, `numDocumento` ni `nrc`.
- El JSON DTE no lleva datos del receptor.

### FE 01 — persona natural con DUI/pasaporte/carnet/otro

- `receptor.tipoDocumento` = código CAT-022 correspondiente (ej. "13" para DUI).
- `receptor.numDocumento` = número del documento.
- `receptor.nrc` = `null`.

### FE 01 — empresa con NIT

- `receptor.tipoDocumento` = `"36"` (NIT).
- `receptor.numDocumento` = NIT normalizado (sin guiones, solo dígitos).
- `receptor.nrc` puede tener valor si el cliente lo tiene registrado.
- `receptor` **no usa** campo `nit` directamente (solo `numDocumento`).
- `cuerpoDocumento` usa `ivaItem` por línea.
- `resumen` usa `totalIva`.
- `resumen.tributos` **no** lleva código `"20"`.

---

## Reglas CCFE 03 (Comprobante de Crédito Fiscal)

- Requiere cliente fiscal registrado en `Customer`.
- Requiere NIT del receptor.
- Requiere NRC del receptor.
- Requiere actividad económica (`codActividad` + `descActividad`).
- Requiere dirección fiscal completa (`dept_code`, `municipality_code`, `address_complement`).
- `receptor` usa campos `nit` y `nrc` directamente (estructura distinta a FE 01).
- `cuerpoDocumento` usa `tributos: ["20"]` por línea (IVA crédito fiscal).
- `cuerpoDocumento` **no** usa `ivaItem`.
- `resumen.tributos` contiene entrada con código `"20"`.
- `resumen` **no** usa `totalIva`.

---

## Normalización NIT/NRC — fiscal-id.utils.ts

Archivo: `src/modules/commerce/dte/utils/fiscal-id.utils.ts`

### Regla

- NIT y NRC pueden estar guardados en base de datos con guiones (ej. `0614-070898-101-9`).
- Al construir el `json_document`, se normalizan quitando todos los caracteres no numéricos.
- Ejemplo: `"0614-070898-101-9"` → `"06140708981019"`.
- La base de datos **no se modifica automáticamente**. El guardado original con guiones se mantiene.
- Solo el `json_document` lleva el valor normalizado.

---

## CAT-022 — Tipo de Identificación del Receptor

Corrección aplicada en subfase 4I-4D.

| Código | Descripción |
|--------|-------------|
| `00`   | Consumidor final / uso interno operativo |
| `13`   | DUI |
| `36`   | NIT |
| `02`   | Carnet de residente |
| `03`   | Pasaporte |
| `37`   | Otro |

### Regla de uso

- `"00"` **no debe enviarse** como `tipoDocumento` en el JSON DTE FE 01.
- Si el receptor es consumidor final, `receptor = null` completo.
- La UI debe mostrar código + nombre para todos los tipos.
- El código `"36"` (NIT) estaba ausente del catálogo inicial — fue corregido en 4I-4D.

---

## CAT-013 — Municipios/Distritos

### Causa raíz del error

El catálogo anterior mezclaba el **Código de Municipios** con el **Código de carga agentes**, generando valores incorrectos como `05/28` para Santa Tecla (que debería ser `05/11`).

Los dos códigos no son equivalentes y no pueden usarse indistintamente en el JSON DTE.

### Regla definitiva

Para el campo `municipality` en el JSON DTE y para `Municipality.code` en la base de datos:
- Usar el **Código de carga agentes** del CSV oficial.
- `dept_code` = primeros 2 dígitos del código de carga agentes.
- `municipality_code` = últimos 2 dígitos del código de carga agentes.

### Ejemplo — Santa Tecla

| Campo | Valor |
|-------|-------|
| Código de carga agentes | `0511` |
| `dept_code` | `05` |
| `municipality_code` | `11` |
| `district_code` | `050611` |
| `district_name` | Santa Tecla (antes: Nueva San Salvador) |
| `new_municipality_code` | `0506` |
| `new_municipality_name` | La Libertad Sur |
| Nombre completo visible | Santa Tecla (antes: Nueva San Salvador) — La Libertad Sur |

### Qué alimenta qué

| Código | Alimenta | No alimenta |
|--------|----------|-------------|
| Código de carga agentes | `Municipality.code` → `dept_code` + `municipality_code` | — |
| Código Municipios | `Municipality.new_municipality_code` | No alimenta `Municipality.code` |

---

## Modelo Municipality — campos nuevos

Campos agregados en esta fase:

| Campo | Descripción |
|-------|-------------|
| `dte_full_code` | Código de carga agentes completo (ej. `0511`) |
| `district_code` | Código del distrito (ej. `050611`) |
| `district_name` | Nombre del distrito (ej. `Santa Tecla (antes: Nueva San Salvador)`) |
| `new_municipality_code` | Código del nuevo municipio agrupador (ej. `0506`) |
| `new_municipality_name` | Nombre del nuevo municipio agrupador (ej. `La Libertad Sur`) |

Customer, Supplier y DteIssuerConfig siguen usando `dept_code` + `municipality_code`.
La combinación se valida contra el catálogo `Municipality`.

---

## Validación de dirección en Customers y Suppliers

Al guardar dirección desde `update-customer-address` o `update-supplier-address`:

1. Se valida que la combinación `dept_code` + `municipality_code` exista en la tabla `Municipality`.
2. Si no existe, se devuelve error:
   ```
   "La combinación departamento/municipio no existe en el catálogo DTE. Seleccione un distrito válido."
   ```
3. El `MunicipalityPicker` en UI permite seleccionar solo entradas válidas del catálogo.

---

## Pruebas realizadas

### Local

| Prueba | Resultado |
|--------|-----------|
| FE 01 consumidor final → SCHEMA_VALIDATED | OK |
| FE 01 empresa/NIT → SCHEMA_VALIDATED | OK |
| CCFE 03 empresa → SCHEMA_VALIDATED | OK |
| CAT-022 muestra `36 — NIT` | OK |
| CAT-013 Santa Tecla muestra La Libertad Sur y guarda `05/11` | OK |
| Validación `format: date` activa con ajv-formats | OK |
| Validación `format: email` activa con ajv-formats | OK |

### Remoto / Vercel

| Prueba | Resultado |
|--------|-----------|
| Migración `npx prisma migrate deploy` aplicada | OK |
| Seed catálogos ejecutado remotamente | OK |
| Vercel build y runtime | OK |
| Validación DTE en Vercel | OK |

---

## Comandos remotos ejecutados

Migración:
```bash
npx prisma migrate deploy
```

Seed catálogos:
```powershell
$env:SEED_MODE="catalogs"
npx tsx prisma/seed.ts
Remove-Item Env:SEED_MODE
```

Resultado del seed:
- `36 — NIT` cargado en CAT-022.
- 262 municipios/distritos cargados desde CSV oficial.
- 774 actividades económicas.
- 249 países.

---

## Impacto en bases de datos y sincronización local/remota

| Aspecto | Estado |
|---------|--------|
| `schema.prisma` | Modificado — campos nuevos en `Municipality` |
| Migración nueva | Aplicada en local y en remoto |
| Base local | Migrada y seed ejecutado |
| Base remota | Migrada y seed ejecutado |
| Local y remoto | Sincronizados al cierre de esta fase |

---

## Qué queda pendiente

### 4I-5 — Firma digital del DTE

- Usar `dte-firmador.zip` del MH.
- Definir estrategia del firmador (local Java / Docker / API).
- Integrar `dte-signer.adapter.ts`.
- Generar `signed_jws`.
- Transición: `SCHEMA_VALIDATED` → `SIGNED`.

### Fases posteriores

| Fase | Descripción |
|------|-------------|
| 4I-6 | Transmisión a Hacienda (test / producción) |
| 4I-7 | Recepción de sello — estado ACCEPTED |
| — | Estados SENT / REJECTED / OBSERVED |
| — | Contingencia DTE |
| — | Invalidación DTE |
| — | Reimpresión y consulta pública |
| — | Representación gráfica PDF |
| — | Integración con caja/pagos |
