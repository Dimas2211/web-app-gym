# cash-robust-close-plan.md

## Plan técnico: módulo commerce/cash robusto

Fase 5A — Diseño técnico. Sin implementación de código.

---

## 1. Estado actual del módulo cash

### Modelos en schema.prisma

**CashRegister**

| Campo | Tipo | Nullable |
|---|---|---|
| id | String (UUID) | No |
| tenant_id | String | No |
| location_id | String | No |
| code | String | No |
| name | String | No |
| is_active | Boolean | No |
| created_at / updated_at | DateTime | No |
| created_by / updated_by | String | Sí |

Relaciones: `sessions CashSession[]`
Índices: único `(tenant_id, location_id, code)`

---

**CashSession**

| Campo | Tipo | Nullable | Notas |
|---|---|---|---|
| id | String (UUID) | No | PK |
| tenant_id | String | No | |
| location_id | String | No | |
| cash_register_id | String | No | FK → CashRegister |
| opened_by | String | No | FK → User |
| closed_by | String | Sí | FK → User |
| opened_at | DateTime | No | Default now() |
| closed_at | DateTime | Sí | |
| opening_amount | Decimal(10,2) | No | Monto inicial declarado |
| expected_cash_amount | Decimal(10,2) | No | Calculado — actualmente = opening_amount |
| declared_cash_amount | Decimal(10,2) | Sí | Declarado por cajero al cerrar |
| difference_amount | Decimal(10,2) | Sí | declared - expected (calculado al cierre) |
| status | CashSessionStatus | No | OPEN / CLOSED / CANCELLED |
| notes | String | Sí | Campo único, no diferencia apertura/cierre |

Enum `CashSessionStatus { OPEN, CLOSED, CANCELLED }`

---

### Queries existentes (3)

| Archivo | Qué retorna |
|---|---|
| `list-cash-registers.ts` | Lista de cajas con sesión OPEN embebida si existe |
| `get-cash-register-by-id.ts` | Detalle de una caja con sesión OPEN |
| `get-open-cash-session.ts` | Sesión OPEN de una caja concreta |

### Services existentes (2)

- **`cash-read.service.ts`**: wrapper de queries, expone `getCashWorkspaceState` en paralelo.
- **`cash-session.service.ts`**: `openCashSession` (valida unicidad OPEN + crea sesión), `closeCashSession` (calcula difference = declared - expected + CLOSED). Limitación documentada: `expected_cash_amount` no acumula ventas de la sesión.

### Actions existentes (6)

`getCashWorkspaceStateAction`, `listCashRegistersAction`, `getCashRegisterDetailAction`, `getOpenCashSessionAction`, `openCashSessionAction`, `closeCashSessionAction`.

### Componentes existentes (1)

`CashClient` — panel izquierda (lista cajas) + panel derecha (estado sesión, formulario apertura, formulario cierre con diferencia estimada en cliente).

---

## 2. Lo que tiene de bueno la versión actual

- Identidad correcta: `tenant_id` + `location_id` en todos los modelos.
- Seed `CAJA-01` funcional por location.
- Apertura y cierre atómicos validados por scope.
- Protección por aplicación contra doble sesión OPEN.
- `declared_cash_amount` y `difference_amount` ya existen en el schema.
- `expected_cash_amount` listo como campo (aunque hoy no acumula ventas).
- UI inicial funcional y navegable.
- `Sale.cash_session_id` existe (aunque sin FK formal).

---

## 3. Limitaciones actuales

| Limitación | Impacto |
|---|---|
| `Sale.cash_session_id` sin FK formal ni índice | No hay relación real Sale ↔ CashSession consultable vía Prisma |
| `expected_cash_amount` no acumula ventas | Arqueo incorrecto: no refleja el efectivo real que debería haber |
| No existe `CashMovement` | Sin control de ingresos/egresos manuales (fondos, retiros, gastos menores) |
| No existe modelo `PaymentMethod` | `payment_method_code` en `SalePayment` es string libre sin catálogo |
| `SalePayment` sin `cash_session_id` | No es posible saber qué pagos pertenecen a qué sesión |
| Campo `notes` único | Sin diferenciación entre nota de apertura y nota de cierre (ambas pisan el mismo campo) |
| Sin índice parcial OPEN en BD | La garantía de sesión única depende solo de la aplicación, no de BD |
| Sin historial de sesiones en UI | No hay vista de sesiones cerradas ni filtros por período/caja/usuario |
| Sin reporte de corte imprimible | No hay PDF ni Excel del arqueo |
| `CashSessionStatus` solo tiene OPEN/CLOSED/CANCELLED | Sin estados derivados de cuadre (balanceada, sobrante, faltante) |

---

## 4. Diseño del reporte de corte diario

### Contrato de datos `CashSessionCutReport`

