# FSE 14 y COV — Decisión MVP y Roadmap V2

## 1. Resumen ejecutivo

FSE 14 (Factura de Sujeto Excluido Electrónica) queda **fuera del MVP actual**. No bloquea la operación vigente del sistema y su implementación requeriría cambios estructurales sensibles sobre un modelo ya cerrado y probado (`DteOutgoingDocument`).

El sistema ya permite registrar compras mediante `Purchase` con `document_type = "COV"`. Este flujo cubre control interno, registro de compras, afectación de inventario/gasto y sirve como base para futura reportería contable.

COV **no equivale** a una FSE 14 electrónica transmitida y aceptada por Hacienda. Es un registro operativo interno, no un documento tributario electrónico.

## 2. Qué es COV en el sistema actual

- COV no es una tabla ni entidad separada.
- COV es un valor del campo `Purchase.document_type` (junto a CCF, FAC, NCR, NCI, COP).
- Significa "Comprobante de Venta".
- Representa un documento interno o recibido del proveedor, sin equivalente DTE formal ante el MH.
- Permite cubrir compras sin DTE formal para control operativo (inventario, gasto, historial de compras).
- Puede usarse a futuro para reportes contables de compras a sujetos excluidos, siempre que se completen los datos fiscales del proveedor que hoy faltan (ver sección 10).

## 3. Qué es FSE 14

- FSE 14 es la Factura de Sujeto Excluido Electrónica.
- No pertenece al flujo de ventas.
- Pertenece al dominio de compras/proveedores.
- El emisor del documento sería nuestra empresa (el comprador).
- El sujeto excluido sería el proveedor o persona a quien se le compra.
- El JSON oficial usa conceptos como:
  - `sujetoExcluido`
  - `compra`
  - `totalCompra`
  - `ivaRete1`
  - `reteRenta`
  - `totalPagar`

## 4. Decisión MVP

```text
No implementar FSE 14 en el MVP actual.
```

Motivos:

1. FE 01 ya funciona.
2. CCFE 03 ya funciona.
3. NC 05 ya funciona.
4. Invalidación ya funciona.
5. Compras internas ya funcionan.
6. COV permite registrar compras operativamente.
7. FSE 14 requiere tocar `DteOutgoingDocument`, que ya está cerrado y probado para ventas.
8. No hay necesidad urgente confirmada por cliente/contador.

## 5. Qué cubre COV hoy

| Necesidad | COV/Purchase actual | Cubierto |
|---|---|---|
| Registrar compra | Sí | Sí |
| Registrar proveedor | Sí | Sí |
| Registrar fecha | Sí | Sí |
| Registrar número de comprobante | Sí | Sí |
| Registrar líneas/productos | Sí | Sí |
| Afectar inventario/gasto | Sí, según flujo de compra | Sí |
| Reporte futuro para contabilidad | Posible | Parcial |
| Firma electrónica DTE | No | No |
| Transmisión a Hacienda | No | No |
| Sello de recepción MH | No | No |
| DteOutgoingDocument tipo 14 | No | No |

## 6. Qué NO cubre COV

COV no cubre:

- `generation_code`
- `control_number`
- `json_document` oficial FSE
- `signed_jws`
- transmisión MH
- `mh_response`
- `reception_stamp`
- estado fiscal DTE
- `DteTransmissionLog`
- tablero DTE como documento saliente formal

## 7. Por qué no emitir FSE directamente desde COV

Esta alternativa queda **descartada**.

Emitir FSE 14 directamente desde COV, sin pasar por `DteOutgoingDocument`, generaría deuda técnica porque duplicaría:

- correlativos
- estados fiscales
- JSON
- firma
- transmisión
- respuesta MH
- logs
- delivery externo
- reintentos
- auditoría fiscal

Conclusión:

```text
COV puede ser fuente operativa.
COV no debe convertirse en pipeline fiscal paralelo.
```

## 8. Arquitectura futura recomendada

```text
Purchase con document_type = COV
→ DteOutgoingDocument tipo 14
→ JSON FSE 14
→ validación AJV
→ firma
→ transmisión MH
→ respuesta/sello
→ tablero DTE
```

```text
Purchase/COV = origen operativo
DteOutgoingDocument = salida fiscal
```

## 9. Cambios estructurales requeridos para V2

Sin implementar, solo como referencia para diseño futuro:

1. Volver `DteOutgoingDocument.sale_id` nullable.
2. Agregar `purchase_id` nullable.
3. Agregar relación `Purchase → DteOutgoingDocument`.
4. Validar por servicio que cada DTE tenga exactamente un origen: `sale_id` o `purchase_id`, nunca ambos, nunca ninguno.
5. Crear builder JSON FSE 14.
6. Registrar schema AJV `fe-fse-v1.json`.
7. Crear UI desde compras/proveedores.
8. Crear validaciones de proveedor sujeto excluido.
9. Confirmar retenciones.
10. Probar regresión completa FE/CCFE/NC/Invalidación.

## 10. Gaps antes de implementar FSE 14

Bloqueantes para V2:

1. Falta marcador formal de `Supplier` como sujeto excluido.
2. Falta confirmar si `NON_TAXPAYER` basta o si se necesita booleano/enum nuevo.
3. Falta campo para `reteRenta`.
4. Falta confirmar si `retention_1pct_amount` corresponde a `ivaRete1`.
5. Falta decidir cómo manejar compras sin producto real.
6. Falta decidir si se usará producto/servicio genérico.
7. Falta confirmar con contabilidad si FSE 14 electrónica es necesaria en el sistema o si se manejará fuera.

## 11. Riesgos de implementarla ahora

- Riesgo de romper DTE ya cerrado.
- Riesgo de migración sobre `DteOutgoingDocument`.
- Riesgo de mezclar compras y ventas.
- Riesgo de mapear mal retenciones.
- Riesgo de clasificar mal proveedores.
- Riesgo de duplicar pipeline fiscal si se evita `DteOutgoingDocument`.

## 12. Criterios para retomar FSE 14

Se retomará si ocurre una de estas condiciones:

1. Un cliente lo solicita explícitamente.
2. Contabilidad confirma que debe emitirse FSE 14 electrónica desde el sistema.
3. Se requiere presentar formalmente compras a sujeto excluido con DTE emitido.
4. La plataforma pasa a una fase fiscal avanzada V2.
5. El módulo de contabilidad necesita cerrar reportería fiscal formal de sujetos excluidos.

## 13. Decisión final

```text
FSE 14 queda como V2 fiscal avanzada.
COV se mantiene como registro operativo/contable interno.
No se toca DteOutgoingDocument en MVP.
No se emite FSE 14 directamente desde COV.
Cuando se implemente, COV/Purchase será la fuente y DteOutgoingDocument será la salida fiscal.
```

## 14. Próximas fases sugeridas

```text
FSE14-V2-A — Confirmación contable/fiscal de requisitos.
FSE14-V2-B — Diseño de datos Supplier/Purchase para sujeto excluido.
FSE14-V2-C — Migración DteOutgoingDocument sale_id/purchase_id.
FSE14-V2-D — Builder JSON FSE 14 + AJV.
FSE14-V2-E — UI desde compras.
FSE14-V2-F — Firma/transmisión MH TEST.
FSE14-V2-G — Regresión FE/CCFE/NC/Invalidación.
```
