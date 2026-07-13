# Cierre Técnico — Data Onboarding Controlado desde Platform Admin

## 1. Resumen ejecutivo

Esta etapa habilita la preparación controlada de bases cliente/demo desde Platform Admin mediante plantillas Excel, validación previa y análisis contra la base destino, y runners seguros de importación.

El objetivo no fue crear un importador libre de datos, sino un flujo controlado, auditable y seguro que permita poblar una base cliente/demo con datos maestros iniciales sin acceso manual a la base de datos y sin exponer secretos de conexión en la interfaz.

## 2. Objetivo de la etapa

La etapa permite cargar datos maestros iniciales de una base cliente sin tocar manualmente la base de datos y sin cambiar variables `.env`.

Incluye:

- preparación de catálogos comerciales (categorías, líneas, sublíneas);
- preparación de clientes/proveedores;
- preparación de productos;
- carga inicial de inventario;
- asociación segura entre perfil de base y tenant operativo.

## 3. Alcance funcional implementado

### 3.1 Categorías

- Importación real habilitada.
- Política CREATE_ONLY.
- No updates/upserts/deletes.
- Validación contra duplicados.

### 3.2 Líneas

- Importación real habilitada.
- Dependencia obligatoria con categoría.
- Validación de pertenencia a categoría.

### 3.3 Sublíneas

- Importación real habilitada.
- Dependencia obligatoria con línea.
- Validación de pertenencia a línea.

### 3.4 Clientes

- Importación real habilitada.
- Llaves naturales:
  - NIT;
  - DUI;
  - nombre normalizado como llave débil.
- `customer_code` generado de forma segura cuando aplica.
- Campos no persistidos documentados en plantilla.

### 3.5 Proveedores

- Importación real habilitada.
- Llaves naturales:
  - NIT;
  - nombre normalizado como llave débil.
- `supplier_code` generado según patrón del sistema.
- `classification` documentado como no mapeado a `TaxpayerType`.

### 3.6 Productos

- Importación real habilitada.
- `product_code` requerido, no se autogenera.
- Dependencias:
  - categoría;
  - unidad de medida;
  - línea opcional;
  - sublínea opcional;
  - proveedor opcional;
  - tasa/impuesto opcional.
- No toca inventario.
- Validación de ambigüedad de dependencias implementada (E1C-D.1).

### 3.7 Inventario inicial

- Importación real habilitada.
- Crea `ProductLocation` + `InventoryMovement` tipo `INITIAL_LOAD`.
- Cantidad estrictamente mayor que cero.
- Solo productos con:
  - `product_type = PRODUCT`;
  - `is_stockable = true`;
  - `status = ACTIVE`.
- Una sola carga inicial por producto+sucursal.
- Bloqueo por doble candado:
  - existencia de `ProductLocation`;
  - existencia de `InventoryMovement INITIAL_LOAD`.

## 4. Tenant Binding y perfiles de base

Documentación de C7 — Organization Tenant Binding & Auto-Discovery:

- `PlatformDatabaseProfile` conecta a una base destino.
- `PlatformOrganization.tenant_id` representa el tenant operativo dentro de la base runtime.
- El tenant se detecta desde la tabla `gyms`.
- La detección es read-only.
- El binding requiere:
  - superadmin;
  - clave administrativa;
  - confirmación textual `BIND TENANT`.
- No se expone `DATABASE_URL`.
- No se expone password ni `encrypted_password`.
- No hay auto-bind silencioso.

### 4.1 Base existente

```text
Perfil BD → Detectar tenant → Asignar tenant → Data onboarding habilitado
```

### 4.2 Base nueva futura

```text
Provisioning → Crear base → Migraciones → Crear gyms → Guardar gym.id en organization.tenant_id
```

El provisioning automático completo queda fuera de esta etapa.

## 5. Flujo operativo de uso

```text
1. Crear o seleccionar perfil de base.
2. Probar conexión.
3. Detectar tenant.
4. Asociar tenant a organización.
5. Abrir Data Onboarding.
6. Descargar plantilla Excel.
7. Completar hoja Datos.
8. Subir archivo.
9. Validar archivo.
10. Ejecutar DB-aware preview.
11. Revisar errores/warnings.
12. Escribir confirmación textual.
13. Ejecutar importación.
14. Revisar resultado.
15. Consultar visor/inspector.
```

## 6. Reglas de seguridad aplicadas

