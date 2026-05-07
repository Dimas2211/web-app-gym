# Customers — resumen técnico de diseño

Estado: en diseño técnico (Fase 1). No implementado.

---

## Propósito del maestro Customer/Receptor

`commerce/customers` es el maestro de clientes y receptores fiscales del dominio `commerce`.

Cumple dos roles simultáneos:
1. **Receptor comercial**: entidad a quien se emite una venta (`Sale`).
2. **Receptor fiscal**: entidad cuyos datos tributarios se incluyen en el JSON DTE para FE o CCFE.

Es un maestro reusable a nivel `tenant_id`. No depende del negocio gimnasio.

---

## Por qué no reutilizar gym/clients

`gym/clients` es una ficha operativa específica del negocio gimnasio: registra membresías, clases, entrenadores, portal de acceso y datos de entrenamiento.

`commerce/customers` es una entidad fiscal/comercial con campos de identidad tributaria (NIT, NRC, DUI, actividad económica, dirección fiscal) que el módulo DTE necesita para construir el JSON que va a Hacienda.

Los datos son conceptualmente distintos:

| Aspecto           | `gym/clients`                     | `commerce/customers`              |
|-------------------|-----------------------------------|-----------------------------------|
| Dominio           | Vertical GYM                      | Commerce transversal              |
| Uso               | Membresías, clases, portal        | Ventas, facturación electrónica   |
| Campos clave      | plan, trainer, foto, portal_user  | NIT, NRC, actividad, dirección fiscal |
| Scope             | Solo instancias GYM               | Reusable en cualquier vertical    |

Una persona puede ser simultáneamente un `gym/client` y un `commerce/customer`, pero son registros en tablas distintas. La unificación futura con CRM/core queda como decisión de arquitectura pendiente.

---

## Relación con sales

- `Sale.customer_id` es nullable (FK a `Customer`).
- Para FE código `01` (consumidor final anónimo), el `customer_id` puede ser null.
- Para CCFE código `03`, el `customer_id` es obligatorio y el cliente debe tener datos fiscales completos.
- La validación de campos obligatorios del receptor se realiza al iniciar el flujo DTE, no en la confirmación interna de la venta.

---

## Relación con DTE

El JSON DTE (tanto FE como CCFE) requiere datos del receptor en su sección `receptor`. Estos datos provienen directamente de `Customer`.

Para CCFE, campos obligatorios esperados en el receptor según catalogo DTE:
- `nit` — número de identificación tributaria
- `nrc` — número de registro de contribuyente
- Actividad económica (`activity_code`)
- Tipo de documento de identificación (`id_type_code`, CAT-022)
- Dirección (departamento, municipio, complemento)

Para FE consumidor final, el receptor puede tener solo nombre y datos básicos, o ser anónimo.

La validación exacta de campos obligatorios por tipo DTE debe contrastarse contra los JSON Schemas oficiales del MH antes de implementar (pendiente de fases posteriores).

---

## Campos conceptuales

| Campo                | Tipo       | Descripción                                                           |
|----------------------|------------|-----------------------------------------------------------------------|
| `id`                 | UUID       | Identificador único                                                   |
| `tenant_id`          | UUID       | Tenant propietario (maestro a nivel tenant)                           |
| `customer_code`      | String     | Código interno de cliente (ej. `CLI-0001`)                            |
| `name`               | String     | Nombre visible / nombre corto                                         |
| `legal_name`         | String?    | Razón social legal (para CCFE)                                        |
| `taxpayer_type`      | Enum?      | Tipo contribuyente: `FINAL_CONSUMER`, `REGISTERED_TAXPAYER`, `EXCLUDED_SUBJECT` |
| `id_type_code`       | String?    | Código CAT-022: `36` NIT, `13` DUI, `37` Otro, `03` Pasaporte, `02` Carnet Residente |
| `nit`                | String?    | NIT sin guiones (obligatorio para CCFE)                               |
| `nrc`                | String?    | NRC del cliente (obligatorio para CCFE)                               |
| `dui`                | String?    | DUI del cliente (consumidor final persona natural)                    |
| `activity_code`      | String?    | Código de actividad económica CAT-019 (para CCFE)                     |
| `activity_name`      | String?    | Descripción de la actividad económica                                 |
| `dept_code`          | String?    | Código de departamento (dirección fiscal)                             |
| `municipality_code`  | String?    | Código de municipio (dirección fiscal)                                |
| `address_complement` | String?    | Complemento de dirección                                              |
| `phone`              | String?    | Teléfono de contacto                                                  |
| `email`              | String?    | Email de contacto o para envío de DTE                                 |
| `status`             | Enum       | `ACTIVE`, `INACTIVE`                                                  |
| `created_at`         | DateTime   | Auditoría                                                             |
| `updated_at`         | DateTime   | Auditoría                                                             |
| `created_by`         | UUID?      | Auditoría                                                             |
| `updated_by`         | UUID?      | Auditoría                                                             |