```typescript
interface CashSessionCutReport {
  // Identificación
  session_id: string;
  cash_register_id: string;
  cash_register_code: string;
  cash_register_name: string;
  tenant_id: string;
  location_id: string;

  // Personal
  opened_by_id: string;
  opened_by_name: string;
  closed_by_id: string | null;
  closed_by_name: string | null;

  // Tiempos
  opened_at: Date;
  closed_at: Date | null;

  // Montos base
  opening_amount: number;           // Monto con que se abrió
  expected_cash_amount: number;     // opening + efectivo de ventas + movimientos MANUAL_IN - MANUAL_OUT etc.
  declared_cash_amount: number | null;  // Declarado por cajero al cerrar
  difference_amount: number | null;     // declared - expected

  // Estado derivado
  cut_status: CashCutStatus;        // Ver sección 9

  // Resumen por método de pago
  payment_summary: PaymentSummary[];

  // Resumen movimientos manuales
  manual_movements_summary: ManualMovementSummary[];

  // Resumen de ventas
  sales_summary: SalesSummary;

  // Totales consolidados
  totals: CashCutTotals;
}

interface PaymentSummary {
  payment_method_code: string;
  payment_method_name: string;
  is_cash: boolean;          // Solo CASH afecta el arqueo físico
  total_amount: number;
  count: number;
}

interface ManualMovementSummary {
  movement_type: CashMovementType;
  direction: 'IN' | 'OUT';
  total_amount: number;
  count: number;
}

interface SalesSummary {
  total_sales: number;       // Conteo de ventas CONFIRMED en la sesión
  total_amount: number;      // Suma de total_amount de ventas
  total_cash: number;        // Solo pagos en efectivo
  total_other: number;       // Todos los demás métodos
}

interface CashCutTotals {
  total_income_cash: number;     // opening + MANUAL_IN + ADJUSTMENT_UP + pagos en efectivo de ventas
  total_outflow_cash: number;    // MANUAL_OUT + CASH_WITHDRAWAL + PETTY_EXPENSE + ADJUSTMENT_DOWN + REFUND_OUT
  expected_physical_cash: number; // = total_income_cash - total_outflow_cash
  declared_cash: number | null;
  difference: number | null;     // declared - expected_physical_cash
}
```

### Cómo se calcula `expected_cash_amount`

```
expected_cash_amount =
  opening_amount
  + SUM(sale_payments.amount WHERE payment_method_code = 'CASH' AND cash_session_id = this_session_id)
  + SUM(cash_movements.amount WHERE direction = 'IN')
  - SUM(cash_movements.amount WHERE direction = 'OUT')
```

Este cálculo requiere:
1. `SalePayment.cash_session_id` (Fase 6C)
2. `CashMovement.cash_session_id` (Fase 5B/5C)

Hasta que no se implementen esas fases, `expected_cash_amount` puede aproximarse como campo calculado on-the-fly en el query del corte.

---

## 5. Diseño de integración sales → cash

### Estado actual de la relación

| Campo | Existe | Tipo | FK formal | Índice |
|---|---|---|---|---|
| `Sale.cash_session_id` | Sí | `String?` | No | No |
| `SalePayment.cash_session_id` | No | — | — | — |
| `CashSession.sales[]` | No | — | — | — |

### Cambios necesarios en schema

```prisma
// En Sale — agregar FK formal y relación
cash_session_id String?
cash_session    CashSession? @relation(fields: [cash_session_id], references: [id])
@@index([cash_session_id])

// En CashSession — relación inversa
sales Sale[]

// En SalePayment — nuevo campo
cash_session_id String?
cash_session    CashSession? @relation(fields: [cash_session_id], references: [id])
@@index([cash_session_id])

// En CashSession — relación inversa
sale_payments SalePayment[]
```

### Dónde asociar `cash_session_id`

**En `Sale`:** al confirmar la venta (`confirmSale` en `sale.service.ts`), si hay sesión OPEN en la location del tenant, se asocia `Sale.cash_session_id = openSession.id`.

**En `SalePayment`:** al momento de registrar pagos (cuando se implemente en Fase 6C), cada pago se asocia a la sesión activa.

### Bloqueo de confirmación sin sesión abierta

Decisión de diseño: **NO bloquear** la confirmación de venta si no hay sesión abierta. Razones:
- Puede haber ventas administrativas no presenciales (facturas diferidas, crédito a clientes).
- La sesión de caja es un control operativo, no un prerequisito comercial.
- Sí se puede **advertir** en la UI si no hay sesión, pero no bloquear el flujo.

Si el negocio requiere lo contrario, se puede agregar una validación opcional configurable por tenant.

### Separación DTE / confirmación / caja

```
confirm-sale.action.ts
  └── sale.service.confirmSale()  ← única transacción Prisma
        ├── Sale.status = CONFIRMED
        ├── InventoryMovement SALE_OUT (si stockable)
        ├── Sale.cash_session_id = openSession.id (si hay sesión)
        └── [NO DTE aquí]

generate-dte.action.ts (proceso separado y posterior)
  └── dte services...

SalePayment (registro de pago) — proceso separado, Fase 6C
```

---

## 6. Diseño de métodos de pago

### Estado actual

No existe modelo `PaymentMethod`. `SalePayment.payment_method_code` es `String` libre. `SalePayment.mh_payment_form_code` es `String?` (CAT-017 MH, código fiscal).

### Opción A — Enum fijo (recomendada para Fase 5B)

Definir un enum TypeScript/Zod con los métodos base, sin tabla nueva en BD inicialmente:

