# GYM-5A — Preflight de respaldos antes de producción

Fecha: 2026-10-21 · Rama: `feat/gym-training-stage5a` · Solo lectura sobre producción (sin escrituras, sin migraciones).
Este informe no contiene secretos ni datos extraídos de los respaldos.

## Herramientas y credenciales

- `pg_dump`/`pg_restore`/`psql` 18.3 (PostgreSQL 18 local, compatible con servidor 17.6). Supabase CLI y Docker: no instalados (no necesarios).
- Credenciales: `DIRECT_URL` (session pooler, puerto 5432) de ambas bases en archivos `.env.*` locales; la identidad se verificó por el project ref del usuario de conexión antes de cada operación. No se imprimió ninguna credencial.
- **No existe token de la API de gestión de Supabase** (`SUPABASE_ACCESS_TOKEN` / sesión de CLI). Para habilitarlo localmente: crear un token personal en el panel de Supabase (Account → Access Tokens) y guardarlo solo como variable de entorno de la sesión (`$env:SUPABASE_ACCESS_TOKEN`), sin pegarlo en el chat.
- Nota: la opción `default_transaction_read_only` por `PGOPTIONS` no es honrada por el pooler; la lectura se garantizó con `pg_dump` (transacción de solo lectura) y `BEGIN READ ONLY` en las consultas.

## Resultados por base

| Campo | Control Plane / GYM principal | Runtime TrustMe / Shared |
|---|---|---|
| PROJECT_REF | nygdqnlzoalmhrqwijjn | vkoywmzlgygypaddxjtn |
| BACKUP_AUTOMATIC | NOT_VERIFIED | NOT_VERIFIED |
| LAST_BACKUP | no verificable | no verificable |
| BACKUP_TYPE | no verificable (¿PITR?: no verificable) | no verificable (¿PITR?: no verificable) |
| MANUAL_DUMP | PASS (`pg_dump -Fc --no-owner --no-acl`, exit 0) | PASS (idem) |
| BACKUP_FILE_LOCATION | `C:\Users\rodri\zolvi-backups\gym5a-preflight-2026-10-21\principal-nygdqnlzoalmhrqwijjn-20261021.dump` | `…\runtime-vkoywmzlgygypaddxjtn-20261021.dump` |
| BACKUP_SIZE | 782 065 bytes | 1 146 652 bytes |
| SHA256 | E0073BED332A4177B55857AB974B9F48466ACC8E3DFC4C14E690502A7206B164 | 3BB4DCFDE0818A1EC46FB4069C6890E09343A8A1BB65B844B236E17A35A25B34 |
| ARCHIVE_VALIDATION | PASS (`pg_restore -l`: 90 tablas, 128 TABLE DATA) | PASS (90 tablas, 129 TABLE DATA) |
| RESTORE_TEST | PASS | PASS |
| MIGRATION_STATUS | PASS | PASS |
| GYM5A_PENDING | YES | YES |
| TIMEZONE_PREFLIGHT | PASS | **FAIL** |
| MIGRATION_BLOCKERS | ninguno | ninguno técnico (ver advertencias) |

### BACKUP_AUTOMATIC = NOT_VERIFIED (ambas)
La API `GET /v1/projects/{ref}/database/backups` exige un token de gestión que no existe en este equipo. No se confirmó ningún respaldo automático, su fecha, retención ni PITR; no debe asumirse que existen. Verificarlo en el panel de Supabase (Database → Backups) o repitiendo este paso con un token. No se ejecutó ningún POST de restauración ni se activó PITR.

### Restauración de prueba (PostgreSQL 18 local desechable, puerto 54398, ya destruido)
- Base creada en UTF8; `pg_restore --no-owner --no-acl` en una base por respaldo.
- Único error por base: extensión `supabase_vault` no disponible fuera de Supabase (esquema administrado por Supabase, sin uso del producto). Esquema `public` íntegro.
- Verificación: 90 tablas en `public` y conteo de filas **idéntico al de producción tabla por tabla** (principal 2 232 filas / runtime 2 577 filas, 0 diferencias). `_prisma_migrations` restaurada (61 / 108 filas).
- Alcance del respaldo: todos los esquemas visibles para el rol de conexión, sin roles ni propietarios ni ACL (`--no-owner --no-acl`; roles de Supabase no incluidos). Para este despliegue (solo `public`, Prisma) es suficiente; no cubre restauración de roles/permisos del proyecto.
- Primer intento de restauración falló por codificación del servidor local (WIN1252); no por el respaldo. Corregido recreando en UTF8.

### Migraciones (solo lectura)
- Repo: 62 migraciones. `prisma migrate status` contra ambas producciones: solo falta `20261021000000_gym_training_executions` (GYM-5A). Sin migraciones fallidas, sin reversadas, sin pasos en cero.
- Principal: 61 aplicadas, 61 distintas. GYM-2A/2B (`gym_bookings_foundation`, `gym_bookings_capacity_check`) presentes; 18 funciones `gym_*` en `public`.
- Runtime: 108 filas = 61 nombres distintos; **47 nombres con 2 copias**, todos con checksum idéntico entre copias, 47 filas insertadas en una sola ventana (2026-08-28 00:xx), ids únicos, todas terminadas. Patrón consistente con un re-registro masivo de historial (p. ej. `migrate resolve --applied`), no una aplicación doble de SQL. `prisma migrate status` y `migrate deploy` lo toleran. No se corrigió ni se borró nada.
- Checksums: las migraciones del repo coinciden con las registradas salvo diferencias solo de fin de línea CRLF/LF en copia de trabajo (contenido idéntico tras normalizar).
- **Ensayo de compatibilidad**: `prisma migrate deploy` aplicado únicamente sobre las **copias restauradas locales** de ambas bases → éxito, 2 tablas nuevas de ejecución, "Database schema is up to date". Producción no se tocó.

### Zonas horarias (no corregidas)
- Power Gym (principal): `America/El_Salvador` — PASS.
- REC High Training (runtime): `GymSettings` faltante — FAIL.
- TrustmeDB (runtime): `timezone` vacío — FAIL.
Impacto: GYM-5A falla cerrado sin zona (el portal avisa y no permite reporte por fecha). No bloquea aplicar el SQL (el ensayo pasó sin zona), pero bloquea el uso funcional de GYM-5A en esos tenants.

## Advertencias
1. Los respaldos son una foto del 2026-10-21 ~23:16. **Repetir `pg_dump` inmediatamente antes de aplicar la migración** (el runtime/principal pueden recibir escrituras).
2. Sin respaldo automático confirmado, estos dumps manuales son el único respaldo verificado.
3. Los dumps contienen datos reales: están fuera del repositorio con ACL solo para el usuario actual; copiarlos a almacenamiento cifrado propio. No se subieron a ningún servicio.
4. Archivos auxiliares en la misma carpeta: `.sha256`, `.toc.txt` (listado) y `*-restore.stderr.txt`.

## Veredicto

- GYM5A_BACKUPS_VERIFIED = **YES** (dumps manuales independientes, validados y restaurados en ambas bases; respaldo automático NO verificado)
- GYM5A_READY_FOR_MIGRATION = **YES, condicionado** a: (a) nuevo dump justo antes, (b) aceptar que no hay respaldo automático confirmado (o confirmarlo en el panel), (c) configurar la zona horaria de REC High Training y TrustmeDB antes de habilitar GYM-5A a sus usuarios (no necesaria para aplicar el SQL).
