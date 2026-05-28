# cash-summary.md

## Estado del módulo

**CERRADO Y OPERATIVO** — Cierre técnico validado el 2026-05-28.

---

## Alcance actual

El módulo de caja cubre el ciclo operativo completo para una sucursal:

- Apertura de sesión de caja con monto inicial.
- Asociación automática de ventas confirmadas a la sesión abierta.
- Registro de movimientos manuales (entradas, salidas, retiros, gastos).
- Solo pagos en efectivo (código MH "01") incrementan el efectivo esperado.
- Historial de sesiones con filtros por estado y diferencias.
- Panel de corte por sesión: montos, movimientos, ventas, pagos por forma de pago.
- Vista imprimible del corte (`window.print()`).
- Exportación PDF y Excel del corte.
- Cierre de sesión con monto declarado, diferencia calculada y estado de cuadre.
- Advertencia en ventas si no hay caja abierta en la sucursal.

---

## Modelos y tablas relacionadas

| Modelo Prisma | Tabla PostgreSQL | Función |
|---|---|---|
| `CashRegister` | `cash_registers` | Caja física o virtual registrada por sucursal |
| `CashSession` | `cash_sessions` | Sesión de apertura/cierre de una caja |
| `CashMovement` | `cash_movements` | Movimientos manuales dentro de una sesión |
| `Sale` | `sales` | Venta confirmada — columna `cash_session_id` opcional |
| `SalePayment` | `sale_payments` | Pago individual — columna `cash_session_id` opcional |

### Enums

| Enum | Valores |
|---|---|
| `CashSessionStatus` | `OPEN`, `CLOSED`, `CANCELLED` |
| `CashMovementType` | `MANUAL_IN`, `MANUAL_OUT`, `CASH_WITHDRAWAL`, `PETTY_EXPENSE`, `ADJUSTMENT_UP`, `ADJUSTMENT_DOWN`, `REFUND_OUT` |
| `CashMovementDirection` | `IN`, `OUT` |

### Índices relevantes

- `cash_registers`: único `(tenant_id, location_id, code)`.
- `cash_sessions`: índice `(tenant_id, location_id, status)`.
- `sales`: índice `(tenant_id, location_id, cash_session_id)`.
- `sale_payments`: índice `(cash_session_id)`.
- `cash_movements`: índice `(tenant_id, location_id, cash_session_id)`.

---

## Migraciones aplicadas

| Migración | Contenido |
|---|---|
| `20260525173150_add_cash_base` | Tablas `cash_registers` y `cash_sessions`, enum `CashSessionStatus` |
| `20260525200620_add_cash_movements_and_session_links` | Tabla `cash_movements`, FK `sales.cash_session_id`, columna `sale_payments.cash_session_id`, enums `CashMovementType` y `CashMovementDirection` |

---

## Flujo operativo

### 1. Abrir caja

1. Usuario navega a `/dashboard/cash`.
2. Selecciona una caja de la lista (cajas configuradas para la sucursal).
3. Si no hay sesión abierta, completa el formulario de apertura con monto inicial y notas opcionales.
4. `openCashSessionAction` → `openCashSession` (service) → transacción Prisma:
   - Valida que la caja exista y esté activa.
   - Valida que no haya otra sesión OPEN para esa caja.
   - Crea `CashSession` con `status=OPEN`, `opening_amount=expected_cash_amount`.

### 2. Confirmar venta (asociación automática)

En `sale.service.confirmSale()`:
1. Si la venta viene de DRAFT, llama a `getAnyOpenCashSessionForLocation`.
2. Si hay sesión OPEN, asigna `Sale.cash_session_id = openSession.id`.
3. Crea `SalePayment` con `cash_session_id = openSession.id`.
4. Si el pago es en efectivo (`mh_payment_form_code === "01"`), llama a `applyCashPaymentToSession` para incrementar `expected_cash_amount`.
5. Si no hay sesión abierta, la venta se confirma con `cash_session_id = null` (no bloquea).

### 3. Registrar movimiento manual

