# Fase 5.1H: expediente de correlativos COR-01 y COR-03

Fecha: 2026-11-24 · Alcance: **solo diagnóstico**. No se modificó ninguna secuencia, ni se reinició, retrocedió o renumeró ningún correlativo. No se tocó `dte-correlative.service.ts`.

Archivos consultados (los identificados en Fase 4):
- `src/modules/commerce/dte/services/dte-correlative.service.ts`
- `src/modules/commerce/dte/utils/dte-control-number.ts`
- `prisma/schema.prisma` (modelos `DteCorrelative` y `DteOutgoingDocument`)

## 1. Secuencia actual

Formato (`dte-control-number.ts`): `DTE-{tipo(2)}-{codEstableMH(4)}{codPuntoVentaMH(4)}-{secuencia(15)}`.

Reserva (`reserveDteControlNumber`, `:89-160`), siempre dentro de la transacción del llamador:

```
siguiente = max(
  DteCorrelative.last_sequence                       (fila del año en curso),
  máxima secuencia en DteOutgoingDocument con el mismo prefijo
    (tenant + location + environment + tipo + estable/punto), SIN filtro de año ni de estado,
  DteCorrelative.external_baseline_last_used_sequence (fila del año en curso)
) + 1
```

- Partición de la fila `DteCorrelative`: `tenant_id + location_id + issuer_config_id + environment + dte_type_code + year`.
- `year = new Date().getFullYear()`, calculado con la zona horaria del proceso (`:94`, `:204`, `:299`, `:380`).
- Bloqueo de concurrencia: `UPDATE … last_sequence + 1` sobre la fila (bloqueo de fila). En la reserva en bloque (MH TEST) primero se hace `createMany … skipDuplicates` y luego un `UPDATE` de bloqueo, antes de leer el piso (`:216-240`).

## 2. Claves de unicidad

| Tabla | Clave | ¿Incluye el año? |
|---|---|---|
| `dte_correlatives` | `(tenant_id, location_id, issuer_config_id, environment, dte_type_code, year)` | Sí |
| `dte_outgoing_documents` | `(tenant_id, environment, control_number)` | **No** |

El número de control no codifica el año. La unicidad documental es "una vez por tenant y ambiente, para siempre".

## 3. Comportamiento al cambiar de año (verificado leyendo el código)

1. La primera reserva de 2027 crea una fila `DteCorrelative` nueva con `year = 2027`, `last_sequence = 0` y `external_baseline_last_used_sequence = NULL`.
2. El piso toma la máxima secuencia de **todos** los documentos del prefijo, sin filtrar por año, así que la secuencia **continúa** (máximo + 1). No vuelve a 1.
3. Aunque el piso filtrara por año, el `unique` documental sin año rechazaría `…-000000000000001` porque ese número ya existe en 2026 (P2002).

## 4. Riesgos concretos al 1 de enero de 2027

| ID | Riesgo | Efecto | Severidad |
|---|---|---|---|
| R-COR-1 (COR-01) | La secuencia continúa en lugar de reiniciarse en `000000000000001` | No se cumple el texto literal de MH20-005 (Normativa 2.0, regla 7.1.2 y Anexo IV campo 5; antes Normativa 1.2, regla 7.2 y Anexo II campo 4). **No hay números repetidos.** No está confirmado que MH lo rechace en recepción. | P1, decisión interna urgente |
| R-COR-2 (COR-02) | Año según la zona horaria del proceso | Con el proceso en UTC, la fila 2027 se crea el 31/12/2026 a las 18:00 hora de El Salvador (UTC−6). Mientras COR-01 siga vigente, el número no cambia (el piso es global). Si se implementa el reinicio sin corregir esto, los DTE emitidos entre las 18:00 y las 23:59 del 31/12 tomarían la numeración de 2027. | Bajo hoy, **alto si se implementa COR-01 sin corregirlo** |
| R-COR-3 | Carrera al crear la fila del nuevo año en `reserveDteControlNumber` | Usa `upsert` (SELECT + INSERT). Dos reservas concurrentes al primer instante de 2027 pueden fallar con P2002 en una de ellas, y esa venta no obtiene su DTE (se puede reintentar; no duplica). La reserva en bloque ya usa `createMany … skipDuplicates`. | Medio (operativo, se puede reintentar) |
| R-COR-4 | La línea base externa no pasa a la fila nueva | `external_baseline_last_used_sequence` vive en la fila de 2026. En un prefijo donde Zolvi **nunca** emitió (solo hay línea base de un sistema anterior), el piso de 2027 sale de 0 y la secuencia vuelve a 1. En prefijos con historia en Zolvi, continúa. El comportamiento queda inconsistente entre prefijos. | Medio: coherencia, no duplicado dentro de Zolvi |
| R-COR-5 (COR-03) | Numeración por tipo de DTE y por punto de venta | La Normativa 2.0 (MH20-004, regla 7.1.2) solo admite numeración centralizada o por establecimiento. La numeración por punto de venta o por tipo queda prohibida "salvo resolución expresa de la AT". Zolvi numera por tipo, establecimiento y punto de venta. | **P0 para activar 2.0 en PRODUCTION** (en el registro de bloqueos) |

