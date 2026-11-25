# MH 2.0 — Fase 9.2A: plan de despliegue (TEST con Compaws)

**Nada de esto se ha ejecutado.** Cada paso requiere autorización propia.

## 1. Hechos que condicionan el plan

- **Un solo proyecto Vercel** (`web-app-gym`) sirve el Control Plane y todos los runtimes; la organización se resuelve por hostname (`resolve-organization-by-hostname.ts`). Desplegar a Production cambia el código para **todos** los clientes.
- Las bases son compartidas entre ambientes: un Preview usaría las mismas bases que Production. **Las migraciones afectan a producción sea cual sea el mecanismo de despliegue.**
- El código nuevo lee `fiscal_year` y las columnas M1. Sin las migraciones daría P2022. **Orden obligatorio: migrar → desplegar.**
- Con flags apagados, el código consolidado se comporta como MH 1.2 (golden 8/8, certificación 77/77).

## 2. Compatibilidad de cada migración con el código desplegado (`main` actual)

| Migración | Tipo | Código viejo sobre schema nuevo | Código nuevo | Históricos y clientes 1.2 |
|---|---|---|---|---|
| M1 | Columnas nullable y CHECK que admiten NULL | Compatible: no las lee y sus inserts dejan NULL | Requerida | NULL = MH 1.2 |
| M1b, M2 | Tablas nuevas | Compatible: no las usa | Requeridas | Sin efecto |
| M4, M5 | Tablas e índice nuevos (uso solo en el CP) | Compatible | Requeridas | Sin filas; corridas 1.2 sin perfil (probado) |
| **M-COR-01** | Columna, backfill y **cambio de unicidad** | Ver §3 | Requerida | Backfill de solo lectura; 0 ambiguos en CP y runtime |

## 3. COR-01 en el intervalo entre migrar y desplegar

**Código viejo** (`main`):

- reserva por `dte_correlatives` con clave que incluye `year = new Date().getFullYear()` (UTC en Vercel);
- calcula el piso con **todos** los documentos del prefijo;
- inserta sin `fiscal_year`, es decir, NULL;
- no referencia el nombre del único eliminado; solo trata `P2002` de forma genérica.

**Efecto del schema nuevo:**

| Riesgo | Análisis | Resultado |
|---|---|---|
| Duplicado entre dos inserts del código viejo | Ambos quedan con NULL y el índice parcial `…_legacy_control_number_key` los bloquea, igual que el único anterior | Protegido |
| Duplicado entre un insert viejo (NULL) y un documento ya backfilleado | El código viejo nunca repite un número: su piso cuenta todos los documentos y el incremento en `dte_correlatives` es atómico | Protegido |
| El código nuevo reutiliza un número emitido en el intervalo | Su piso incluye `fiscal_year IS NULL` en cualquier ejercicio (fail-safe) | Protegido |
| Instancias viejas y nuevas a la vez durante el cambio de deployment | Comparten la misma fila de `dte_correlatives` mientras el año UTC sea igual al año SV | Protegido **fuera** de la ventana 31/12 18:00–23:59 SV |
| Reservas viejas que cruzan el año | Las filas NULL del intervalo usan `created_at` en la guarda de generación | Política COR-01 §7 |

**Conclusión:** es compatible sin ventana de mantenimiento, con tres condiciones:

1. Migrar y desplegar **el mismo día**, con un intervalo de minutos.
2. Terminar **antes del 2026-12-31 18:00 SV**. Nunca dentro de esa ventana.
3. Después del deploy, ejecutar (con autorización) el paso 2 idempotente de M-COR-01 (`UPDATE … WHERE fiscal_year IS NULL …`) para asignar el año a los documentos del intervalo. Sin ese paso no hay duplicados, pero esas filas inflarían el piso del ejercicio 2027 y harían que la numeración no reinicie en 1.

Opción más conservadora: pausar la emisión DTE durante el intervalo. Es opcional.

## 4. Secuencia propuesta

| # | Paso | Detalle |
|---|---|---|
| 0 | Revisión | Push de la rama; PR contra `main`. Ver §5 sobre el Preview que dispara el push |
| 1 | Respaldos | `pg_dump` verificado de `vkoyw…` y `nygdq…` |
| 2 | Precondiciones | Consulta de ambiguos COR-01 = 0 y duplicados `(tenant, ambiente, control_number)` = 0 en cada base |
| 3 | Runtime `vkoyw…` | `migrate deploy`: 6 migraciones, por session pooler 5432 |
| 4 | Control Plane `nygdq…` | `migrate deploy`: 6 migraciones |
| 5 | Verificación | `migrate status` 72/72, `migrate diff` vacío, huella documental y de correlativos idéntica |
| 6 | Deploy | Merge a `main` → Production, con todos los flags MH 2.0 **OFF** |
| 7 | Post-deploy | Backfill idempotente COR-01 del intervalo; smoke MH 1.2 de un cliente productivo (solo lectura) |
| 8 | Seed catálogos 2.0 | Runtime, después de aclarar la fila v1 de diferencia |
| 9 | Compaws | Autorización MH TEST, `VERIFY` del firmador, perfil `MH_2_0` en su emisor TEST |
| 10 | Flags | Ver `09-2a-vercel-access.md` §3 |
| 11 | Smoke MH 2.0 | FE v2, CCF v4, NC v4 e Invalidación v3. Confirmación "INICIAR PRUEBAS TEST MH 2.0" |
| 12 | TrustmeDB local | `gym_customer_links` + M5, cuando se autorice (ensayo PASS) |

**Rollback:** antes de emitir documentos del ejercicio nuevo, son posibles los DROP descritos en cada migración. El código se revierte promoviendo el deployment anterior; el schema nuevo es compatible con el código viejo (§2–3).

## 5. Alternativa: Preview de la rama

Un Preview aislaría el **código** (los flags se pueden acotar a la rama), pero no las bases. Además depende de lo siguiente, que no se pudo verificar (sin acceso a Vercel):

- si las variables del scope Preview existen y apuntan al CP;
- `AUTH_URL`/`NEXTAUTH_URL` para el host `*.vercel.app`;
- cómo resuelve el CP un hostname que no es de ninguna organización.

`current-state.md` documenta que el proyecto se ha trabajado "sin Vercel Preview". **Recomendación:** despliegue a Production con flags OFF (§4) y activar MH 2.0 solo por flags y allowlist.
