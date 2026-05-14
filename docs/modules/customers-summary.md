# commerce/customers — Summary

## Estado

**Fase 4I-3B-1 completada — Módulo completo implementado.**

- Schema Prisma ya existía (cerrado en fase previa).
- Backend (services, actions, queries, API routes) ya existía.
- UI completa implementada en esta fase.
- Sin migraciones pendientes.

---

## Objetivo

Maestro de clientes fiscales del tenant. Cumple dos roles:

1. **Receptor comercial**: entidad a quien se emite una venta (`Sale`).
2. **Receptor fiscal**: entidad cuyos datos tributarios se incluyen en el JSON DTE para FE o CCFE.

Es reusable a nivel `tenant_id`. No depende del negocio gimnasio.

---

## Ruta

`/dashboard/customers`

Roles: `super_admin`, `branch_admin`

---

## Por qué no reutilizar gym/clients

`gym/clients` es una ficha operativa del negocio gimnasio (membresías, clases, portal).
`commerce/customers` es una entidad fiscal con NIT, NRC, actividad económica y dirección fiscal para DTE.

Una persona puede ser ambas cosas, pero son registros en tablas distintas.

---

## Relación con Sales

- `Sale.customer_id` es nullable (FK a `Customer`).
- FE código `01`: customer_id puede ser null (consumidor final anónimo).
- CCFE código `03`: customer_id obligatorio + cliente con datos fiscales completos.
- La validación de campos del receptor se hace al iniciar el flujo DTE.

---

## Relación con DTE outgoing

El receptor fiscal del JSON DTE se construye desde `Customer`:

| Campo Customer        | Uso DTE                      |
|-----------------------|------------------------------|
| name                  | nombre del receptor          |
| legal_name            | razón social (opcional)      |
| taxpayer_type         | tipo de documento receptor   |
| nit                   | NIT del receptor             |
| nrc                   | NRC del receptor             |
| activity_code         | giro económico del receptor  |
| activity_name         | descripción del giro         |
| dept_code             | dirección fiscal             |
| municipality_code     | dirección fiscal             |
| address_complement    | dirección fiscal             |

---

## Campos fiscales

| Campo              | Tipo     | Obligatorio CCFE 03       |
|--------------------|----------|---------------------------|
| name               | string   | Sí                        |
| legal_name         | string?  | No                        |
| taxpayer_type      | enum     | Sí (REGISTERED_TAXPAYER)  |
| id_type_code       | string?  | No (CAT-022)              |
| nit                | string?  | Sí                        |
| nrc                | string?  | Sí                        |
| dui                | string?  | No                        |
| activity_code      | string?  | Sí                        |
| activity_name      | string?  | Sí                        |
| dept_code          | string?  | Sí (CAT-012)              |
| municipality_code  | string?  | Sí (CAT-013)              |
| address_complement | string?  | Sí                        |
| phone              | string?  | No                        |
| email              | string?  | No                        |

---

## Reglas para FE 01

- `name` presente.
- Cliente puede ser cualquier tipo de contribuyente.

## Reglas para CCFE 03

- `taxpayer_type` = `REGISTERED_TAXPAYER`
- `name` presente
- `nit` presente
- `nrc` presente
- `activity_code` presente
- `activity_name` presente
- `dept_code` presente
- `municipality_code` presente
- `address_complement` presente

Lógica de validación:
- `customer.service.ts` → `validateCustomerForDteType` (backend)
- `customer-summary-panel.tsx` → `checkFe01` + `checkCcfe03` (visual en UI)

---

## Tipos contribuyente

| Valor                 | Descripción                                     |
|-----------------------|-------------------------------------------------|
| `FINAL_CONSUMER`      | Consumidor final. FE código `01`.               |
| `REGISTERED_TAXPAYER` | Contribuyente con NIT y NRC. Requerido para CCFE.|
| `EXCLUDED_SUBJECT`    | Sujeto excluido. FSE código `14`. Fuera del MVP. |

