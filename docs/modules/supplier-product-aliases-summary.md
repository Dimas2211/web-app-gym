# Supplier Product Aliases — resumen operativo

## Rol

Tabla de equivalencias entre códigos/nombres usados por el proveedor en sus DTE y los
productos internos del catálogo. Permite que el sistema aprenda a reconocer automáticamente
los productos de un proveedor concreto en importaciones futuras.

## Entidad

`supplier_product_aliases`

| Campo         | Descripción                                              |
|---------------|----------------------------------------------------------|
| `tenant_id`   | Alias específico por tenant. No es global.               |
| `supplier_id` | Alias específico por proveedor dentro del tenant.        |
| `alias_code`  | Código del producto tal como lo usa el proveedor en DTE. |
| `alias_name`  | Nombre del producto tal como aparece en el DTE.          |
| `product_id`  | Producto interno equivalente.                            |

## Creación de alias

- Un alias **nunca se crea automáticamente**.
- Solo se guarda si el usuario marca explícitamente la opción
  *"Recordar esta vinculación para este proveedor"* al vincular una línea DTE a un producto interno.
- Si el alias ya existe apuntando al mismo producto, no se duplica.
- Si el alias ya existe apuntando a un producto distinto, **no se sobrescribe**;
  el sistema devuelve un warning. La compra puede crearse igual.

## Orden de matching de productos DTE

Al detectar a qué producto interno corresponde una línea DTE, el sistema sigue este orden:

1. `SUPPLIER_ALIAS_CODE` — coincidencia exacta por código de alias del proveedor.
2. `SUPPLIER_ALIAS_NAME` — coincidencia exacta por nombre de alias del proveedor.
3. `CODE_EXACT` — coincidencia exacta por código interno del producto.
4. `NAME_SIMILAR` / `PARTIAL_WORDS` — similitud de nombre.
5. `NONE` — sin match; requiere vinculación manual.

## Endpoint de match

```
GET /api/purchases/dte-import/[id]/match?supplier_id=...
```

- `supplier_id` es opcional pero recomendado: prioriza alias del proveedor seleccionado.
- Se valida que `supplier_id` pertenezca al `tenant_id` del request.
- Útil cuando el usuario selecciona manualmente un proveedor y se necesita recalcular el matching.

## Estado

Cerrado y operativo.
Forma parte del flujo de importación DTE de purchases.
No rediseñar salvo instrucción explícita.