- Solo `super_admin`.
- Bloqueo de `PRODUCTION`.
- Execution safety gate con `RUN_IMPORT`.
- Confirmación textual por dataset.
- Re-parseo server-side.
- Re-análisis DB-aware server-side.
- No se confía en el preview generado en el cliente.
- Sin secrets en UI.
- Sin `DATABASE_URL` expuesto.
- Sin passwords expuestos.
- Sin `$executeRaw`.
- Sin updates.
- Sin upserts.
- Sin deletes.
- Sin import parcial.
- Transacciones atómicas.
- Logs administrativos.

## 7. Confirmaciones textuales

| Dataset            | Confirmación             |
| ------------------ | ------------------------ |
| Categorías         | IMPORT CATEGORIES        |
| Líneas              | IMPORT LINES              |
| Sublíneas          | IMPORT SUBLINES          |
| Clientes            | IMPORT CUSTOMERS          |
| Proveedores        | IMPORT SUPPLIERS         |
| Productos          | IMPORT PRODUCTS           |
| Inventario inicial | IMPORT INITIAL INVENTORY |
| Tenant binding      | BIND TENANT                |

## 8. Política CREATE_ONLY

Todos los imports operan en modo `CREATE_ONLY`.

- Si existe registro equivalente, se bloquea.
- No se actualizan registros existentes.
- No se reemplazan datos.
- No se hacen upserts.
- No se eliminan registros.
- Si una fila falla, se bloquea todo el lote.

## 9. DB-aware preview

El preview no solo valida el Excel, también compara contra la base destino.

Cubre:

- duplicados contra DB;
- dependencias faltantes;
- dependencias ambiguas;
- jerarquía inconsistente;
- registros existentes;
- datos inválidos;
- reglas de inventario.

## 10. Validaciones por dataset

| Dataset            | Llave principal         | Dependencias                                                                | Tablas escritas                       |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------- |
| Categorías         | name/code                | tenant                                                                        | ProductCategory                          |
| Líneas              | category + name/code    | ProductCategory                                                              | ProductLine                              |
| Sublíneas          | line + name/code         | ProductLine                                                                  | ProductSubline                           |
| Clientes            | NIT/DUI/nombre           | tenant                                                                        | Customer                                  |
| Proveedores        | NIT/nombre                | tenant                                                                        | Supplier                                  |
| Productos          | product_code              | Category, Unit, Line/Subline opcional, Supplier opcional, TaxRate opcional | Product                                    |
| Inventario inicial | product_code + branch    | Product, Branch                                                              | ProductLocation, InventoryMovement       |

## 11. Inventario inicial: contrato especial

- No es una actualización de stock.
- Es apertura inicial.
- Solo una vez por producto+sucursal.
- Crea `ProductLocation`.
- Crea `InventoryMovement INITIAL_LOAD`.
- `stock_before = 0`.
- `resulting_stock = quantity`.
- `current_stock = quantity`.
- Si se necesita corregir después, debe hacerse con ajustes, no reimportando carga inicial.

```text
Producto Coca-Cola 600ml + Sucursal Central
Carga inicial: 10 unidades ✅

Intentar volver a importar Coca-Cola 600ml + Sucursal Central
Bloqueado ❌

Corrección posterior:
usar ajuste positivo/negativo, no carga inicial.
```

## 12. Logs y auditoría

Se registra en `PlatformDeploymentLog`.

Metadata permitida:

- profileId;
- profileLabel;
- tenantId;
- datasetKey;
- importPolicy;
- created;
- skipped;
- errors;
- totalRows;
- productLocationsCreated;
- movementsCreated.

Metadata prohibida:

- passwords;
- encrypted_password;
- DATABASE_URL;
- adminKey;
- Excel completo;
- secretos.

## 13. Archivos principales implementados

Tenant binding:

```text
src/modules/platform/lib/tenant-binding/tenant-discovery.ts
src/modules/platform/actions/detect-database-profile-tenant.action.ts
src/modules/platform/actions/bind-organization-tenant.action.ts
src/modules/platform/components/platform-tenant-binding-modal.tsx
```

Data onboarding base:

```text
src/modules/platform/lib/data-onboarding/data-onboarding-definitions.ts
src/modules/platform/lib/data-onboarding/excel-template-generator.ts
src/modules/platform/lib/data-onboarding/excel-preview-parser.ts
src/modules/platform/lib/data-onboarding/db-aware-preview-analyzer.ts
src/modules/platform/components/platform-data-onboarding-client.tsx
```

Import runners:

