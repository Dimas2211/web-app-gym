# Diseño técnico — Vista global `/dashboard/dte/outgoing`

Estado: **Fase 1 — diseño técnico aprobado. Sin implementación.**

---

## 1. Resumen de hallazgos

### Qué existe hoy

| Elemento | Dónde vive | Estado |
|----------|-----------|--------|
| `DteOutgoingDocument` (modelo + queries) | `commerce/dte/queries/` | Operativo |
| `DteTransmissionLog` (modelo + query) | `commerce/dte/queries/list-dte-transmission-logs.ts` | Operativo |
| `DteDocumentRelation` (modelo + tipos) | `commerce/dte/types/dte-document-relation.types.ts` | Modelado |
| `DteInvalidationEvent` (modelo + tipos) | `commerce/dte/types/dte-invalidation.types.ts` | Operativo |
| `getDteOutgoingDocumentById` | `commerce/dte/queries/get-dte-outgoing-document-by-id.ts` | Reutilizable (con ajuste de scoping) |
| `listDteOutgoingDocumentsBySale` | `commerce/dte/queries/list-dte-outgoing-documents-by-sale.ts` | **No sirve** para listado global |
| `listDteTransmissionLogs` | `commerce/dte/queries/list-dte-transmission-logs.ts` | Reutilizable directamente |
| Tipos base `DteOutgoingStatus`, `DteEnvironment` | `commerce/dte/types/dte.types.ts` | Reutilizables |
| `DteOutgoingDocumentDetail` | `commerce/dte/types/dte.types.ts` | Base usable — no expone campos sensibles |
| Panel Fiscal DTE (UI) | `sales/components/sale-dte-fiscal-panel.tsx` | Patrón visual a reutilizar |
| `SaleDteFiscalPanel` badges, estados, helpers | `sale-dte-fiscal-panel.tsx` | Helpers `dteStatusLabel`, `dteStatusCls` extraíbles |
| `getEffectiveLocationId` | `lib/location/active-location.ts` | Obligatorio en page server component |
| `requireAdmin` guard | `lib/permissions/guards` | Patrón a seguir en la nueva página |
| Patrón grilla ERP (sales-table.tsx) | `sales/components/sales-table.tsx` | Patrón de columnas + navegación a reutilizar |
| Filtros bar | `sales/components/sales-filters-bar.tsx` | Patrón a reutilizar |

### Qué NO existe todavía

- Query global de DTE (sin filtro por `sale_id` — listado fiscal completo).
- Query de detalle DTE enriquecido con NC, invalidación y delivery (más completo que `getDteOutgoingDocumentById`).
- Tipos frontend seguros específicos para la vista global (`DteOutgoingListItem`, `DteOutgoingDetail`, etc.).
- Página `/dashboard/dte/outgoing/page.tsx`.
- Estructura de carpetas `src/app/(dashboard)/dashboard/dte/`.

### Qué se puede reutilizar directamente

- `listDteTransmissionLogs` — sin cambios.
- `getDteOutgoingDocumentById` — reutilizable si se agrega `location_id` como filtro opcional o se valida desde la nueva query compuesta.
- Enums y tipos base de `dte.types.ts`.
- Helpers visuales del panel fiscal (`dteStatusLabel`, `dteStatusCls`, `envLabel`, `envCls`) — extraer a `utils/dte-status.utils.ts` compartido.
- Patrón `getEffectiveLocationId` + `requireAdmin` del page de sales.
- Patrón de grilla ERP de `sales-table.tsx`.
- Patrón de filtros de `sales-filters-bar.tsx`.

### Qué NO conviene reutilizar

- `listDteOutgoingDocumentsBySale` — filtra por `sale_id`, sirve para el panel de venta individual, no para listado global fiscal.
- `getSaleDetailById` — carga la venta completa con sus líneas; innecesario para la vista DTE.
- Lógica de acciones de sales (confirm-sale, discard-sale) — no tocarlas.

---

## 2. Diseño recomendado para `/dashboard/dte/outgoing`

