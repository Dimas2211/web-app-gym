# Architecture — contexto activo liviano

Los documentos largos anteriores fueron movidos a:

docs/_archive_heavy/architecture_2026_04_28

Regla para Claude:
No leer archivos archivados salvo instrucción explícita.

Contexto activo recomendado:
- docs/context/current-state.md
- docs/modules/products-summary.md
- docs/modules/inventory-summary.md
- docs/modules/purchases-summary.md
- docs/modules/suppliers-summary.md

La arquitectura activa se resume así:
- Monolito modular.
- Identidad oficial: tenant_id / location_id.
- Core contiene la lógica compartida.
- Commerce contiene products, inventory, suppliers, purchases, sales y cash.
- Gym es una vertical específica.
- Módulos cerrados no se rediseñan.