---

## UI implementada (Fase 4I-3B-1 + Ajuste 4I-3B-1R + Ajuste 4I-3B-1S)

### Pantalla principal `/dashboard/customers`

- Header con título + botón "Nuevo cliente"
- Barra de filtros: búsqueda unificada, tipo contribuyente, estado, ordenamiento
- Tabla grid con columnas:
  - Código, Nombre, Razón social, NIT, NRC, DUI, Tipo contrib., Teléfono, Correo, Estado
- Panel de resumen compacto con 3 bloques (style Suppliers):
  - Bloque 1: Identidad (código, nombre, razón social, tipo contrib., fecha) + acciones (Editar, Cambiar estado)
  - Bloque 2: Identificación fiscal (tipo doc., DUI, NIT, NRC, actividad económica)
  - Bloque 3: Contacto (teléfono, correo, dirección)
- Panel inferior con pestañas navegables (6 tabs):
  - **Identificación**: nombre, razón social, tipo contribuyente, tipo documento, NIT, NRC, DUI (editable)
  - **Actividad económica**: giro CAT-019 con buscador debounce y keyboard nav (editable)
  - **Dirección**: municipio/departamento CAT-013 + complemento de dirección (editable)
  - **Contacto**: teléfono y correo con validación de email (editable)
  - **Preparación DTE**: estado FE 01 / CCFE 03 en tiempo real, campos faltantes (solo lectura)
  - **Auditoría**: creado por / fecha, actualizado por / fecha, estado actual (solo lectura)
- Diálogo crear cliente (formulario completo: 4 secciones, con catálogos)
- Diálogo editar cliente (formulario completo prefilled: 4 secciones, con catálogos) — mantenido
- Diálogo cambiar estado (activar/desactivar)

### Edición por secciones desde tabs (Ajuste 4I-3B-1S)

Cada pestaña editable tiene:
- Vista de lectura con todos los campos de la sección
- Botón "Editar [sección]" que activa modo edición inline
- Formulario por sección que llama a su propio Server Action
- Reset de estado al cambiar de cliente (via `useEffect` en `detail.id`)
- Refresco de detalle + mantiene fila seleccionada al guardar (`onRefresh`)
- Errores mostrados por sección

---

## Catálogos usados en captura fiscal (Ajuste 4I-3B-1R)

Customers captura datos fiscales con los mismos catálogos que Suppliers, no con inputs libres:

| Campo              | Antes           | Ahora                                              |
|--------------------|-----------------|-----------------------------------------------------|
| `taxpayer_type`    | select hardcoded | select hardcoded (correcto — valores distintos a Suppliers) |
| `id_type_code`     | select hardcoded | select cargado desde `/api/catalogs/identification-types` (CAT-022) con fallback |
| `activity_code`    | input libre      | `ActivityPicker` → búsqueda debounce `/api/catalogs/economic-activities` (CAT-019) |
| `activity_name`    | input libre      | capturado automáticamente al seleccionar actividad |
| `dept_code`        | input libre      | `MunicipalityPicker` → búsqueda debounce `/api/catalogs/municipalities` (CAT-013) |
| `municipality_code`| input libre      | capturado automáticamente al seleccionar municipio |

### Picker: ActivityPicker (`activity-picker.tsx`)

- Búsqueda libre con debounce 350ms en CAT-019.
- Keyboard navigation: ArrowUp/Down/Enter.
- Al seleccionar: guarda `activity_code` + `activity_name` como hidden inputs.
- Si el cliente ya tiene actividad asignada, se pre-carga como selección inicial.

### Picker: MunicipalityPicker (`municipality-picker.tsx`)

- Búsqueda libre con debounce 350ms en CAT-013.
- Keyboard navigation: ArrowUp/Down/Enter.
- Al seleccionar: guarda `dept_code` + `municipality_code` como hidden inputs.
- En modo edición: si el cliente ya tiene dept_code + municipality_code, hace un
  fetch al catálogo para resolver los nombres y mostrar el chip con información legible.