---

## Tipos contribuyente — taxpayer_type

| Valor                 | Descripción                                                       |
|-----------------------|-------------------------------------------------------------------|
| `FINAL_CONSUMER`      | Consumidor final. FE código `01`. Puede no tener NIT/NRC.         |
| `REGISTERED_TAXPAYER` | Contribuyente registrado con NIT y NRC. Requerido para CCFE.      |
| `EXCLUDED_SUBJECT`    | Sujeto excluido. FSE código `14`. Fuera del MVP.                  |

---

## Reglas de negocio

1. `customer_id` en `Sale` es nullable para FE consumidor final anónimo.
2. Para CCFE código `03`, el `customer_id` no puede ser null. El cliente debe tener `nit`, `nrc` y actividad económica válidos.
3. Los datos fiscales del cliente deben validarse antes de iniciar el flujo DTE, no al crear la venta.
4. Un cliente puede tener múltiples ventas históricas aunque sea desactivado (`status = INACTIVE`). La desactivación es lógica.
5. `customer_code` debe ser único por `tenant_id`.
6. El campo `nit` (cuando existe) debe ser único por `tenant_id` para evitar duplicados de contribuyentes.
7. No mezclar lógica de portal GYM con este maestro.

---

## Alcance MVP

- Diseño documental del maestro (este documento).
- Definición del schema Prisma en Fase 2.
- Sin UI todavía.
- Sin API todavía.
- El módulo se implementará como prerequisito del flujo DTE antes de la UI de sales.

---

## Alcance fuera del MVP

- UI de clientes (ABM completo).
- Búsqueda por NIT/NRC/DUI.
- Historial de ventas por cliente.
- Límites de crédito por cliente.
- Clasificación por segmento.
- Importación masiva de clientes.
- Sincronización con `gym/clients` si se decide unificar (decisión de arquitectura futura).

---

## Relación futura con CRM/core

Si en el futuro se decide construir un módulo de personas/CRM en `core` que unifique clientes GYM, clientes de venta, contactos, etc., `commerce/customers` puede mantenerse como vista especializada del módulo fiscal o migrarse hacia ese maestro centralizado.

Por ahora, `commerce/customers` es autónomo y vive dentro del dominio `commerce`.

No tomar decisiones de unificación en esta fase.

---

## Pendientes para Fase 2 (Prisma schema)

- Definir modelo Prisma `Customer`.
- Definir enum `CustomerStatus` (`ACTIVE`, `INACTIVE`).
- Definir enum `TaxpayerType` (`FINAL_CONSUMER`, `REGISTERED_TAXPAYER`, `EXCLUDED_SUBJECT`).
- Definir índice único `(tenant_id, customer_code)`.
- Definir índice único `(tenant_id, nit)` con `nit` nullable (índice único parcial o filtrado).
- Definir relación `Customer` → `Sale[]`.

---

## Estado

En diseño técnico — Fase 1.
No implementado.
No hay Prisma schema todavía.
No hay UI todavía.
