# MH 2.0 — Fase 9.2A: inventario consolidado de migraciones

- **Fecha:** 2026-11-25. Lecturas en `BEGIN TRANSACTION READ ONLY` (`transaction_read_only = on` verificado en las tres bases). Un primer intento solo con `PGOPTIONS` quedó en `off` porque el pooler de Supabase ignora esa opción; solo ejecutó `SELECT` y se repitió con transacción explícita.
- **No** se aplicó ninguna migración remota. **No** se usó `migrate resolve`.
- Las bases se identifican por los 5 primeros caracteres del ref.

## 1. Repositorio consolidado: 72 migraciones

70 (9.1) + `20261119000000_gym_customer_links` (main) + **`20261125010000_mh20_mh_test_run_profile_org_fk` (M5, nueva)**.

| Migración | Checksum (bytes LF del repo) |
|---|---|
| `20261119000000_gym_customer_links` | `f24e6a20be68a4d3ca946533487ce1399f476c72c0c68c3ba49569288a8b95aa` |
| `20261124000000_mh20_spec_profile` (M1) | `cbc9732f3f7bf507caa1e5eb0660f6b3c5ae908f01b1179cf470ebcdd20a4a9b` |
| `20261124010000_mh20_spec_profile_audit` (M1b) | `3c448b049da4a29780502f3fd1758e4024fc0249cc4e50ab16d3bfbbbb1b67ef` |
| `20261124020000_mh20_return_events` (M2) | `353ba6dd8d1ec5fcd86e33b56e9523d1e6f54e614098826fff7d7d8aa3ed08ca` |
| `20261124030000_mh20_mh_test_run_profiles` (M4) | `8a37aaa8f683bbf12a2c064b0c5540edfd62664094ed0f815067ee00815b9ba7` |
| `20261125000000_cor01_fiscal_year` (M-COR-01) | `605939bf066f3d193b774cd52f259a523dc50675291fc93f29b03efa297d2d42` |
| `20261125010000_mh20_mh_test_run_profile_org_fk` (M5) | `cf375e12fd595392e49042d7a3c7f808915c4e71dc68cb62b245806c1ad1dffc` |

Todas fijadas en LF por `.gitattributes`.

## 2. Comparación por destino

| Destino | Filas `_prisma_migrations` | Aplicadas (distintas) | Pendientes | Faltan en repo | Fallidas | Contenido divergente |
|---|---|---|---|---|---|---|
| TrustmeDB local | 70 | **70/72** | `gym_customer_links`, M5 | 0 | 0 | 0 |
| Control Plane `nygdq…` | 66 | **66/72** | M1, M1b, M2, M4, M-COR-01, M5 | 0 | 0 | 0 |
| Runtime compartido `vkoyw…` | 113 | **66/72** | M1, M1b, M2, M4, M-COR-01, M5 | 0 | 0 | 0 |
| Compaws (físico) | = `vkoyw…` | — | — | — | — | — |
| TrustMe "dedicado" (físico) | = `vkoyw…` | — | — | — | — | — |
| Power Gym `gym-0001` (físico) | = `nygdq…` | — | — | — | — | — |

- No hay otros destinos: 1 target compartido activo (`last_test = SUCCESS`) y 2 perfiles dedicados, que apuntan a `vkoyw…` y `nygdq…`.
- **Todas las migraciones remotas están en el repo consolidado** (0 desconocidas). `gym_customer_links` aplicada en CP y runtime con checksum `f24e6a20…`, idéntico al repo.
- Runtime, 113 filas: 47 migraciones antiguas tienen fila duplicada, todas `APPLIED` y con un único checksum por nombre. Es historial preexistente sin divergencia; no se tocó.

## 3. Checksums: solo diferencias de fin de línea

Cada checksum aplicado coincide byte a byte con el blob LF del repo o con su variante CRLF del working tree. **Ninguno** coincide con otro contenido.

| Destino | Coincide con el working tree | Coincide solo con LF/CRLF alterno |
|---|---|---|
| Local | 68 | 2 (`20261005000000_add_tenant_security_config`, `20261019000000_gym_bookings_foundation`) |
| CP | 59 | 7 |
| Runtime | 63 | 3 |

Es un efecto de `core.autocrlf=true` en migraciones antiguas sin regla `eol=lf`, no una divergencia de contenido. Con estas diferencias, `migrate status` y `migrate deploy` funcionaron sin error en el ensayo de TrustmeDB. Recomendación posterior, fuera de alcance: fijar `eol=lf` en todas las migraciones.

## 4. Plan exacto por destino (ninguno ejecutado)

| Orden | Destino | Migraciones a aplicar | Precondiciones |
|---|---|---|---|
| 1 | Runtime `vkoyw…` (Compaws, Metatraining, REC, TrustMe, Commerce Pilot) | M1, M1b, M2, M4, M-COR-01, M5 (6) | `pg_dump` verificado; consulta de ambiguos COR-01 = 0; ver ventana en `09-2a-deployment-plan.md` |
| 2 | Control Plane `nygdq…` (incluye Power Gym) | M1, M1b, M2, M4, M-COR-01, M5 (6) | ídem |
| 3 | TrustmeDB local | `gym_customer_links`, M5 (2) | ensayo PASS (`09-2a-test-results.md` §4); respaldo `…pre-fase9-2a` |

- Después de aplicar: 72/72 en los tres destinos.
- `prisma/scripts/release-gym-customer-links.ts` (de main) **no sirve** para esto: aborta si hay otra migración pendiente. El release debe usar el session pooler (puerto 5432), como en `3819d53`.