### Estructura visual de 4 zonas (mismo patrón que sales)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ZONA A — Barra superior: título + filtros + totales rápidos        │
│  [Tipo DTE: Todos / FE 01 / CCFE 03 / NC 05]                        │
│  [Estado: Todos / Aceptado / Rechazado / Invalidado / ...]          │
│  [Ambiente: TEST / PROD]   [Fecha desde]  [Fecha hasta]             │
│  [Buscar: número control / código generación / cliente]             │
│                                                          [Exportar?] │
├─────────────────────────────────────────────────────────────────────┤
│  ZONA B — Resumen rápido (badges contadores)                        │
│  Total DTEs: N  |  Aceptados: N  |  Rechazados: N  |  Invalidados:N │
├────────────────────────────────────────┬────────────────────────────┤
│  ZONA C — Grilla principal DTE         │  ZONA D — Panel detalle    │
│                                        │                            │
│  Cols: Nº Control · Tipo · Estado ·    │  DTE seleccionado:         │
│  Ambiente · Cliente · Fecha emisión ·  │  - Encabezado fiscal       │
│  Aceptado · Invalidado · Entrega ext.  │  - NC relacionada          │
│                                        │  - Eventos invalidación    │
│  [navegación teclado ERP]              │  - Logs transmisión        │
│                                        │  - Estado delivery externo │
│                                        │  - Acciones contextuales   │
└────────────────────────────────────────┴────────────────────────────┘
```

### Zona A — Filtros superiores

| Filtro | Tipo | Valores |
|--------|------|---------|
| `dte_type_code` | select | Todos / 01-FE / 03-CCFE / 05-NC |
| `dte_status` | select | Todos / ACCEPTED / REJECTED / INVALIDATED / SIGNED / PENDING_GENERATION / SCHEMA_VALIDATED / OBSERVED |
| `environment` | select | Todos / TEST / PRODUCCIÓN |
| `date_from` | date | Fecha de emisión desde |
| `date_to` | date | Fecha de emisión hasta |
| `search` | text | Número control / Código generación / Nombre cliente |

### Zona B — Resumen rápido

Badges con contadores por estado. Se calculan como parte de la query de listado o con un `groupBy` auxiliar.

### Zona C — Grilla principal

Columnas propuestas:

| Col | Campo | Ancho | Sortable |
|-----|-------|-------|---------|
| Nº Control | `control_number` | 220px | Sí |
| Tipo | `dte_type_code` (etiqueta FE/CCFE/NC) | 80px | Sí |
| Estado | `dte_status` (badge color) | 110px | Sí |
| Ambiente | `environment` (TEST/PROD badge) | 70px | No |
| Cliente | `customer_name` (de Sale) | 160px | Sí |
| Fecha emisión | `issued_at` | 100px | Sí |
| Aceptado | `accepted_at` | 100px | Sí |
| Invalidado | `invalidated_at` | 100px | No |
| Entrega ext. | badge: enviado/error/pendiente | 100px | No |

### Zona D — Panel detalle DTE seleccionado

Sub-secciones verticales:

1. **Encabezado fiscal** — tipo, estado, número control, código generación, ambiente, sello MH, fechas fiscal.
2. **Venta relacionada** — link al sale (sale_code), cliente, monto total.
3. **NC 05 relacionada** — si existe `DteDocumentRelation CREDIT_NOTE_OF`.
4. **Eventos de invalidación** — lista de `DteInvalidationEvent` con estado, tipo, motivo, sello, respuesta MH.
5. **Logs de transmisión** — tabla compacta de `DteTransmissionLog`: operación, intento, HTTP status, timestamp.
6. **Entrega externa DTE** — estado (enviado/error/pendiente), último intento, error si aplica.
7. **Entrega externa invalidación** — igual, solo si existe evento ACCEPTED.
8. **Acciones contextuales** — botones según estado actual (ver sección 7).

---

## 3. Estructura de archivos recomendada

```
src/
  app/
    (dashboard)/
      dashboard/
        dte/
          outgoing/
            page.tsx                    ← Server Component: guard + query + render
            loading.tsx                 ← Skeleton opcional

  modules/
    commerce/
      dte/
        outgoing/                       ← Sub-módulo específico de la vista global
          queries/
            list-dte-outgoing-global.ts         ← Query principal paginada (NUEVA)
            get-dte-outgoing-detail-enriched.ts ← Detalle enriquecido (NUEVA)
          components/
            dte-outgoing-client.tsx             ← Client Component raíz
            dte-outgoing-filters-bar.tsx        ← Zona A filtros
            dte-outgoing-summary-bar.tsx        ← Zona B contadores
            dte-outgoing-table.tsx              ← Zona C grilla
            dte-outgoing-detail-panel.tsx       ← Zona D panel
            dte-outgoing-logs-section.tsx       ← Sub-sección logs
            dte-outgoing-relations-section.tsx  ← Sub-sección NC relacionada
            dte-outgoing-invalidation-section.tsx ← Sub-sección invalidación
            dte-outgoing-delivery-section.tsx   ← Sub-sección entrega externa
            dte-outgoing-actions.tsx            ← Botones contextuales
          types/
            dte-outgoing-view.types.ts          ← Tipos seguros de la vista
          utils/
            dte-status.utils.ts                 ← Helpers extraídos de sale-dte-fiscal-panel
          schemas/
            dte-outgoing-filters.schema.ts      ← Zod para filtros