```typescript
enum PaymentMethodCode {
  CASH = 'CASH',
  DEBIT_CARD = 'DEBIT_CARD',
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  OTHER = 'OTHER',
}

// Mapa de propiedades por método
const PAYMENT_METHOD_META: Record<PaymentMethodCode, {
  name: string;
  is_cash: boolean;  // ← solo CASH afecta arqueo físico
  mh_codes: string[];  // códigos CAT-017 equivalentes
}> = {
  CASH:          { name: 'Efectivo',        is_cash: true,  mh_codes: ['01'] },
  DEBIT_CARD:    { name: 'Tarjeta débito',  is_cash: false, mh_codes: ['04'] },
  CREDIT_CARD:   { name: 'Tarjeta crédito', is_cash: false, mh_codes: ['03'] },
  BANK_TRANSFER: { name: 'Transferencia',   is_cash: false, mh_codes: ['02'] },
  CHECK:         { name: 'Cheque',          is_cash: false, mh_codes: ['05'] },
  OTHER:         { name: 'Otro',            is_cash: false, mh_codes: ['99'] },
}
```

### Opción B — Modelo PaymentMethod en BD (para Fase 6C+)

```prisma
model PaymentMethod {
  id                  String  @id @default(uuid())
  code                String  @unique   // CASH, DEBIT_CARD, etc.
  name                String
  is_cash             Boolean @default(false)
  is_active           Boolean @default(true)
  mh_payment_form_code String?          // CAT-017
  sort_order          Int     @default(0)
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  sale_payments SalePayment[]

  @@map("payment_methods")
}
```

**Recomendación:** Iniciar con Opción A (enum + mapa en TypeScript) para las fases tempranas. Migrar a Opción B cuando el negocio requiera configurar métodos por tenant.

### Resumen por método en el corte

```
payment_summary:
┌────────────────────┬─────────────┬───────────┬─────────────────────┐
│ Método             │ Total       │ Cuenta    │ Afecta arqueo?      │
├────────────────────┼─────────────┼───────────┼─────────────────────┤
│ Efectivo           │ $1,500.00   │ 12        │ Sí                  │
│ Tarjeta débito     │ $800.00     │ 8         │ No                  │
│ Tarjeta crédito    │ $600.00     │ 5         │ No                  │
│ Transferencia      │ $300.00     │ 3         │ No                  │
│ Cheque             │ $0.00       │ 0         │ No                  │
│ Otro               │ $0.00       │ 0         │ No                  │
├────────────────────┼─────────────┼───────────┼─────────────────────┤
│ TOTAL VENTAS       │ $3,200.00   │ 28        │                     │
│ TOTAL EFECTIVO     │ $1,500.00   │           │ Sumado al arqueo     │
└────────────────────┴─────────────┴───────────┴─────────────────────┘
```

**Regla crítica:** Solo `CASH` suma al `expected_cash_amount`. Los demás aparecen en el corte informativo pero no afectan el arqueo físico.

---

## 7. Diseño de CashMovement

### Justificación

Sin `CashMovement` no es posible:
- Registrar fondos de apertura adicionales durante la sesión.
- Registrar retiros de efectivo (supervisor saca billetes de la caja).
- Registrar gastos menores (petty cash).
- Registrar ajustes de cuadre.
- Tener un historial auditable de lo que pasó dentro de la sesión.

### Modelo propuesto

```prisma
model CashMovement {
  id               String           @id @default(uuid())
  tenant_id        String
  location_id      String
  cash_session_id  String
  cash_register_id String

  movement_type    CashMovementType
  direction        MovementDirection  // IN | OUT
  amount           Decimal(10,2)
  reason           String             // texto obligatorio descriptivo
  reference        String?            // referencia externa (nro boleta, etc.)
  notes            String?

  performed_by     String             // FK → User (auditoría)
  performed_at     DateTime           @default(now())

  created_at       DateTime           @default(now())
  updated_at       DateTime           @updatedAt

  cash_session     CashSession     @relation(fields: [cash_session_id], references: [id])
  cash_register    CashRegister    @relation(fields: [cash_register_id], references: [id])
  performed_by_user User           @relation(fields: [performed_by], references: [id])

  @@index([cash_session_id])
  @@index([tenant_id, location_id])
  @@index([performed_at])
  @@map("cash_movements")
}

enum CashMovementType {
  MANUAL_IN         // Ingreso manual genérico (fondos adicionales)
  MANUAL_OUT        // Egreso manual genérico
  CASH_WITHDRAWAL   // Retiro de efectivo por supervisor
  PETTY_EXPENSE     // Gasto menor (petty cash)
  ADJUSTMENT_UP     // Ajuste positivo de arqueo
  ADJUSTMENT_DOWN   // Ajuste negativo de arqueo
  REFUND_OUT        // Devolución en efectivo al cliente
}

enum MovementDirection {
  IN    // Suma al expected_cash_amount
  OUT   // Resta del expected_cash_amount
}
```

### Reglas de dirección por tipo

| movement_type | direction | Efecto en arqueo |
|---|---|---|
| MANUAL_IN | IN | Suma |
| MANUAL_OUT | OUT | Resta |
| CASH_WITHDRAWAL | OUT | Resta |
| PETTY_EXPENSE | OUT | Resta |
| ADJUSTMENT_UP | IN | Suma |
| ADJUSTMENT_DOWN | OUT | Resta |
| REFUND_OUT | OUT | Resta |

### Relación en CashSession

```prisma
// Agregar en CashSession
movements CashMovement[]
```

### Relación en CashRegister

```prisma
// Agregar en CashRegister
movements CashMovement[]
```

---

## 8. Diseño de historial de sesiones

### Vista propuesta `/dashboard/cash?tab=history`

