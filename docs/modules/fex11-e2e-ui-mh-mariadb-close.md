# FEX 11 — Cierre técnico end-to-end UI + MH TEST + MariaDB

> Microfase F3-C20. Documento de **cierre documental y verificación**. No se creó funcionalidad nueva, no se tocó UI, no se tocaron actions ni services, no se transmitió, no se firmó, no se creó ningún DTE nuevo, no se modificó `schema.prisma`, no se crearon migraciones. Basado en el estado confirmado en F3-C0 a F3-C19 y en una consulta read-only a la base local del último caso `FEX11_UI_TEST_*`.

## 1. Resumen ejecutivo

FEX 11 quedó validada end-to-end en ambiente TEST desde una consola interna del sistema:

```
Consola interna UI (/dashboard/dte/fex11-test)
→ creación de caso de prueba
→ generación JSON
→ validación AJV
→ firma
→ transmisión Hacienda TEST
→ respuesta ACCEPTED
→ envío a MariaDB externo
```

Aclaración explícita:

- Esto **no** significa habilitación comercial final.
- Esto **no** significa producción.
- Esto **no** habilita FEX 11 en la pantalla normal de ventas.
- Esto **no** elimina el feature flag.
- Esto valida el pipeline técnico completo, de punta a punta, detrás de una consola interna protegida.

## 2. Alcance probado

- Creación de venta/DTE FEX 11 de prueba desde UI interna (`createFex11TestCaseAction`).
- Generación de `json_document` (`generateFexJsonForSaleAction`, reutilizado sin cambios desde F3-C10B/F3-C18).
- Validación contra schema FEX 11 (AJV, `fe-fex-v1.json`).
- Persistencia del JSON en `DteOutgoingDocument.json_document`.
- Firma con firmador local/TEST (`signDteDocumentAction`, reutilizado sin cambios desde F3-C12/F3-C18).
- Transmisión a Hacienda TEST (`transmitDteDocumentAction`, reutilizado sin cambios desde F3-C14/F3-C18).
- Respuesta `ACCEPTED`.
- Persistencia de `mh_response` (saneado).
- Persistencia de `reception_stamp`.
- Envío a MariaDB externo (`deliverDteToExternalDbAction`, reutilizado sin cambios desde F3-C16/F3-C18).
- Registro `DteTransmissionLog` con `operation_type = "EXTERNAL_DELIVERY"`.
- Guards server-side activos en cada paso (`fex11-feature-guard.ts`, `requireConsoleSession` en `fex11-test-console.actions.ts`).

## 3. Flujo probado desde UI

Ruta: `/dashboard/dte/fex11-test`.

Pasos ejecutados por el usuario:

1. Crear nuevo caso de prueba FEX 11.
2. Generar JSON.
3. Firmar.
4. Transmitir a Hacienda TEST.
5. Enviar a MariaDB.
6. Refrescar estado.

Cada botón de la consola delega en las mismas actions ya probadas para FE/CCFE/NC (`generateFexJsonForSaleAction`, `signDteDocumentAction`, `transmitDteDocumentAction`, `deliverDteToExternalDbAction`); la consola solo agrega el guard de flag/`NODE_ENV`, resolución de tenant/location desde sesión, y lectura de estado seguro (`fex11-test-console.actions.ts:1-258`).

## 4. Evidencia funcional

La prueba manual fue ejecutada por el usuario desde la consola interna. Adicionalmente, se consultó la base local (read-only, sin imprimir `signed_jws` ni `json_document` completos) para confirmar el último caso `FEX11_UI_TEST_*`:

| Campo | Valor |
|---|---|
| `case_marker` | `FEX11_UI_TEST_20260731_105701` |
| `control_number` | `DTE-11-M001P001-000000000000003` |
| `generation_code` | `50504BD0-67D2-4190-894A-C214CCB291B6` |
| `dte_status` final | `ACCEPTED` |
| `json_document` presente | Sí |
| `signed_jws` presente | Sí |
| `reception_stamp` presente | Sí |
| `accepted_at` | `2026-07-31T16:57:22.286Z` |
| `EXTERNAL_DELIVERY` exitoso (`DteTransmissionLog`) | Sí |

No se imprime `signed_jws` completo, no se imprime `json_document` completo, no se imprime token MH ni credenciales MariaDB.

## 5. Catálogos oficiales usados

- **CAT-031 INCOTERMS**: `09` = FOB-Libre a bordo.
- **CAT-028 Régimen**: `EX-1.1000.000` = Exportación Definitiva, Exportación Definitiva, Régimen Común.
- **CAT-027 Recinto fiscal**: `02` = Marítima de Acajutla.
- **CAT-015 Tributos**: `C3` = Impuesto al Valor Agregado exportaciones 0%.
- **CAT-014 Unidad de medida**: `36`, usado por `UnitOfMeasure.mh_unit_code` del producto de prueba (`fex11-test-data.ts::ensureUnit`).
- **CAT-020 País**: `9540` (Estados Unidos), usado por el receptor de prueba (`fex11-test-data.ts::ensureCustomer`).
- **CAT-029 Tipo de persona**: `2` (natural), usado por el receptor de prueba (`fex11-test-data.ts::ensureCustomer`).

Detalle completo en `docs/dte-official/extracts/fex11-catalog-values-used.md`.

Este cierre no reemplaza la necesidad de versionar catálogos completos para producción.

## 6. Estados técnicos alcanzados

```
PENDING_GENERATION
→ SCHEMA_VALIDATED
→ SIGNED
→ ACCEPTED
→ EXTERNAL_DELIVERY exitoso
```

