# Autorización Operativa — Clave de Supervisor (core)

Estado: implementada localmente (pendiente revisión, migración y commit).
Código: `src/core/security/operational-authorization/`.

## Qué es

Una única Clave de Supervisor **por tenant**, almacenada en la **Runtime DB**
del cliente (`tenant_security_configs`, modelo `TenantSecurityConfig`). Sirve de
segunda autorización para operaciones sensibles de Products, Commerce Customers,
Purchases y Sales.

- **`EDIT_CATALOG_PIN` quedó eliminado.** Era del modelo "un deploy por cliente".
  No hay fallback a `.env`, no hay clave por defecto ni clave fija en código.
  La variable puede borrarse de `.env` y de Vercel.
- Products, Purchases y Sales **ya no piden correo + contraseña de administrador**.
  El helper legacy `src/lib/permissions/delete-authorization.ts` sigue vigente
  solo para los módulos no migrados (Users, Clients GYM, Memberships, Trainers,
  Weekly Plans).

## Almacenamiento

- Solo se guarda el hash bcrypt (`supervisor_pin_hash`, coste 10). El texto claro
  nunca se persiste, se devuelve ni se registra en logs.
- Ninguna API, action ni componente devuelve el hash. La UI solo sabe si la clave
  está configurada y la fecha de última actualización.
- Anti fuerza bruta: 5 intentos fallidos seguidos bloquean la clave 5 minutos
  (`supervisor_pin_failed_attempts`, `supervisor_pin_locked_until`).
- **Fail closed:** si no hay configuración o no hay hash, toda operación
  protegida queda bloqueada.

## Administración

Ruta: **Configuración → Seguridad** (`/dashboard/settings/security`).

- Requiere `requireGlobalAdmin` y rol LIVE `isGlobal`.
- Permite establecer, cambiar o restablecer la clave: nueva clave + confirmación,
  6–32 caracteres, sin espacios.
- No existe recuperación: restablecer significa introducir una clave nueva.
- Cambiar la clave revoca todos los grants emitidos con la anterior.
- Una Support Session (solo lectura) ve el estado pero no puede modificar la clave.

## Operaciones protegidas (scopes)

| Scope | Operación | Mecanismo |
|---|---|---|
| `PRODUCT_EDIT` | editar producto (`updateProductAction`) | grant por producto |
| `CUSTOMER_EDIT` | editar maestro Commerce Customers (cabecera, 4 pestañas, `PATCH /api/customers/:id`) | grant por cliente |
| `PURCHASE_EDIT` | editar compra DRAFT (página `/edit`, cabecera, líneas, naturaleza de pago en DRAFT, rutas API de líneas) | grant por compra |
| `SALE_EDIT` | editar venta DRAFT (`/sales/new?sale_id=`, cabecera, líneas, recálculo, rutas API) | grant por venta |
| `PURCHASE_DELETE_DRAFT` | eliminar compra DRAFT | clave de un solo uso |
| `PURCHASE_CANCEL_CONFIRMED` | anular compra CONFIRMED (la reversión de inventario no cambia) | clave de un solo uso |
| `SALE_DELETE_DRAFT` | eliminar venta DRAFT | clave de un solo uso |
| `SALE_CANCEL_CONFIRMED` | anular venta CONFIRMED → CANCELLED (`cancelConfirmedSaleAction`): sin borrado físico, RETURN_IN si `inventory_moved`, REFUND_OUT si hubo efectivo en caja OPEN; bloquea con DTE no invalidado o caja cerrada | clave de un solo uso |
| `PURCHASE_DRAFT_OWNER` / `SALE_DRAFT_OWNER` | seguir capturando un borrador **recién creado** sin clave | grant emitido por el servidor al crear |

Con el grant de creador (`*_DRAFT_OWNER`), quien crea un borrador puede seguir
capturándolo sin clave. Un borrador existente que se reabre desde la consulta
exige la clave. Descartar o anular el propio borrador desde la pantalla de captura
requiere el grant de creador. Un grant de edición obtenido con clave no permite
eliminar: no se puede pasar de editar a eliminar con el mismo grant.

Sin clave: activar o desactivar un cliente (`updateCustomerStatusAction`, igual
que el estado de un producto), crear borradores y consultar.

## Grant temporal

- Token HMAC-SHA256 en una cookie `HttpOnly`, `SameSite=strict`, `Secure` en
  producción. Hay una cookie por scope y entidad (`zoa_<scope>_<id>`).
- El token queda ligado a `tenant_id` y `user_id` efectivos (resueltos en el
  servidor), al scope, al `entity_id` y a la huella de la clave vigente.
- Vigencia de los grants por clave: 10 minutos sin uso, que se renuevan con cada
  write válido, y un máximo absoluto de 60 minutos. Grants de creador: 60 minutos
  sin uso y un máximo de 12 horas.
- La clave HMAC se deriva de `AUTH_SECRET` (o `NEXTAUTH_SECRET`). Si no hay
  secreto, todo falla cerrado.
- La verificación ocurre en cada Server Action o Route Handler protegido y en las
  páginas de edición, que no renuevan el grant. Abrir un modal o modificar la URL
  no da autorización.
- `DELETE /api/purchases/:id` está deshabilitado (devuelve 403). La eliminación
  pasa por `deleteDraftPurchaseWithAuthAction`.

## Compatibilidad runtime

- Toda lectura y escritura usa `context.client` de `requireOperationalContext`.
  Esto cubre la Runtime DB de RUNTIME_CLIENT, Dedicated Runtime (TrustMe) y
  PLATFORM. Nunca usa Prisma global.
- Support Session de solo lectura no puede obtener grants, configurar la clave ni
  ejecutar operaciones protegidas.
- No cambia DTE (firma, transmisión, correlativos, NC, invalidación, delivery),
  inventario ni el enforcement de módulos.

## Migración

`prisma/migrations/20261005000000_add_tenant_security_config` es aditiva: crea
una tabla nueva y no toca las existentes. Debe aplicarse en **cada** base runtime
de cliente y en la base local. Hasta que el administrador configure la clave,
las operaciones protegidas de ese tenant permanecen bloqueadas.