Tabla paginada con columnas:

| Columna | Fuente |
|---|---|
| Sesión # | `session_id` (truncado) |
| Caja | `cash_register.code` + `cash_register.name` |
| Cajero (abrió) | `opened_by_user.name` |
| Apertura | `opened_at` |
| Cajero (cerró) | `closed_by_user?.name` |
| Cierre | `closed_at` |
| Monto inicial | `opening_amount` |
| Esperado | `expected_cash_amount` |
| Declarado | `declared_cash_amount` |
| Diferencia | `difference_amount` |
| Estado | `cut_status` (derivado) |
| Acciones | Ver corte / Ver movimientos |

### Filtros propuestos

- Período: Hoy / Ayer / Esta semana / Este mes / Rango personalizado
- Caja: selector por `cash_register_id`
- Usuario: selector por `opened_by`
- Estado sesión: OPEN / CLOSED / CANCELLED
- Estado corte: BALANCED / OVER / SHORT (solo cerradas)
- Solo con diferencia (rápido: faltantes o sobrantes)

### Queries necesarios

```typescript
// Listado paginado de sesiones
listCashSessions(params: {
  tenant_id: string;
  location_id: string;
  cash_register_id?: string;
  opened_by?: string;
  status?: CashSessionStatus;
  date_from?: Date;
  date_to?: Date;
  page: number;
  page_size: number;
}): Promise<{ sessions: CashSessionListItem[]; total: number }>;

// Detalle completo de una sesión
getCashSessionById(params: {
  session_id: string;
  tenant_id: string;
  location_id: string;
}): Promise<CashSessionDetail | null>;

// Reporte de corte completo
getCashSessionCutReport(params: {
  session_id: string;
  tenant_id: string;
  location_id: string;
}): Promise<CashSessionCutReport>;

// Movimientos manuales de una sesión
getCashSessionMovements(params: {
  session_id: string;
  tenant_id: string;
  location_id: string;
}): Promise<CashMovementItem[]>;

// Pagos de ventas asociados a una sesión
getCashSessionPayments(params: {
  session_id: string;
  tenant_id: string;
  location_id: string;
}): Promise<SalePaymentItem[]>;
```

---

## 9. Diseño de estado de corte derivado

### Enum propuesto (TypeScript, no columna de BD)

```typescript
enum CashCutStatus {
  OPEN = 'OPEN',
  CLOSED_BALANCED = 'CLOSED_BALANCED',   // difference = 0
  CLOSED_OVER = 'CLOSED_OVER',           // difference > 0 (sobrante)
  CLOSED_SHORT = 'CLOSED_SHORT',         // difference < 0 (faltante)
  CANCELLED = 'CANCELLED',
}
```

### Helper de derivación

```typescript
function deriveCashCutStatus(session: {
  status: CashSessionStatus;
  difference_amount: Decimal | null;
}): CashCutStatus {
  if (session.status === 'OPEN') return CashCutStatus.OPEN;
  if (session.status === 'CANCELLED') return CashCutStatus.CANCELLED;

  // status === 'CLOSED'
  const diff = session.difference_amount?.toNumber() ?? 0;
  if (diff === 0) return CashCutStatus.CLOSED_BALANCED;
  if (diff > 0) return CashCutStatus.CLOSED_OVER;
  return CashCutStatus.CLOSED_SHORT;
}
```

### Ubicación recomendada

`src/modules/commerce/cash/utils/cash-cut-status.ts`

### Presentación visual

| Estado | Badge color | Ícono | Texto |
|---|---|---|---|
| OPEN | blue | ● | Abierta |
| CLOSED_BALANCED | green | ✓ | Cuadrada |
| CLOSED_OVER | yellow | ↑ | Sobrante |
| CLOSED_SHORT | red | ↓ | Faltante |
| CANCELLED | gray | ✗ | Cancelada |

### ¿Persistir en BD?

No en esta versión. El estado derivado se calcula en el mapper/helper con los campos ya existentes (`status` + `difference_amount`). Solo vale la pena persistirlo si hay necesidad de filtrar o indexar por estado derivado en BD directamente, lo cual puede resolverse en PostgreSQL con una columna generada o índice parcial en el futuro si hay degradación de performance.

---

## 10. Diseño de reporte imprimible / exportable

### Patrón de exportación existente (a reusar)

El proyecto ya tiene:
- **`export-report-excel.ts`** — usa SheetJS (`xlsx`). Patrón: metablock (5 filas: título + período + filtros + fecha + vacía) + cabecera + filas + totales. Método: `XLSX.writeFile`. Client-side.
- **`export-report-pdf.ts`** — usa `jsPDF` + `jspdf-autotable`. Patrón: header descriptivo + tabla autotable con estilos zinc/dark. Orientación landscape o portrait según tablas. Client-side.

### A. Vista imprimible (HTML `@media print`)

Componente `CashCutPrintView` — visible solo al imprimir.

Secciones:
1. Encabezado empresa: nombre tenant, sucursal (location), dirección si disponible.
2. Encabezado sesión: caja (código + nombre), ID sesión, fecha y hora apertura/cierre.
3. Personal: cajero que abrió, cajero que cerró.
4. Resumen de efectivo: monto inicial, total efectivo cobrado, movimientos manuales netos, efectivo esperado, efectivo declarado, diferencia.
5. Resumen por método de pago: tabla con columnas Método / Total / # Operaciones / Afecta arqueo.
6. Movimientos manuales: tabla con columnas Tipo / Motivo / Monto / Hora / Usuario.
7. Ventas de la sesión: tabla resumida con columnas # Venta / Cliente / Total / Estado.
8. Línea de diferencia: resaltada si es faltante o sobrante.
9. Firmas: dos campos (Cajero / Supervisor) con líneas para firma física.