1. Con sesión abierta, el usuario llena el formulario de movimiento (tipo, monto, razón).
2. `createCashMovementAction` → `recordCashMovement` (service) → transacción Prisma:
   - Valida que la sesión esté OPEN.
   - Deriva dirección (IN/OUT) del tipo de movimiento — nunca del cliente.
   - Verifica que un movimiento OUT no deje `expected_cash_amount` negativo.
   - Crea `CashMovement`.
   - Actualiza `expected_cash_amount` de la sesión.

### 4. Revisar corte

1. En el historial de sesiones, el usuario selecciona una sesión.
2. `getCashSessionCutReportAction` → `getCashSessionCutReport` (query):
   - Carga la sesión validando `tenant_id + location_id`.
   - Carga movimientos manuales (todos los `CashMovement` de la sesión).
   - Carga pagos (`SalePayment` por `cash_session_id`, filtrados por tenant/location via `Sale`).
   - Agrupa pagos por forma de pago.
   - Cuenta ventas confirmadas asociadas.
   - Calcula `cut_status` derivado (`OPEN`, `CLOSED_BALANCED`, `CLOSED_OVER`, `CLOSED_SHORT`, `CANCELLED`).
3. El panel muestra: monto inicial, entradas manuales, salidas manuales, efectivo esperado, monto declarado (si cerrada), diferencia, ventas, pagos, movimientos.

### 5. Cerrar caja

1. Con sesión abierta, el usuario llena el monto declarado y notas de cierre.
2. `closeCashSessionAction` → `closeCashSession` (service) → transacción Prisma:
   - Busca la sesión con `status=OPEN` en scope.
   - Si no existe, retorna error (previene doble cierre).
   - Calcula `difference_amount = declared - expected`.
   - Actualiza la sesión a `status=CLOSED`, `closed_at`, `closed_by`.

---

## Reglas de negocio

1. Solo puede haber una sesión `OPEN` por caja (`cash_register_id`) a la vez — validado en transacción de apertura.
2. Una caja puede estar inactiva (`is_active=false`) y no aparecer en la lista operativa.
3. Si hay múltiples cajas abiertas en una location, la confirmación de venta toma la más reciente por `opened_at`.
4. Solo los pagos en efectivo (`mh_payment_form_code="01"`) modifican `expected_cash_amount`. Los demás métodos aparecen en el corte informativo.
5. Un movimiento OUT no puede dejar `expected_cash_amount` en negativo — se rechaza en el service.
6. Una sesión CLOSED no puede cerrarse de nuevo — la validación requiere `status=OPEN`.
7. Una venta puede confirmarse sin caja abierta (`cash_session_id = null`). No hay bloqueo por política.
8. Los `CashMovement` son auditables e inmutables — no se eliminan en operación normal.
9. La diferencia de corte (`difference_amount`) es: `declared - expected`. Positivo = sobrante, negativo = faltante.

---

## Permisos

| Operación | Roles permitidos |
|---|---|
| Ver lista de cajas | `super_admin`, `branch_admin` |
| Abrir sesión | `super_admin`, `branch_admin` |
| Cerrar sesión | `super_admin`, `branch_admin` |
| Registrar movimiento manual | `super_admin`, `branch_admin` |
| Ver historial de sesiones | `super_admin`, `branch_admin` |
| Ver corte de sesión | `super_admin`, `branch_admin` |
| Exportar PDF/Excel del corte | `super_admin`, `branch_admin` |

Guard activo: `requireAdmin` en todos los actions.

**Nota operativa:** El rol `reception` actualmente no tiene acceso al módulo de caja. Si se requiere en el futuro, debe ajustarse el guard de las actions o crear un guard específico.

---

## Relación con ventas

La asociación venta ↔ caja es automática y ocurre al confirmar la venta:

- `Sale.cash_session_id` — FK opcional a `cash_sessions`. Se asigna si hay sesión OPEN al confirmar.
- `SalePayment.cash_session_id` — FK opcional. Se asigna al crear el pago de la venta.
- Solo pagos `mh_payment_form_code="01"` (efectivo) afectan `expected_cash_amount`.
- Ventas canceladas/anuladas posteriores no modifican retroactivamente `expected_cash_amount`.

---