Confirmado contra el caso `FEX11_UI_TEST_20260731_105701` (Sección 4).

## 7. Guards y controles vigentes

- `DTE_FEX11_TEST_ENABLED=YES` requerido (`fex11-feature-guard.ts::isFex11TestEnabled`).
- `NODE_ENV=production` bloqueado en el guard de flag y en el guard de sesión de consola (`requireConsoleSession`).
- `environment TEST` requerido (`canUseFex11InServerFlow`).
- tenant/location resueltos desde sesión, nunca desde input (`getEffectiveLocationId`, mismo patrón que FE/CCFE/NC).
- `requireAdmin` exigido antes de cualquier acción de consola.
- FEX 11 no habilitada por defecto (flag apagado por defecto).
- FEX 11 no habilitada en UI comercial (`/dashboard/sales/**` no expone tipo 11).
- FEX 11 no habilitada en producción (bloqueo explícito por `NODE_ENV`).

## 8. Qué sigue bloqueado

- La pantalla normal de ventas no crea FEX 11.
- El selector comercial de tipo DTE no expone FEX 11.
- No existe formulario comercial final para exportación (captura de `SaleExportDetails` desde UI de ventas).
- No hay catálogo completo versionado en UI (país, incoterms, régimen, recinto fiscal, tipo de persona).
- No hay validación productiva completa de catálogos antes de transmitir.
- Producción bloqueada.
- El flujo entero sigue detrás del feature flag `DTE_FEX11_TEST_ENABLED`.

## 9. Diferencia entre consola interna y flujo comercial final

La consola `/dashboard/dte/fex11-test` es una herramienta interna de prueba técnica, protegida por flag, `requireAdmin` y bloqueo de producción. Genera sus propios datos de prueba (cliente, producto, venta) de forma idempotente/marcada (`FEX11_UI_TEST_*`), no reutiliza datos comerciales reales.

No reemplaza la experiencia comercial final, donde un usuario debería poder crear una venta de exportación real desde el flujo normal de ventas, capturando todos los campos fiscales de `SaleExportDetails` y del receptor extranjero con validación de catálogos en tiempo de captura.

## 10. Riesgos pendientes

1. Falta UI comercial final para capturar exportación (formulario de venta con `SaleExportDetails`).
2. Falta catálogo completo versionado para INCOTERMS/régimen/recinto/país/tipo de persona (hoy solo el subconjunto mínimo usado en pruebas, ver Sección 5).
3. Falta validación server-side completa de catálogos FEX antes de transmitir (hoy AJV valida forma, no exactitud de catálogo completo).
4. Falta definir quién puede emitir FEX 11 (rol/alcance específico, más allá de `requireAdmin` de la consola de prueba).
5. Falta política de reintento para `REJECTED`/`OBSERVED`.
6. Falta definir comportamiento contable/inventario para exportaciones reales.
7. Falta revisión fiscal/contable antes de producción.
8. Falta regresión final FE/CCFE/NC después de abrir FEX 11 comercialmente (la regresión de que los services compartidos no se rompieron ya se cubrió en F3-C11/F3-C13/F3-C15/F3-C17, pero falta repetirla tras habilitar UI comercial).
9. Falta decidir si FEX 11 se integra al flujo normal de ventas o queda en pantalla dedicada.
10. Falta hardening de logs para operación productiva.

## 11. Criterio para pasar a UI comercial final

**GO** futuro si:

- Catálogos FEX están versionados (país, incoterms, régimen, recinto, tipo de persona).
- UI captura todos los campos de exportación (`SaleExportDetails` + receptor extranjero).
- Server actions validan catálogos completos, no solo forma AJV.
- Backend con flag sigue funcionando como base.
- MariaDB validado (ya confirmado en esta fase).
- Hacienda TEST validado (ya confirmado en esta fase).
- FE/CCFE/NC no se rompen (regresión explícita tras abrir UI comercial).
- Aprobación fiscal/operativa del negocio.
- Plan de producción definido.

**NO-GO** si:

- Se quiere habilitar producción sin catálogos completos.
- Se quieren usar placeholders en captura comercial.
- Se quiere quitar el feature flag sin UI comercial validada.
- Se quiere emitir FEX 11 desde venta normal sin capturar `SaleExportDetails` real.

## 12. Decisión final

- FEX 11 pipeline técnico end-to-end TEST: **GO**.
- FEX 11 consola interna de prueba: **GO**.
- FEX 11 integración MariaDB TEST: **GO**.
- FEX 11 UI comercial normal: **NO-GO**.
- FEX 11 producción: **NO-GO**.
- FEX 11 sin feature flag: **NO-GO**.

---

## Impacto en bases de datos y sincronización local/remota

- **Schema tocado**: ninguno. `prisma/schema.prisma` no fue modificado en esta microfase.
- **Migración generada**: ninguna.
- **Base aplicada**: ninguna — no se ejecutó `prisma migrate` ni `prisma db push`. Se ejecutó una única consulta read-only contra la base local (`DATABASE_URL`) para leer el último caso `FEX11_UI_TEST_*`, sin escribir ni modificar datos, mediante un script temporal fuera del repositorio, eliminado inmediatamente después de la consulta.
- **Alineación local/remoto**: sin cambios — no se vio afectada, ya que no hubo cambios de schema ni de datos en esta microfase.
- **Pendiente**: F3-C20 es solo documentación/verificación; no requiere ninguna acción de sincronización de bases de datos.