### B. Exportación PDF

Archivo: `export-cash-cut-pdf.ts` en `src/modules/commerce/cash/utils/`

Configuración:
- Orientación: portrait (A4).
- Unidad: mm.
- Header (primeras 40mm): título "REPORTE DE CORTE DE CAJA", nombre caja, período, fecha de impresión.
- Tabla 1 (Resumen de efectivo): 2 columnas, sin header destacado.
- Tabla 2 (Pagos por método): columnas Método / Total / # Ops.
- Tabla 3 (Movimientos manuales): columnas Tipo / Motivo / Monto / Hora.
- Tabla 4 (Ventas si aplicable): columnas # / Fecha / Total.
- Footer: espacio para firmas (cajero / supervisor).

### C. Exportación Excel

Archivo: `export-cash-cut-excel.ts` en `src/modules/commerce/cash/utils/`

Estructura de hojas:
- **Hoja 1 "Resumen"**: metablock (caja, período, cajero, estado) + resumen de efectivo + totales.
- **Hoja 2 "Pagos por Método"**: columnas Método / Es Efectivo / Total / # Operaciones.
- **Hoja 3 "Movimientos"**: columnas Tipo / Dirección / Motivo / Monto / Referencia / Hora / Usuario.
- **Hoja 4 "Ventas"** (si aplica, Fase 6D+): columnas # Venta / Fecha / Cliente / Total / Método Principal.

---

## 11. Modelo de datos propuesto (cambios al schema)

### Cambios en modelos existentes

```prisma
// Sale — formalizar FK y agregar índice
model Sale {
  // ... campos actuales ...
  cash_session_id  String?
  cash_session     CashSession? @relation(fields: [cash_session_id], references: [id])
  // Agregar:
  @@index([cash_session_id])
}

// SalePayment — agregar cash_session_id
model SalePayment {
  // ... campos actuales ...
  cash_session_id  String?
  cash_session     CashSession? @relation(fields: [cash_session_id], references: [id])
  // Agregar:
  @@index([cash_session_id])
}

// CashSession — relaciones inversas y campo closing_notes
model CashSession {
  // ... campos actuales ...
  opening_notes    String?   // separar de notes genérico
  closing_notes    String?   // separar de notes genérico
  // Relaciones inversas:
  sales            Sale[]
  sale_payments    SalePayment[]
  movements        CashMovement[]
}

// CashRegister — relación inversa movements
model CashRegister {
  // ... campos actuales ...
  movements CashMovement[]
}
```

### Nuevos modelos

```prisma
model CashMovement {
  id               String            @id @default(uuid())
  tenant_id        String
  location_id      String
  cash_session_id  String
  cash_register_id String
  movement_type    CashMovementType
  direction        MovementDirection
  amount           Decimal(10,2)
  reason           String
  reference        String?
  notes            String?
  performed_by     String
  performed_at     DateTime          @default(now())
  created_at       DateTime          @default(now())
  updated_at       DateTime          @updatedAt

  cash_session      CashSession  @relation(fields: [cash_session_id], references: [id])
  cash_register     CashRegister @relation(fields: [cash_register_id], references: [id])
  performed_by_user User         @relation("CashMovementPerformedBy", fields: [performed_by], references: [id])

  @@index([cash_session_id])
  @@index([tenant_id, location_id])
  @@index([performed_at])
  @@map("cash_movements")
}

enum CashMovementType {
  MANUAL_IN
  MANUAL_OUT
  CASH_WITHDRAWAL
  PETTY_EXPENSE
  ADJUSTMENT_UP
  ADJUSTMENT_DOWN
  REFUND_OUT
}

enum MovementDirection {
  IN
  OUT
}
```

---

## 12. Fases recomendadas de implementación

### Fase 5B — Schema CashMovement

**Objetivo:** Agregar `CashMovement` al schema + formalizar FK `Sale.cash_session_id` + agregar `SalePayment.cash_session_id`.

**Archivos que se tocan:**
- `prisma/schema.prisma` — nuevo modelo `CashMovement`, enum `CashMovementType`, enum `MovementDirection`, FK formal en `Sale`, nuevo campo en `SalePayment`, relaciones inversas en `CashSession` y `CashRegister`.
- `prisma/migrations/` — nueva migración.
- Posiblemente `src/modules/commerce/cash/types/cash.types.ts` — nuevos tipos para `CashMovement`.

**Impacto en BD:** Tabla nueva `cash_movements`. Columna nueva `sale_payments.cash_session_id`. Índice nuevo sobre `sales.cash_session_id` (si no existe). Restricción FK nueva en `sales.cash_session_id`.

**Riesgo:** La FK en `Sale.cash_session_id` puede fallar si hay registros existentes con `cash_session_id` no nulo pero apuntando a sesiones inexistentes. Se debe verificar antes de migrar.

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 5C — Backend de movimientos manuales

**Objetivo:** Implementar queries, service y actions para registrar, listar y eliminar (si aplica) movimientos manuales de caja.