Notas:
  - NO crear sub-módulo outgoing/ dentro de los servicios existentes.
    Los servicios de firma/transmisión ya tienen su propia organización.
  - La carpeta dte/outgoing/ es solo para la vista y sus queries.
  - Reutilizar actions existentes de commerce/dte/actions/ sin duplicar.
```

---

## 4. Queries necesarias

Estas queries deben definirse en Fase 2. **No implementar en esta fase.**

### 4.1 `listDteOutgoingGlobal` — listado paginado global

```
Propósito:
  Listar DteOutgoingDocument con filtros globales.
  Incluye join con Sale para obtener cliente y monto.
  NO incluye json_document, signed_jws, event_json, ni payloads completos.

Filtros:
  tenant_id (obligatorio)
  location_id (obligatorio)
  dte_type_code? (opcional)
  dte_status? (opcional)
  environment? (opcional)
  date_from? (sobre issued_at o created_at)
  date_to?
  search? (control_number, generation_code, nombre cliente)
  sort_field / sort_direction
  page / page_size

Joins necesarios:
  Sale → customer_name, total_amount, sale_code
  DteTransmissionLog → para badge entrega externa (solo tipos EXTERNAL_DELIVERY)

Campos retornados (seguros):
  dte.id, dte.dte_type_code, dte.control_number, dte.generation_code,
  dte.dte_status, dte.environment, dte.reception_stamp (truncado?),
  dte.issued_at, dte.accepted_at, dte.invalidated_at, dte.created_at,
  sale.sale_code, sale.customer_name, sale.total_amount,
  external_delivery_ok: boolean (agregado desde transmission_logs)

Paginación:
  Retornar { items: DteOutgoingListItem[], total: number }
```

### 4.2 `getDteOutgoingDetailEnriched` — detalle completo seguro

```
Propósito:
  Cargar el DTE seleccionado con todas las sub-entidades para el panel D.
  Enriquecido = incluye NC relacionada, eventos de invalidación,
  logs de transmisión (sanitizados), delivery summary.
  NUNCA incluir: signed_jws, json_document completo, event_json completo.

Filtros:
  id (dte_document_id)
  tenant_id (obligatorio — scoping de seguridad)
  location_id (opcional — validar en la consulta)

Includes:
  Sale → sale_code, customer_name, total_amount
  DteDocumentRelation CREDIT_NOTE_OF → source_document (NC 05)
  DteInvalidationEvent → sin event_json ni signed_jws
  DteTransmissionLog → sin response_body completo; solo resumen sanitizado
    (operation_type, http_status, error_message, created_at)
  Contadores external delivery (resumen igual que en getSaleDetailById)

Reutilización:
  La lógica de buildDeliverySummary de get-sale-detail-by-id.ts
  debe extraerse a un helper compartido en:
    commerce/dte/utils/delivery-summary.utils.ts
