# MH 2.0 — Fase 9.2B: runbook de migraciones remotas

**NO EJECUTADO.** Cada destino requiere autorización propia. Lecturas de esta fase: solo `BEGIN TRANSACTION READ ONLY` (`transaction_read_only = on` comprobado).

## 1. Destinos (reconfirmados 2026-11-25)

| Orden | Destino | Archivo de conexión local (no versionado) | Organizaciones | Pendientes |
|---|---|---|---|---|
| 1 | Runtime compartido `vkoyw…` | `.env.trustme-remote` | compaws, meta-training, rechightraining (target "Zolvi Shared 01") y trustme-0001 (perfil dedicado) | M1, M1b, M2, M4, M-COR-01, M5 |
| 2 | Control Plane `nygdq…` | `.env.vercel.production` (snapshot 2026-09; credencial válida hoy) | gym-0001 (perfil dedicado, PENDING) | ídem |

- 1 target compartido (`ACTIVE`, `last_test = SUCCESS`) y 2 perfiles dedicados (`gym-0001` → `nygdq…`, `trustme-0001` → `vkoyw…`). `commerce-pilot-0001` y `gym-0001` están `PENDING`. **No hay otros destinos físicos.**
- Ambos: 66 migraciones aplicadas, 0 fallidas, última `20261119000000_gym_customer_links` (checksum `f24e6a20…` = repo). Runtime con 113 filas (duplicados históricos consistentes).

## 2. Línea base de solo lectura (pre-check de hoy)

| Control | Runtime `vkoyw…` | CP `nygdq…` |
|---|---|---|
| Documentos / con número | 562 / 562 | 0 / 0 |
| COR-01 asignables / **ambiguos** | 562 / **0** | 0 / **0** |
| Duplicados `(tenant, ambiente, control_number)` | 0 | 0 |
| `docs_md5` | `6548e5bd1cc1a5b508bc01c61464c061` | `d41d8cd9…` (vacío) |
| `dte_correlatives` | `22:f99e49e8441c81f8bfabb6358e4e09dd` | `0:…` |
| Emisores activos | PRODUCTION=3, TEST=1 | ninguno |
| `fiscal_year`, `mh_spec_profile`, tabla M4 | ausentes | ausentes |

Las huellas cambian con la operación normal; el día de la ventana se toman de nuevo y se comparan antes/después **de la ventana**, no contra esta tabla.

## 3. Procedimiento por destino (bash, desde la raíz del repo; repetir con el otro archivo)

```bash
ENVF=.env.trustme-remote            # paso 2: ENVF=.env.vercel.production
TAG=rt                              # paso 2: TAG=cp
B="$HOME/Documents/zolvi-backups/mh20-remote-migration-$(date +%Y%m%d)"; mkdir -p "$B"
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"
set -a; . ./$ENVF; set +a           # DIRECT_URL = session pooler :5432 (no imprimir)

# 3.1 Respaldo (solo lectura) y hash
PGOPTIONS='-c default_transaction_read_only=on' pg_dump -Fc --no-owner --no-acl -n public -d "$DIRECT_URL" -f "$B/$TAG-public.dump"
sha256sum "$B/$TAG-public.dump" | tee "$B/$TAG-public.dump.sha256"

# 3.2 Restauración de prueba en base local desechable
psql -d postgres -c "CREATE DATABASE zolvi_scratch_restore_$TAG"      # base local (variables PG* de TrustmeDB)
pg_restore --no-owner --no-acl --exit-on-error -d zolvi_scratch_restore_$TAG "$B/$TAG-public.dump"
#    Si falla por roles de Supabase en políticas RLS: CREATE ROLE anon/authenticated/service_role NOLOGIN en local y repetir.
#    Comparar 09-2b-remote-precheck.sql en remoto y en la copia: docs_md5 y correlatives idénticos. Después: DROP DATABASE.

# 3.3 Pre-check (COR-01 ambiguos, duplicados, huellas, read_only=on)
psql "$DIRECT_URL" -X -q -v ON_ERROR_STOP=1 -f docs/fiscal/mh-normativa-2.0/auditoria/scripts/09-2b-remote-precheck.sql | tee "$B/$TAG-pre.txt"

# 3.4 Estado y migración (Prisma usa directUrl para migrate)
DATABASE_URL="$DIRECT_URL" npx prisma migrate status          # esperado: exactamente las 6 pendientes
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy

# 3.5 Post-check y drift
psql "$DIRECT_URL" -X -q -v ON_ERROR_STOP=1 -f docs/fiscal/mh-normativa-2.0/auditoria/scripts/09-2b-remote-postcheck.sql | tee "$B/$TAG-post.txt"
DATABASE_URL="$DIRECT_URL" npx prisma migrate status          # "Database schema is up to date"
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code   # exit 0
```