**Archivos que se tocan:**
- `src/modules/commerce/cash/queries/list-cash-movements.ts` (nuevo)
- `src/modules/commerce/cash/services/cash-movement.service.ts` (nuevo)
- `src/modules/commerce/cash/actions/create-cash-movement.action.ts` (nuevo)
- `src/modules/commerce/cash/actions/list-cash-movements.action.ts` (nuevo)
- `src/modules/commerce/cash/types/cash.types.ts` (ampliar)
- `src/modules/commerce/cash/schemas/cash.schemas.ts` (ampliar)

**Lógica clave:**
- Validar que la sesión esté OPEN.
- Validar que `cash_session_id` pertenezca a tenant/location en scope.
- No permitir movimientos en sesiones CLOSED o CANCELLED.
- Actualizar `expected_cash_amount` de la sesión en la misma transacción al registrar un movimiento (o calcular on-the-fly en el reporte).

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 5D — Historial de sesiones y queries de corte

**Objetivo:** Implementar queries de listado de sesiones + query de corte completo.

**Archivos que se tocan:**
- `src/modules/commerce/cash/queries/list-cash-sessions.ts` (nuevo)
- `src/modules/commerce/cash/queries/get-cash-session-cut-report.ts` (nuevo)
- `src/modules/commerce/cash/queries/get-cash-session-movements.ts` (nuevo)
- `src/modules/commerce/cash/services/cash-read.service.ts` (ampliar)
- `src/modules/commerce/cash/actions/list-cash-sessions.action.ts` (nuevo)
- `src/modules/commerce/cash/actions/get-cash-session-cut-report.action.ts` (nuevo)
- `src/modules/commerce/cash/utils/cash-cut-status.ts` (nuevo helper derivado)
- `src/modules/commerce/cash/types/cash.types.ts` (tipos de corte)

**Duración estimada:** 1-2 sesiones de trabajo.

---

### Fase 5E — UI de historial y panel de corte

**Objetivo:** Agregar tab "Historial" en `/dashboard/cash` con tabla de sesiones, filtros y vista de corte por sesión.

**Archivos que se tocan:**
- `src/app/(dashboard)/dashboard/cash/page.tsx`
- `src/modules/commerce/cash/components/cash-client.tsx` (ampliar)
- `src/modules/commerce/cash/components/cash-session-history.tsx` (nuevo)
- `src/modules/commerce/cash/components/cash-cut-report.tsx` (nuevo)
- `src/modules/commerce/cash/components/cash-movement-form.tsx` (nuevo)
- `src/modules/commerce/cash/components/cash-movements-list.tsx` (nuevo)

**Duración estimada:** 2-3 sesiones de trabajo.

---

### Fase 5F — Reporte imprimible del corte

**Objetivo:** Implementar vista imprimible `@media print` del corte de caja.

**Archivos que se tocan:**
- `src/modules/commerce/cash/components/cash-cut-print-view.tsx` (nuevo)
- CSS/Tailwind con clases `print:` o hoja de estilos de impresión.

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 5G — Exportación PDF/Excel del corte

**Objetivo:** Implementar botones de exportación PDF y Excel reutilizando el patrón existente en reports.

**Archivos que se tocan:**
- `src/modules/commerce/cash/utils/export-cash-cut-pdf.ts` (nuevo)
- `src/modules/commerce/cash/utils/export-cash-cut-excel.ts` (nuevo)
- `src/modules/commerce/cash/components/cash-cut-report.tsx` (botones de exportación)

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 6A — Validar sesión abierta al confirmar venta (UI)

**Objetivo:** Advertir en la UI de ventas si no hay sesión de caja abierta, sin bloquear el flujo.

**Archivos que se tocan:**
- `src/modules/commerce/sales/components/` — banner/tooltip de advertencia.
- `src/modules/commerce/sales/actions/get-open-session-status.action.ts` (nuevo, o reusar `getOpenCashSessionAction`).

**No se toca:** `sale.service.ts`, schema, DTE.

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 6B — Asociar `Sale.cash_session_id` al confirmar

**Objetivo:** Al confirmar una venta, buscar sesión OPEN y asignar `Sale.cash_session_id` automáticamente.

**Archivos que se tocan:**
- `src/modules/commerce/sales/services/sale.service.ts` — en `confirmSale()`, agregar lookup de sesión y asignación.
- Depende de que Fase 5B ya haya formalizado la FK.

**Duración estimada:** 1 sesión de trabajo.

---

### Fase 6C — Asociar pagos a sesión y calcular resumen por método

**Objetivo:** Al registrar `SalePayment`, asociar `cash_session_id`. Calcular `expected_cash_amount` desde pagos CASH reales.

**Archivos que se tocan:**
- `src/modules/commerce/sales/services/sale-payment.service.ts` (nuevo o ampliar el existente).
- `src/modules/commerce/cash/services/cash-session.service.ts` — recálculo de `expected_cash_amount`.
- Schema (Fase 5B prerequisito).

**Duración estimada:** 1-2 sesiones de trabajo.

---

### Fase 6D — Actualizar corte con ventas y pagos reales

**Objetivo:** El reporte de corte incluye ventas confirmadas de la sesión y resumen real por método de pago.