```

### 4.3 `listDteTransmissionLogsForDetail` — logs de un DTE

```
Reutilizar directamente list-dte-transmission-logs.ts.
Agregar parámetro opcional operation_type[] para filtrar por tipo.
No implementar query nueva — extender la existente si hace falta.
```

### 4.4 Query de contadores rápidos (Zona B)

```
Propósito:
  Calcular totales por estado para los badges de la Zona B.
  Opciones:
    a) groupBy en la misma query del listado (más simple, menos performante).
    b) Query separada COUNT GROUP BY dte_status (más limpio).
  Recomendado: comenzar con opción (a) y separar si hay problema de performance.
```

---

## 5. Tipos necesarios

Definir en `src/modules/commerce/dte/outgoing/types/dte-outgoing-view.types.ts`.
**No implementar todavía.**

```typescript
// ── Filtros ────────────────────────────────────────────────────────

interface DteOutgoingFilters {
  tenant_id:      string;
  location_id:    string;
  dte_type_code?: string;
  dte_status?:    DteOutgoingStatus;
  environment?:   DteEnvironment;
  date_from?:     string;  // YYYY-MM-DD
  date_to?:       string;
  search?:        string;
  sort_field?:    "control_number" | "dte_type_code" | "dte_status" | "issued_at" | "accepted_at" | "created_at";
  sort_direction?: "asc" | "desc";
  page?:          number;
  page_size?:     number;
}

// ── Ítem de la grilla ──────────────────────────────────────────────

interface DteOutgoingListItem {
  id:                     string;
  dte_type_code:          string;
  control_number:         string | null;
  generation_code:        string | null;
  dte_status:             DteOutgoingStatus;
  environment:            DteEnvironment;
  reception_stamp:        string | null;
  issued_at:              Date | null;
  accepted_at:            Date | null;
  invalidated_at:         Date | null;
  created_at:             Date;
  // De Sale
  sale_id:                string;
  sale_code:              string | null;
  customer_name:          string | null;
  total_amount:           number;
  // Delivery
  external_delivery_ok:   boolean;
}

// ── Detalle del panel ──────────────────────────────────────────────

interface DteOutgoingDetail {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  sale_id:          string;
  issuer_config_id: string | null;
  dte_type_code:    string;
  control_number:   string | null;
  generation_code:  string | null;
  environment:      DteEnvironment;
  dte_status:       DteOutgoingStatus;
  rejection_reason: string | null;
  reception_stamp:  string | null;
  retry_count:      number;
  issued_at:        Date | null;
  generated_at:     Date | null;
  signed_at:        Date | null;
  sent_at:          Date | null;
  accepted_at:      Date | null;
  rejected_at:      Date | null;
  invalidated_at:   Date | null;
  created_at:       Date;
  updated_at:       Date;
  // Venta relacionada
  sale_code:        string | null;
  customer_name:    string | null;
  total_amount:     number;
  // NC relacionada
  related_nc:       DteOutgoingRelationSummary | null;
  // Invalidación
  invalidation_events: DteOutgoingInvalidationSummary[];
  // Logs
  transmission_logs: DteOutgoingLogItem[];
  // Delivery
  external_delivery:              DteOutgoingDeliverySummary;
  external_invalidation_delivery: DteOutgoingDeliverySummary;
  // Acciones disponibles
  actions: DteOutgoingActionAvailability;
}

// ── Log de transmisión (seguro) ────────────────────────────────────

interface DteOutgoingLogItem {
  id:             string;
  operation_type: string;
  attempt_number: number;
  request_url:    string | null;
  http_status:    number | null;
  error_message:  string | null;
  created_at:     Date;
  // Nota: NO incluir response_body completo
}

// ── Relación NC ────────────────────────────────────────────────────

interface DteOutgoingRelationSummary {
  id:              string;
  dte_type_code:   string;
  control_number:  string | null;
  generation_code: string | null;
  dte_status:      DteOutgoingStatus;
  reception_stamp: string | null;
  accepted_at:     Date | null;
  created_at:      Date;
}

// ── Resumen de invalidación ────────────────────────────────────────