## Relación con reportes

El corte de caja puede exportarse como:
- **PDF** (`exportCashCutPdf`) — `src/modules/commerce/cash/utils/export-cash-cut-pdf.ts`
- **Excel** (`exportCashCutExcel`) — `src/modules/commerce/cash/utils/export-cash-cut-excel.ts`
- **Impresión** — vista `CashSessionCutPrintView` visible solo en `@media print`

El módulo de reportes generales de commerce (`/dashboard/reports`) es independiente del corte de caja.

---

## Archivos principales del módulo

```
src/modules/commerce/cash/
  queries/
    list-cash-registers.ts
    get-cash-register-by-id.ts
    get-open-cash-session.ts
    get-any-open-cash-session-for-location.ts
    list-cash-movements-by-session.ts
    list-cash-sessions.ts
    get-cash-session-cut-report.ts
  services/
    cash-read.service.ts
    cash-session.service.ts
    cash-movement.service.ts
    cash-session-payment.service.ts
  actions/
    get-cash-workspace-state.action.ts
    open-cash-session.action.ts
    close-cash-session.action.ts
    create-cash-movement.action.ts
    list-cash-movements.action.ts
    list-cash-sessions.action.ts
    get-cash-session-cut-report.action.ts
    list-cash-registers.action.ts
    get-cash-register-detail.action.ts
    get-open-cash-session.action.ts
  components/
    cash-client.tsx
    cash-movement-form.tsx
    cash-movements-table.tsx
    cash-sessions-history.tsx
    cash-session-cut-panel.tsx
    cash-session-cut-print-view.tsx
  schemas/
    cash.schemas.ts
  types/
    cash.types.ts
  utils/
    derive-cash-cut-status.ts
    cash-payment-method-labels.ts
    export-cash-cut-pdf.ts
    export-cash-cut-excel.ts
```

---

## Pendientes futuros (no bloqueantes)

| Pendiente | Impacto | Urgencia |
|---|---|---|
| Índice parcial único `OPEN` en BD por `cash_register_id` | Solo validación a nivel app — riesgo bajo en bajo volumen | Baja |
| Separar `notes` en `opening_notes` / `closing_notes` | Campo único `notes` puede sobrescribirse entre apertura y cierre | Baja |
| Acceso rol `reception` a operaciones de caja | Actualmente solo `branch_admin`/`super_admin` pueden operar | Media (según necesidad operativa) |
| Actualizar `payment_status` en `Sale` tras pago registrado | Actualmente `Sale.payment_status` no se actualiza automáticamente | Media |
| Anulación de ventas confirmadas con reversión en caja | No implementado aún | Media |

---

## Validaciones técnicas ejecutadas (cierre 2026-05-28)

- `npx tsc --noEmit` → sin errores.
- `npm run lint` → sin errores ni warnings en el módulo cash. Warnings menores pre-existentes en otros módulos.
- `npx prisma migrate status` → base local al día (31 migraciones aplicadas).
- Corrección aplicada: comentario obsoleto en `prisma/schema.prisma` línea `Sale.cash_session_id` actualizado (`sin FK formal` → `FK en cash_sessions`).

---

## Comportamiento operativo confirmado

| Escenario | Comportamiento |
|---|---|
| Sin caja configurada | UI muestra "No hay cajas configuradas para esta sucursal" |
| Sin sesión abierta | UI muestra formulario de apertura; advertencia en ventas con link a Caja |
| Apertura de caja | Valida unicidad OPEN por caja en transacción — rechaza si ya existe sesión abierta |
| Venta con caja abierta | `Sale.cash_session_id` asignado; efectivo incrementado si pago en efectivo |
| Venta sin caja abierta | `Sale.cash_session_id = null`; venta se confirma normalmente |
| Movimiento OUT mayor al esperado | Rechazado con error — `expected_cash_amount` no puede ser negativo |
| Cierre de caja | Calcula diferencia; actualiza estado a CLOSED |
| Doble cierre | Rechazado — service valida `status=OPEN` antes de cerrar |
| Corte de sesión | Muestra ventas, pagos por forma de pago, movimientos, totales, diferencia |