```text
src/modules/platform/lib/data-onboarding/import-runners/categories-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/lines-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/sublines-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/customers-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/suppliers-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/products-import-runner.ts
src/modules/platform/lib/data-onboarding/import-runners/inventory-import-runner.ts
```

Actions:

```text
src/modules/platform/actions/import-data-onboarding-categories.action.ts
src/modules/platform/actions/import-data-onboarding-lines.action.ts
src/modules/platform/actions/import-data-onboarding-sublines.action.ts
src/modules/platform/actions/import-data-onboarding-customers.action.ts
src/modules/platform/actions/import-data-onboarding-suppliers.action.ts
src/modules/platform/actions/import-data-onboarding-products.action.ts
src/modules/platform/actions/import-data-onboarding-inventory.action.ts
```

## 14. Validaciones ejecutadas

Se ejecutó repetidamente durante la etapa:

```bash
npx prisma validate
npx tsc --noEmit
```

Y en fases posteriores también:

```bash
npm run build
```

cuando aplicó según la respuesta de Claude en cada microfase.

## 15. Pruebas manuales realizadas

Se probaron durante la etapa:

- tenant binding en perfil local/TrustMe;
- líneas y sublíneas;
- clientes y proveedores;
- productos;
- inventario inicial;
- duplicados;
- dependencias inexistentes;
- confirmaciones incorrectas;
- bloqueo por carga inicial repetida;
- errores de `tax_rate_name` con `IVA 13%` vs `IVA`;
- ambigüedad de unidad por `Unidad` y uso de símbolo como `UND`.

Pendiente (no confirmado en esta etapa):

- pruebas de carga masiva con volumen alto de filas;
- pruebas de concurrencia (dos operadores ejecutando import simultáneo sobre el mismo perfil/dataset).

## 16. Decisiones técnicas importantes

- `tenant_id` vive en `PlatformOrganization`, no en el perfil.
- El perfil solo almacena conexión.
- El tenant operativo viene de `gyms.id`.
- Inventario inicial no usa `recordInventoryMovement()` porque ese servicio requiere `ProductLocation` preexistente.
- E1C-E1 usa transacción propia para crear `ProductLocation` + `InventoryMovement`.
- Productos no generan `product_code`.
- Clientes/proveedores sí tienen generación controlada de códigos cuando aplica.
- Dependencias de productos se bloquean si son ambiguas (E1C-D.1).

## 17. Fuera de alcance

- updates masivos;
- upserts;
- rollback automático;
- snapshot/backup previo;
- exportaciones;
- inventario correctivo posterior;
- ajustes de stock;
- compras/ventas;
- DTE;
- provisioning completo de bases nuevas;
- sincronización local/remota;
- multi-tenant avanzado;
- permisos granulares distintos de superadmin.

## 18. Riesgos residuales

- requiere datos base correctos en catálogos;
- nombres duplicados pueden bloquear imports;
- sucursales con `tenant_id = null` no serán detectadas;
- tax rates deben coincidir por nombre real;
- inventario inicial no debe usarse para correcciones;
- si se elimina manualmente un `ProductLocation` o movimiento, puede romper la idempotencia esperada.

## 19. Recomendaciones operativas

- usar bases SANDBOX/LOCAL primero;
- revisar preview antes de importar;
- no reutilizar Excel de inventario inicial;
- mantener nombres únicos en catálogos;
- usar símbolos de unidad cuando el nombre sea ambiguo;
- documentar códigos de producto;
- hacer backup manual antes de cargas grandes mientras no exista snapshot automático.

## 20. Próximas etapas sugeridas

### Opción A — Exportaciones controladas

- exportar productos;
- clientes;
- proveedores;
- inventario;
- catálogos.

### Opción B — Snapshots / backups antes de import

- snapshot antes de import;
- restore manual;
- evidencia de import.

### Opción C — Auditoría avanzada de imports

- vista de logs;
- historial por perfil;
- detalle por dataset;
- descarga de resultado.

### Opción D — Rollback controlado

- rollback solo de import recién ejecutado;
- requiere trazabilidad más fina por batch.

### Opción E — Provisioning completo

- crear base nueva;
- migraciones;
- crear tenant;
- auto-bind;
- seed inicial;
- preflight;
- onboarding.

## 21. Estado final de la etapa

La etapa queda técnicamente cerrada. La plataforma puede preparar una base cliente/demo desde Platform Admin mediante importación controlada por Excel, manteniendo validaciones contra la base destino, bloqueo de producción, confirmaciones textuales, ejecución transaccional y auditoría administrativa.