- Nota: CustomerDetail no almacena `dept_name` ni `municipality_name` (schema sin cambios).
  El panel de resumen muestra los códigos (formato: `dept_code/municipality_code`).

---

## Archivos backend (ya existían)

| Archivo | Función |
|---------|---------|
| `schemas/customer.schemas.ts` | createCustomerSchema, updateCustomerSchema, customerFiltersSchema |
| `types/customer.types.ts` | CustomerListItem, CustomerDetail, CustomerForSaleLookup |
| `services/customer.service.ts` | createCustomer, updateCustomer, validateCustomerForDteType |
| `actions/create-customer.action.ts` | createCustomerAction |
| `actions/update-customer.action.ts` | updateCustomerAction |
| `queries/list-customers.ts` | listCustomers (paginado + filtros) |
| `queries/get-customer-by-id.ts` | getCustomerById |
| `queries/search-customers-for-sale.ts` | búsqueda para lookup en ventas |

## Archivos API (ya existían)

| Ruta | Métodos |
|------|---------|
| `/api/customers` | GET (lista), POST (crear) |
| `/api/customers/[id]` | GET (detalle), PATCH (actualizar) |
| `/api/customers/search` | GET (lookup para ventas) |
| `/api/catalogs/identification-types` | GET (CAT-022 — usado en id_type_code) |
| `/api/catalogs/economic-activities` | GET (CAT-019 — usado en ActivityPicker) |
| `/api/catalogs/municipalities` | GET (CAT-013 — usado en MunicipalityPicker) |

## Archivos UI

| Archivo | Función |
|---------|---------|
| `app/(dashboard)/dashboard/customers/page.tsx` | página servidor |
| `app/(dashboard)/dashboard/customers/loading.tsx` | skeleton de carga |
| `app/(dashboard)/dashboard/customers/error.tsx` | boundary de error |
| `components/customers-client.tsx` | orquestador principal (tabla + panel + tabs) |
| `components/customers-table.tsx` | grilla con navegación teclado |
| `components/customer-summary-panel.tsx` | panel compacto 3 bloques (ajuste 4I-3B-1S) |
| `components/customer-detail-tabs.tsx` | 6 pestañas navegables con edición (ajuste 4I-3B-1S) |
| `components/new-customer-dialog.tsx` | formulario crear con catálogos |
| `components/edit-customer-dialog.tsx` | formulario editar con catálogos |
| `components/activity-picker.tsx` | widget selector CAT-019 (reutilizable en diálogos) |
| `components/municipality-picker.tsx` | widget selector CAT-013 (reutilizable en diálogos) |
| `components/toggle-customer-status-dialog.tsx` | cambiar estado |

## Actions por sección (Ajuste 4I-3B-1S)

| Archivo | Campos que actualiza |
|---------|----------------------|
| `actions/update-customer-identification.action.ts` | name, legal_name, taxpayer_type, id_type_code, nit, nrc, dui |
| `actions/update-customer-activity.action.ts` | activity_code, activity_name |
| `actions/update-customer-address.action.ts` | dept_code, municipality_code, address_complement |
| `actions/update-customer-contact.action.ts` | phone, email |

---

## Pendientes

- Almacenar `dept_name` y `municipality_name` en DB para display legible en panel (requiere Prisma)
- Integración refinada con selector de cliente en ventas para auto-completar datos CCFE
- Validación de formato NIT / NRC (regex) — no bloqueante aún
- Pestaña Ventas por cliente (pestaña futura — no incluida en 4I-3B-1S deliberadamente)

## No generado en esta fase

- No se generó JSON DTE ni CCFE
- No se firmó ni transmitió ningún documento
- No se tocó inventario
- No se modificó Prisma schema ni migraciones