**Archivos que se tocan:**
- `src/modules/commerce/cash/queries/get-cash-session-cut-report.ts` — ampliar query.
- `src/modules/commerce/cash/components/cash-cut-report.tsx` — actualizar UI.
- `src/modules/commerce/cash/utils/export-cash-cut-pdf.ts` — actualizar exportación.
- `src/modules/commerce/cash/utils/export-cash-cut-excel.ts` — actualizar exportación.

**Duración estimada:** 1 sesión de trabajo.

---

## 13. Archivos por fase (resumen)

| Fase | Crea | Modifica |
|---|---|---|
| 5B | `cash_movements` tabla (migración), tipos | `schema.prisma`, `cash.types.ts` |
| 5C | queries movimientos, service movimientos, actions | `cash.types.ts`, `cash.schemas.ts` |
| 5D | queries historial/corte, helper cut-status, actions | `cash-read.service.ts`, `cash.types.ts` |
| 5E | componentes historial/corte/movimiento UI | `cash/page.tsx`, `cash-client.tsx` |
| 5F | `cash-cut-print-view.tsx` | `cash-cut-report.tsx` |
| 5G | `export-cash-cut-pdf.ts`, `export-cash-cut-excel.ts` | `cash-cut-report.tsx` |
| 6A | action consulta sesión abierta | Sales UI components |
| 6B | — | `sale.service.ts` (confirmSale) |
| 6C | `sale-payment.service.ts` | `cash-session.service.ts` |
| 6D | — | query corte, UI corte, exportaciones |

---

## 14. Riesgos técnicos

### R1 — FK `Sale.cash_session_id` con datos existentes

**Descripción:** Si hay ventas confirmadas con `cash_session_id` apuntando a sesiones inexistentes, la migración que agrega la FK formal fallará.

**Mitigación:** Antes de la migración (Fase 5B), ejecutar query de verificación:
```sql
SELECT COUNT(*) FROM sales
WHERE cash_session_id IS NOT NULL
AND cash_session_id NOT IN (SELECT id FROM cash_sessions);
```
Si hay registros, limpiarlos (`SET cash_session_id = NULL`) antes de aplicar la FK.

---

### R2 — `expected_cash_amount` desincronizado

**Descripción:** Si se actualizan ventas o se anulan pagos después de cerrar una sesión, el `expected_cash_amount` guardado en `CashSession` puede quedar desactualizado.

**Mitigación:** Calcular `expected_cash_amount` on-the-fly en el reporte de corte, no depender solo del valor persistido para el reporte. El campo persistido sirve para el cierre oficial; el reporte puede recalcular.

---

### R3 — Doble sesión OPEN en condiciones de carrera

**Descripción:** La validación de sesión única está en la aplicación, no en BD. Si dos requests llegan simultáneamente, podrían crear dos sesiones OPEN.

**Mitigación a futuro:** Índice parcial único en PostgreSQL:
```sql
CREATE UNIQUE INDEX cash_sessions_unique_open
ON cash_sessions (cash_register_id)
WHERE status = 'OPEN';
```
Este índice se puede agregar en la migración de Fase 5B o en una fase posterior.

---

### R4 — `notes` única vs. `opening_notes` / `closing_notes`

**Descripción:** Actualmente hay un único campo `notes` en `CashSession`. Si se llena en apertura y se vuelve a escribir en cierre, se pierde la nota original.

**Mitigación:** Renombrar o agregar columnas `opening_notes` y `closing_notes`. Esto requiere migración. Puede hacerse en Fase 5B de forma segura (nullable, no rompe nada).

---

### R5 — Reporte de corte lento si hay muchas ventas por sesión

**Descripción:** El query de corte hace joins con `Sale`, `SaleItem`, `SalePayment` y `CashMovement`. Con muchas ventas, puede degradarse.

**Mitigación:** Usar aggregados en BD (SUM, COUNT via `_count` de Prisma o raw SQL) en vez de cargar todos los registros en memoria. Paginar la lista de ventas en el reporte.

---

### R6 — Dependencia de `sale.service.ts` sobre cash en Fase 6B

**Descripción:** Al agregar lookup de sesión abierta en `confirmSale()`, `sale.service.ts` adquiere dependencia de cash. Esto puede romper el módulo sales en tests.

**Mitigación:** Inyectar el `cash_session_id` como parámetro opcional en `confirmSale()`, no buscarlo internamente. La resolución de sesión abierta queda en la action, no en el service. Mantiene servicios desacoplados.

---

## 15. Reglas de no regresión

1. **No tocar DTE** desde el módulo cash bajo ninguna circunstancia. Cash no debe llamar a ningún servicio de generación, firma o transmisión de documentos fiscales.

2. **No tocar `sale.service.confirmSale()`** hasta Fase 6B, y solo para agregar `cash_session_id` como parámetro opcional.

3. **No modificar `InventoryMovement`** desde cash. Cash no genera ni consume movimientos de inventario.

4. **No cambiar `SaleStatus` ni `SalePaymentStatus`** como parte del módulo cash. Esos estados son de ventas y siguen su propio ciclo.

5. **No eliminar el campo `notes`** de `CashSession` si ya hay datos en producción. Renombrar o agregar campo nuevo.

6. **No bloquear confirmación de venta** si no hay sesión abierta (a menos que el negocio lo requiera explícitamente con instrucción separada).

7. **No modificar el patrón de exportación** de reports actuales (`export-report-excel.ts`, `export-report-pdf.ts`). Los nuevos archivos de exportación de caja son independientes.