## 5. Evidencia normativa

- **MH20-005**: "Reiniciar en '000000000000001' a partir del primer DTE de cada ejercicio impositivo; no repetirse del 01 de enero al 31 de diciembre" (Normativa 2.0, regla 7.1.2, p. 16; Anexo IV campo 5, p. 102). La Normativa 1.2 ya lo exigía (regla 7.2, p. 11; Anexo II campo 4, p. 37), así que **COR-01 no es exclusivo de 2.0**.
- **MH20-004**: "Numeración centralizada (continua sin importar el establecimiento) o por establecimiento (independiente por establecimiento). No podrá asignarse por Punto de Venta ni por tipo de documento salvo resolución expresa de la AT" (Normativa 2.0, regla 7.1.2, pp. 15-16, verificado visualmente en Fase 0).
- Sigue sin confirmar cómo se interpreta la sección 2 del número (el tipo de DTE) frente a la prohibición "por tipo".

## 6. Alternativas

### COR-01 (reinicio anual)

| Alternativa | Descripción | Ventajas | Inconvenientes |
|---|---|---|---|
| A. Mantener la continuidad | No cambiar nada y registrar una decisión formal | Sin migración, sin riesgo de duplicados | Incumple el texto literal desde la 1.2. Es un riesgo de observación de MH |
| B. Reinicio con año fiscal persistido | Nueva columna `fiscal_year` en `dte_outgoing_documents` (fecha de generación en America/El_Salvador), `unique (tenant_id, environment, fiscal_year, control_number)` y piso filtrado por `fiscal_year` | Cumple MH20-005 | Migración del `unique` en tablas grandes, backfill del año de los históricos (derivable de `fecEmi` del `json_document`, sin reescribirlo) y cambio de consultas de piso y reconciliación. A cinco semanas del cierre |
| C. Reinicio solo para documentos nuevos (`fiscal_year` nullable) | Igual que B, pero los históricos quedan con `NULL` y el `unique` parcial solo aplica a `fiscal_year IS NOT NULL` | Sin backfill | Dos regímenes de unicidad conviviendo. Requiere un índice parcial (SQL manual en la migración) |

Con B o C hace falta corregir también COR-02 (zona America/El_Salvador) y R-COR-3 (`createMany … skipDuplicates` en la reserva simple).

### COR-03 (modalidad)

| Alternativa | Descripción |
|---|---|
| A. Resolución de la AT por cliente | Mantener la numeración actual y registrar en `numbering_modality` (M1, declarativa) la resolución que la autoriza |
| B. Numeración por establecimiento | Partición `tenant + environment + cod_estable_mh` (sin tipo ni punto de venta). Cambio profundo en la reserva y en los pisos |
| C. Centralizada | Una sola secuencia por tenant y ambiente |

B y C cambian la partición de `dte_correlatives` y la semántica de la línea base. No deben aplicarse a documentos ya emitidos.

## 7. Impacto en documentos históricos

- Ninguna alternativa debe reescribir `control_number`, `json_document`, `signed_jws` ni el sello de documentos emitidos.
- En COR-01 B, el backfill de `fiscal_year` se deriva de `json_document.identificacion.fecEmi` (lectura), sin modificar el JSON.
- Los receptores externos (MariaDB) ya recibieron números continuos y no deben recibir renumeraciones.

## 8. Impacto en concurrencia

- El bloqueo actual es por fila `DteCorrelative` y por año. Una partición más amplia (COR-03 B o C) convierte la fila en un punto caliente para todo el establecimiento o tenant, y la contención crece con los puntos de venta.
- R-COR-3 se corrige con `createMany … skipDuplicates`, que ya se usa en la reserva en bloque.

## 9. Migraciones potenciales (no preparadas)

| ID | Contenido | Dependencia |
|---|---|---|
| M-COR-01 | `fiscal_year INT NULL` en `dte_outgoing_documents` y un `unique` nuevo (completo o parcial), retirando el actual | Decisión COR-01 B o C |
| M-COR-03 | Cambio de partición de `dte_correlatives` (o una tabla nueva de secuencias por modalidad) | Decisión COR-03 B o C |

## 10. Pendiente de confirmación

1. **Decisión interna antes del 2026-12-31**: COR-01 A, B o C. Responsable: dirección del producto y asesor fiscal.
2. Pregunta a MH: ¿se valida el reinicio en recepción? ¿Rechaza MH un número continuo en el ejercicio nuevo?
3. Pregunta a MH: interpretación de "por tipo de documento" frente a la sección 2 del número de control (COR-03).
4. Por cliente: ¿existe una resolución de la AT que autorice la numeración por punto de venta o por tipo?
5. Zona horaria efectiva del proceso en cada despliegue (COR-02).
