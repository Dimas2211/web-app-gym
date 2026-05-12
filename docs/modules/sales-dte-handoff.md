# Sales / Facturación electrónica DTE — handoff de arranque

## Estado actual de commerce al iniciar este módulo

| Módulo                         | Estado                  |
|--------------------------------|-------------------------|
| `commerce/products`            | Cerrado y operativo     |
| `commerce/inventory`           | Cerrado y operativo     |
| `commerce/suppliers`           | Cerrado y operativo     |
| `commerce/purchases`           | Cerrado y operativo     |
| Importación DTE de compras     | Cerrada y operativa     |
| Supplier-product aliases       | Cerrado y operativo     |
| `commerce/sales`               | **Ciclo interno cerrado — pendiente DTE real** |
| `commerce/cash`                | Pendiente               |

---

## Separación crítica

- `purchases` = recepción e importación de **documentos de proveedor** (DTE entrantes).
- `sales` = emisión de **documentos propios** (DTE salientes/outgoing).

**No mezclar** la lógica de importación DTE de compras con la emisión DTE de ventas.
Son flujos opuestos con contratos distintos.

---

## Dependencias de sales

Sales debe apoyarse en los módulos ya cerrados:

| Módulo          | Rol dentro de sales                                      |
|-----------------|----------------------------------------------------------|
| `products`      | Catálogo de lo que se vende.                             |
| `inventory`     | Salida de stock al confirmar/emitir venta.               |
| `suppliers`     | Solo referencia de patrón maestro, no dependencia directa. |
| `purchases`     | Referencia de arquitectura: servicios, API, UI, estados. |

---

## Orden recomendado de diseño

Sales debe diseñarse primero como **backend/modelo de datos**, no arrancar por UI final.

1. Definir entidades: `Sale`, `SaleItem`, `Customer`/`Receptor`.
2. Definir estados de la venta y el documento DTE outgoing.
3. Definir tipos DTE aplicables (ver más abajo).
4. Definir el evento exacto que mueve inventario.
5. Definir correlativos internos y su lógica.
6. Planificar firma y transmisión a Hacienda.
7. Construir servicios y API.
8. Construir UI.

---

## Tipos DTE a considerar

- Factura de consumidor final (CCF).
- Crédito fiscal (CF).
- Nota de crédito.
- Nota de débito.
- Comprobante de liquidación (si aplica).
- Otros según normativa DTE El Salvador vigente.

---

## Pendientes principales

### Modelo de datos
- `Sale` (cabecera del documento de venta)
- `SaleItem` (líneas de la venta)
- `Customer` / `Receptor` (entidad del comprador)
- `DteOutgoingDocument` (representación del XML/JSON DTE emitido)

### Flujo DTE outgoing
- Correlativos internos por tipo de documento.
- Ambiente prueba / ambiente producción.
- Generación del JSON DTE según esquema MH.
- Firma electrónica del documento.
- Transmisión al Ministerio de Hacienda.
- Recepción y almacenamiento de respuesta MH.
- Almacenamiento del sello de recepción.
- Manejo de contingencia (emisión sin conectividad).
- Invalidación / anulación de documentos emitidos.

### Integraciones
- Integración con inventory: salida de stock al confirmar emisión.
- Integración futura con cash: cierre de caja incluye ventas del período.
- Reportes de ventas por período, tipo DTE, cliente, etc.

---

## Reglas iniciales obligatorias

- No tocar `purchases`.
- No romper `inventory`, `suppliers` ni `products`.
- No mover inventario hasta que el evento de confirmación/emisión esté definido y acordado.
- No implementar firma electrónica ni transmisión sin revisar documentación oficial del MH.
- Diseñar estados del documento antes de construir UI.
- Respetar la separación `core` / `commerce` / `gym`.
- `Customer`/`Receptor` debe diseñarse como entidad de `commerce` o `core`, no dentro de gym.

---

## Referencias útiles

- Documentación DTE El Salvador — Ministerio de Hacienda (ver PDFs oficiales del MH).
- Arquitectura de purchases como referencia de patrón de servicios y API.
- `docs/modules/purchases-summary.md` — estado de purchases como referencia.
- `docs/modules/inventory-summary.md` — reglas de movimientos de stock.
- `docs/modules/supplier-product-aliases-summary.md` — patrón de matching (referencia para clientes en ventas).