interface DteOutgoingInvalidationSummary {
  id:                     string;
  invalidation_type_code: string;
  reason:                 string;
  status:                 DteInvalidationStatus;
  mh_estado:              string | null;
  mh_sello_recibido:      string | null;
  mh_codigo_msg:          string | null;
  mh_descripcion_msg:     string | null;
  accepted_at:            Date | null;
  rejected_at:            Date | null;
  last_error:             string | null;
  created_at:             Date;
  // Nota: NO incluir event_json ni signed_jws
}

// ── Delivery summary ──────────────────────────────────────────────

interface DteOutgoingDeliverySummary {
  hasSuccessfulDelivery: boolean;
  lastAttemptAt:         Date | null;
  lastErrorMessage:      string | null;
  attemptsCount:         number;
}

// ── Disponibilidad de acciones ────────────────────────────────────

interface DteOutgoingActionAvailability {
  canGenerateJson:                  boolean;  // PENDING_GENERATION
  canValidateSchema:                boolean;  // GENERATED
  canSign:                          boolean;  // SCHEMA_VALIDATED
  canTransmit:                      boolean;  // SIGNED
  canCreateCreditNote:              boolean;  // CCFE 03 + ACCEPTED + sin NC activa
  canInvalidate:                    boolean;  // ACCEPTED + sin invalidación activa
  canDeliverExternal:               boolean;  // ACCEPTED + no entregado
  canDeliverExternalInvalidation:   boolean;  // Invalidación ACCEPTED + no entregada
}
```

---

## 6. Campos seguros vs campos prohibidos

| Campo | Modelo | Mostrar en UI | Razón |
|-------|--------|--------------|-------|
| `id` | DteOutgoingDocument | Sí (solo para keys React y Server Actions) | ID interno, no sensible |
| `dte_type_code` | DteOutgoingDocument | Sí | Dato fiscal público |
| `control_number` | DteOutgoingDocument | Sí | Dato fiscal público |
| `generation_code` | DteOutgoingDocument | Sí | UUID público del DTE |
| `dte_status` | DteOutgoingDocument | Sí | Estado operativo |
| `environment` | DteOutgoingDocument | Sí | TEST/PROD |
| `reception_stamp` (sello MH) | DteOutgoingDocument | Sí (truncable en grilla) | Dato fiscal público |
| `issued_at`, `accepted_at`, etc. | DteOutgoingDocument | Sí | Fechas fiscales públicas |
| `rejection_reason` | DteOutgoingDocument | Sí | Necesario para diagnóstico |
| `retry_count` | DteOutgoingDocument | Sí (solo en detalle) | Útil para soporte |
| `mh_response` | DteOutgoingDocument | **NO** | Puede contener datos internos de Hacienda sensibles; solo mostrar `rejection_reason` extraído |
| `signed_jws` | DteOutgoingDocument | **NUNCA** | Token de firma — nunca al cliente |
| `json_document` / `dte_json` | DteOutgoingDocument | **NUNCA** | JSON completo del DTE — contiene todos los datos fiscales sin sanitizar |
| `event_json` | DteInvalidationEvent | **NUNCA** | JSON completo del evento — contiene firma y datos internos |
| `signed_jws` | DteInvalidationEvent | **NUNCA** | Firma del evento de invalidación |
| `operation_type`, `http_status`, `error_message`, `created_at` | DteTransmissionLog | Sí | Datos sanitizados de diagnóstico |
| `response_body` | DteTransmissionLog | **NO** completo — solo `error_message` | Puede incluir tokens o respuestas parciales de Hacienda |
| `request_url` | DteTransmissionLog | Sí (opcional, para debug) | URL pública del endpoint |
| `mh_estado`, `mh_sello_recibido`, `mh_descripcion_msg` | DteInvalidationEvent | Sí | Datos de respuesta MH sanitizados |
| `mh_codigo_msg`, `mh_observaciones` | DteInvalidationEvent | Sí (resumen) | Útil para diagnóstico |
| `last_error` | DteInvalidationEvent | Sí (solo si no ACCEPTED) | Mensaje de error interno |
| Credenciales Hacienda (`DTE_MH_PASSWORD`, `DTE_MH_USER`) | Env | **NUNCA** | Credenciales — jamás al cliente |
| Credenciales MariaDB | Env | **NUNCA** | Credenciales — jamás al cliente |
| `DTE_SIGNER_PASSWORD` | Env | **NUNCA** | Contraseña del certificado |
| Token Bearer MH | Memoria servidor | **NUNCA** | Cacheado en servidor, no persiste ni se expone |
| `codigoEmpresa` en payload externo | MariaDB payload | No | NRC del emisor — internamente necesario pero no debe mostrarse en UI |
| `token` en payload externo | MariaDB payload | **NUNCA** | Es el `signed_jws` del DTE |

---

## 7. Acciones futuras y reglas de bloqueo

### Matriz de acciones

| Estado DTE | Acción disponible | Condición adicional | Action a reutilizar |
|-----------|-------------------|--------------------|--------------------|
| `PENDING_GENERATION` | Generar JSON | — | `generate-fe-json-for-sale.action.ts` / `generate-ccfe-json-for-sale.action.ts` |
| `GENERATED` | Validar schema | — | `validate-dte-json-schema.action.ts` |
| `SCHEMA_VALIDATED` | Firmar DTE | — | `sign-dte-document.action.ts` |
| `SIGNED` | Transmitir a Hacienda | — | `transmit-dte-document.action.ts` |
| `ACCEPTED` + tipo `03` | Crear Nota de Crédito 05 | Sin NC activa | `create-and-transmit-credit-note.action.ts` |
| `ACCEPTED` | Invalidar DTE | Sin invalidación activa con status no CANCELLED | `create-sign-transmit-invalidation.action.ts` |
| `ACCEPTED` + tipos `01/03/05` | Enviar DTE a sistema externo | Sin entrega exitosa previa | `deliver-dte-to-external-db.action.ts` |
| `INVALIDATED` + invalidación `ACCEPTED` | Enviar invalidación a sistema externo | Sin entrega de invalidación exitosa | `deliver-invalidation-to-external-db.action.ts` |
| `REJECTED` | Solo consulta y logs | — | Ninguna acción de escritura |
| `OBSERVED` | Solo consulta y logs (V2: reenvío?) | — | Ninguna acción de escritura en V1 |
| `INVALIDATED` | Solo consulta (+ delivery externo si aplica) | — | Solo `deliver-invalidation-to-external-db.action.ts` |

### Reglas de bloqueo críticas

- Nunca mostrar botón de firma si `dte_status !== "SCHEMA_VALIDATED"`.
- Nunca mostrar botón de transmisión si `dte_status !== "SIGNED"`.
- Nunca mostrar "Crear NC" si `dte_type_code !== "03"` o si `dte_status !== "ACCEPTED"`.
- Nunca mostrar "Invalidar" si ya existe `DteInvalidationEvent` con status no en `["CANCELLED"]`.
- Nunca mostrar "Enviar externo DTE" si `external_delivery.hasSuccessfulDelivery === true`.
- Nunca mostrar "Enviar externo invalidación" si no existe evento invalidación ACCEPTED.
- Calcular `DteOutgoingActionAvailability` en el servidor (query o service), no en el cliente.

---

## 8. Fases exactas de implementación

### Fase 2 — Query global segura

**Objetivo:** Construir `listDteOutgoingGlobal` con scoping correcto y sin campos sensibles.

**Archivos probables:**
- `src/modules/commerce/dte/outgoing/queries/list-dte-outgoing-global.ts` (NUEVO)
- `src/modules/commerce/dte/outgoing/types/dte-outgoing-view.types.ts` (NUEVO)
- `src/modules/commerce/dte/outgoing/schemas/dte-outgoing-filters.schema.ts` (NUEVO)

**Qué NO tocar:**
- Ningún archivo existente de `commerce/dte/`.
- `schema.prisma` — no requiere cambios.
- `commerce/sales/`.
- Actions de firma/transmisión.

**Validaciones:**
- `npx tsc --noEmit` sin errores.
- Probar query directamente en servicio sin UI.
- Verificar que `signed_jws`, `json_document`, `event_json` no aparecen en el SELECT.

---

### Fase 3 — Página y grilla base

**Objetivo:** Crear `/dashboard/dte/outgoing/page.tsx` con Server Component, guard, scoping, y grilla básica funcional.

**Archivos probables:**
- `src/app/(dashboard)/dashboard/dte/outgoing/page.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-client.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-table.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-filters-bar.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/utils/dte-status.utils.ts` (NUEVO — extraído de sale-dte-fiscal-panel)

**Qué NO tocar:**
- `sale-dte-fiscal-panel.tsx` — no modificar, solo reutilizar helpers como referencia.
- Guards y middleware existentes.
- `commerce/sales/`.

**Validaciones:**
- Página accesible en `/dashboard/dte/outgoing`.
- Filtros funcionales.
- Grilla muestra datos reales de la BD.
- Scoping por `tenant_id` + `location_id` verificado manualmente.
- `npx tsc --noEmit`.

---

### Fase 4 — Panel detalle

**Objetivo:** Implementar Zona D con las sub-secciones: encabezado fiscal, NC relacionada, logs, invalidación, delivery.

**Archivos probables:**
- `src/modules/commerce/dte/outgoing/queries/get-dte-outgoing-detail-enriched.ts` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-detail-panel.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-logs-section.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-relations-section.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-invalidation-section.tsx` (NUEVO)
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-delivery-section.tsx` (NUEVO)

**Qué NO tocar:**
- `sale-dte-fiscal-panel.tsx`.
- Ningún modelo Prisma.
- Actions de firma/transmisión.

**Validaciones:**
- Selección de fila carga detalle correcto.
- NC se muestra solo si existe relación `CREDIT_NOTE_OF`.
- Logs sin `response_body` completo.
- Invalidación sin `event_json`.

---

### Fase 5 — Acciones contextuales

**Objetivo:** Integrar botones de acción (firmar, transmitir, crear NC, invalidar, delivery externo) desde la vista `/dashboard/dte/outgoing` reutilizando las actions existentes.

**Archivos probables:**
- `src/modules/commerce/dte/outgoing/components/dte-outgoing-actions.tsx` (NUEVO)

**Qué NO tocar:**
- Las actions existentes en `commerce/dte/actions/` — consumirlas sin modificarlas.
- `commerce/sales/components/sales-client.tsx`.

**Regla crítica:**
Las acciones deben calcularse con `DteOutgoingActionAvailability` en servidor (query), no determinarse solo por condición en cliente.

**Validaciones:**
- Cada botón solo aparece en el estado correcto.
- Botones desaparecen tras ejecutar la acción (revalidación del detalle).
- Acciones inválidas bloqueadas también en la Server Action (no solo en UI).

---

### Fase 6 — QA y commit

**Objetivo:** Verificar todos los flujos, estados, edge cases, y hacer commit limpio.

**Checklist:**
- [ ] FE 01 ACCEPTED: se muestra correctamente en grilla + detalle.
- [ ] CCFE 03 ACCEPTED: botón NC disponible.
- [ ] NC 05 ACCEPTED: se muestra en sección relaciones del CCFE original.
- [ ] DTE INVALIDATED: solo consulta, sin botones de acción.
- [ ] DTE REJECTED: motivo visible, sin botones.
- [ ] Delivery externo enviado: badge OK, botón deshabilitado.
- [ ] Delivery externo fallido: badge error, botón disponible.
- [ ] Super admin con cookie de location: scoping correcto.
- [ ] Usuario con location fija: scoping correcto.
- [ ] `npx tsc --noEmit` sin errores.
- [ ] `npm run lint` sin errores.
- [ ] Sin campos sensibles en Network tab del browser.

---

## 9. Riesgos técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Fuga de `signed_jws` o `json_document` por SELECT incompleto | Media | Crítico | Revisar cada SELECT en las queries nuevas; no usar `select: { ...row }` sin especificar campos |
| Duplicación de lógica `buildDeliverySummary` vs sales | Alta | Medio | Extraer a helper compartido en Fase 2 antes de implementar |
| Romper `commerce/sales` al extraer helpers visuales | Baja (si solo se copian) | Alto | Copiar helpers a `dte-status.utils.ts`; no modificar `sale-dte-fiscal-panel.tsx` |
| Scoping incorrecto — super_admin sin cookie de location | Alta | Alto | Seguir exactamente el mismo patrón de `getEffectiveLocationId` que en `sales/page.tsx` |
| Acciones disponibles en estados incorrectos | Media | Alto | Calcular `DteOutgoingActionAvailability` en servidor, validar también en Server Action |
| Exposición de `response_body` de logs | Media | Medio | No seleccionar `response_body` en queries de la vista; solo `error_message` y `http_status` |
| Mezclar delivery externo MariaDB con transmisión MH en la misma sección visual | Baja | Medio | Mantener secciones visuales separadas: "Transmisión MH" vs "Entrega externa MariaDB" |
| N+1 al cargar detalle de cada DTE en la grilla | Alta si mal diseñado | Medio | La query global NO debe cargar logs completos — solo un bool `external_delivery_ok` |
| La nueva vista invoca acciones que afectan ventas | Baja | Alto | Las actions DTE no modifican `Sale.status`, solo `DteOutgoingDocument.dte_status` — mantener así |
| Confusión entre `dte_status` y `Sale.status` | Media | Medio | Documentar separación en comentarios de la página; no mostrar `Sale.status` en la vista DTE |

---

## 10. Recomendación final

### Siguiente prompt exacto para la Fase 2

```
Fase 2 — Query global segura para /dashboard/dte/outgoing