Nunca `migrate dev`, `migrate reset`, `db push` ni `migrate resolve` sin decisión explícita. No usar `prisma/scripts/release-gym-customer-links.ts` (aborta con otras pendientes).

## 4. Criterios de interrupción (antes de 3.4)

Detenerse y no migrar si: respaldo o restauración fallan; `transaction_read_only ≠ on` en el pre-check; `cor01_ambiguous > 0`; `dup_tenant_env_control > 0`; `mig_failed > 0`; `migrate status` muestra pendientes distintas de las 6; la hora es posterior al **2026-12-31 18:00 SV**; no está listo el deploy del mismo día (§6).

## 5. Criterios de paso (post-check)

72/72, 0 fallidas; 6 checksums `OK`; `m1_*_not_null = 0`; tablas M1b/M2/M4 vacías; `m5_incoherent_profiles = 0`, FK M5 validada y UNIQUE presente; `cor01_ambiguous = 0`, índice viejo ausente, único nuevo + parcial legado + CHECK presentes; `docs_md5`, `correlatives` y `issuers_by_env_active` **idénticos** al pre-check de la ventana; `migrate diff` exit 0.

## 6. Compatibilidad durante el intervalo y backfill COR-01

- Schema nuevo + código viejo (`main`): compatible (`09-2a-deployment-plan.md` §2–3). Migrar runtime → CP → merge/deploy el **mismo día**, en minutos.
- Tras el deploy, con autorización: ensayo y luego confirmación de `scripts/09-2b-cor01-post-deploy-backfill.sql` en el runtime (el CP no tiene documentos):

```bash
psql "$DIRECT_URL" -X -q -v ON_ERROR_STOP=1 -f docs/fiscal/mh-normativa-2.0/auditoria/scripts/09-2b-cor01-post-deploy-backfill.sql             # dry-run → ROLLBACK
psql "$DIRECT_URL" -X -q -v ON_ERROR_STOP=1 -v apply=true -f docs/fiscal/mh-normativa-2.0/auditoria/scripts/09-2b-cor01-post-deploy-backfill.sql
```

  Ensayado en copia local: 2 filas NULL → asignadas, huella documental idéntica, re-ejecución idempotente.

## 7. Recuperación

- **Fallo dentro de una migración:** Prisma envía cada `migration.sql` como una sola consulta; PostgreSQL la revierte completa. Queda una fila fallida en `_prisma_migrations`: revisar, corregir la causa y, solo con decisión explícita, `migrate resolve --rolled-back <nombre>` antes de reintentar. Las migraciones previas ya aplicadas son compatibles con el código viejo: no revertirlas.
- **Fallo del post-check sin pérdida de datos:** congelar el deploy (no hacer merge). El código de Production sigue funcionando sobre el schema nuevo.
- **Reversión de schema** (solo antes de emitir documentos del ejercicio nuevo): DDL documentado en cada migración, en orden inverso M5 → M-COR-01 → M4 → M2 → M1b → M1, y `migrate resolve --rolled-back`.
- **Último recurso:** `pg_restore --clean` del respaldo 3.1 en el destino, con autorización expresa (pierde las escrituras posteriores al respaldo).