8. **No mezclar lógica fiscal** dentro del reporte de caja. El reporte de caja es operativo, no fiscal.

9. **No rediseñar CashRegister**. El modelo de caja está bien diseñado y no requiere cambios.

10. **No modificar seed.ts ni seeds/**. El seed de `CAJA-01` seguirá funcionando sin cambios.

---

## 16. Qué no debe mezclarse con DTE

| Operación | ¿Va en DTE? | ¿Va en Cash? |
|---|---|---|
| Generar JSON de factura | Sí | No |
| Firmar documento fiscal | Sí | No |
| Transmitir a Hacienda | Sí | No |
| Invalidar DTE | Sí | No |
| Delivery externo MariaDB | Sí | No |
| Registrar pago en sesión de caja | No | Sí |
| Calcular efectivo esperado | No | Sí |
| Arqueo de caja | No | Sí |
| Movimientos manuales de caja | No | Sí |
| Reporte de corte | No | Sí |
| Exportar PDF/Excel del corte | No | Sí |

**Regla de separación:** `Sale.status = CONFIRMED` es el único vínculo entre el ciclo comercial y el ciclo fiscal. La sesión de caja no interviene en esa transición ni en la generación del DTE.

---

## 17. Qué no debe mezclarse con inventory

| Operación | ¿Va en Inventory? | ¿Va en Cash? |
|---|---|---|
| Registrar SALE_OUT | Sí (desde sale.service) | No |
| Decrementar current_stock | Sí | No |
| Registrar PURCHASE_IN | Sí (desde purchase.service) | No |
| Registrar devolución física | Sí (RETURN_IN) | No |
| Ajuste de stock | Sí (ADJUSTMENT_UP/DOWN) | No |
| REFUND_OUT monetario | No | Sí (CashMovement) |
| Reembolso en efectivo | No | Sí (CashMovement tipo REFUND_OUT) |

**Regla de separación:** Cash registra flujos de dinero. Inventory registra flujos de unidades físicas. Un reembolso implica ambos, pero son registros independientes: `CashMovement(REFUND_OUT)` en cash + `InventoryMovement(RETURN_IN)` en inventory si hay reingreso físico.

---

## 18. Pruebas manuales recomendadas por fase

### Fase 5B
- Ejecutar migración en local.
- Verificar tabla `cash_movements` creada con todos los campos.
- Verificar FK `sales.cash_session_id` con índice.
- Verificar `sale_payments.cash_session_id` nullable.
- Verificar que ventas existentes siguen funcionando (sin regresión en confirmación).

### Fase 5C
- Abrir sesión de caja.
- Registrar MANUAL_IN: verificar que aparece en lista de movimientos.
- Registrar MANUAL_OUT: verificar monto y dirección.
- Intentar registrar movimiento en sesión CLOSED: debe rechazarse.
- Verificar que `expected_cash_amount` se actualiza (si se persiste on-update).

### Fase 5D
- Abrir sesión, cerrar sesión.
- Consultar historial: debe aparecer la sesión con estado derivado correcto.
- Consultar corte: debe mostrar datos consistentes.
- Verificar diferencia: declarado < esperado → SHORT, declarado > esperado → OVER, igual → BALANCED.

### Fase 5E
- Navegar a /dashboard/cash → tab Historial.
- Filtrar por fecha, por caja, por estado.
- Abrir vista de corte de una sesión cerrada.
- Verificar que datos coinciden con lo esperado manualmente.

### Fase 5F
- Abrir vista de corte → clic "Imprimir".
- Verificar que el layout imprimible es correcto (no elementos de UI navegación visibles).
- Verificar secciones: resumen efectivo, pagos por método, movimientos, firmas.

### Fase 5G
- Exportar PDF del corte: verificar secciones, totales y formato.
- Exportar Excel del corte: verificar 4 hojas, datos correctos.

### Fase 6A
- Confirmar venta sin sesión abierta: debe aparecer advertencia, pero permitir confirmar.
- Confirmar venta con sesión abierta: sin advertencia.

### Fase 6B
- Confirmar venta con sesión abierta.
- Verificar en BD que `Sale.cash_session_id` quedó asignado a la sesión activa.
- Confirmar venta sin sesión: `Sale.cash_session_id` debe quedar NULL.

### Fase 6C
- Registrar pago CASH en venta de sesión abierta.
- Verificar `SalePayment.cash_session_id` asignado.
- Verificar que `expected_cash_amount` en CashSession refleja el pago.

### Fase 6D
- Reporte de corte debe mostrar ventas confirmadas durante la sesión.
- Resumen por método de pago debe cuadrar con ventas registradas.
- Exportar PDF y Excel: verificar que la hoja "Ventas" tiene datos reales.

---

## Apéndice — Campos ausentes que conviene agregar en Fase 5B

| Campo | Modelo | Tipo | Justificación |
|---|---|---|---|
| `opening_notes` | `CashSession` | `String?` | Separar nota de apertura de cierre |
| `closing_notes` | `CashSession` | `String?` | Separar nota de cierre de apertura |
| `cash_session_id` (FK) | `SalePayment` | `String?` | Vincular pago a sesión de caja |
| `cash_session_id` (FK formal) | `Sale` | `String?` | Formalizar relación existente |
| índice parcial OPEN | `CashSession` | índice PostgreSQL | Garantía BD sesión única |