Implementa la query `listDteOutgoingGlobal` y los tipos seguros necesarios
para la vista global fiscal. NO implementes UI todavía.

Archivos a crear:

1. src/modules/commerce/dte/outgoing/types/dte-outgoing-view.types.ts
   - Tipos: DteOutgoingListItem, DteOutgoingDetail, DteOutgoingFilters,
     DteOutgoingLogItem, DteOutgoingRelationSummary, DteOutgoingDeliverySummary,
     DteOutgoingInvalidationSummary, DteOutgoingActionAvailability
   - Importar DteOutgoingStatus, DteEnvironment, DteInvalidationStatus
     desde tipos existentes
   - Ningún campo sensible: NO signed_jws, NO json_document/dte_json,
     NO event_json, NO response_body completo

2. src/modules/commerce/dte/outgoing/schemas/dte-outgoing-filters.schema.ts
   - Schema Zod para DteOutgoingFilters
   - tenant_id y location_id obligatorios
   - Resto opcionales con defaults seguros (page=1, page_size=50, max=100)

3. src/modules/commerce/dte/outgoing/queries/list-dte-outgoing-global.ts
   - Firma: listDteOutgoingGlobal(filters: DteOutgoingFilters)
   - Retorna: Promise<{ items: DteOutgoingListItem[]; total: number }>
   - Scoping obligatorio: WHERE tenant_id AND location_id
   - Join Sale → customer_name, sale_code, total_amount
   - Join DteTransmissionLog → calcular external_delivery_ok (bool)
     Solo logs con operation_type = "EXTERNAL_DELIVERY"
   - Paginación: skip/take con total por countQuery separado
   - Ordenación por sort_field/sort_direction
   - Ningún campo sensible en el SELECT

4. src/modules/commerce/dte/outgoing/utils/dte-status.utils.ts
   - Extraer (copiar, no mover) desde sale-dte-fiscal-panel.tsx:
     dteStatusLabel, dteStatusCls, envLabel, envCls, invalidationTypeLabel
   - NO modificar sale-dte-fiscal-panel.tsx

Restricciones:
- NO modificar prisma/schema.prisma
- NO modificar ningún archivo existente de commerce/dte/
- NO modificar commerce/sales/
- NO crear UI todavía
- NO crear migraciones

Al finalizar:
- Ejecutar: npx tsc --noEmit
- Confirmar que signed_jws y json_document NO están en ningún SELECT
- Reportar archivos creados, lógica implementada, validaciones, riesgos
```

---

## Confirmaciones de esta fase

- schema.prisma: **no modificado**
- Migraciones: **ninguna**
- Actions de firma/transmisión: **no tocadas**
- Actions de delivery externo: **no tocadas**
- commerce/sales: **no tocado**
- commerce/inventory: **no tocado**
- commerce/purchases: **no tocado**
- Código funcional: **ninguno creado**
- Prisma generate: **no ejecutado**
