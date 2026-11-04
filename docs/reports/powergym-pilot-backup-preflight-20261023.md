# Power Gym — Respaldo productivo verificado y preflight del piloto visual PERSONALIZED / GROUP

Fecha: 2026-10-23 (UTC 16:54–17:01) · Solo lectura sobre producción · Cero escrituras remotas · Sin cambios de código.
Este informe no contiene secretos ni datos personales (solo conteos agregados y el nombre del entrenador del piloto).

## A. Identificación del entorno

| Campo | Valor |
|---|---|
| Proyecto Supabase | `nygdqnlzoalmhrqwijjn` (Control Plane), PostgreSQL 17.6 |
| Base respaldada | `postgres` (todos los esquemas visibles al rol de conexión) |
| Conexión | Session pooler `aws-1-us-east-1.pooler.supabase.com:5432`, usuario `postgres.nygdqnlzoalmhrqwijjn`, TLS 1.3 |
| Credenciales | `DIRECT_URL` de `.env.vercel.production` (mismo mecanismo que 2A/5A), cargadas a variables `PG*` sin imprimirse; el script aborta si el usuario no termina en `.nygdqnlzoalmhrqwijjn` |
| No tocado | Runtime Shared `vkoywmzlgygypaddxjtn`, TrustMe |
| Aplicación | `origin/main = 5e484c797a38b13fc722f48cb611d8fbfaca736f` (LIVE-3, verificado con `git fetch`); rama local `cert/gym-personalized-group` en el mismo HEAD; `https://app.getzolvi.com/login` → HTTP 200 |
| Git | Sin checkout, commit, push ni deploy. Sin seguimiento preexistentes: `audit-gym4/`, `docs/reports/` |

## B. Respaldo

| Campo | Valor |
|---|---|
| Archivo | `C:\Users\rodri\Documents\zolvi-backups\powergym-pilot-20261023\control-plane_nygdqnlzoalmhrqwijjn_full_powergym-pilot_20261023T165445Z.dump` |
| Tamaño | 798 469 bytes |
| Ventana | 2026-10-23 16:54:51Z → 16:55:14Z |
| SHA-256 | `73c051e69ae32967bb73435546a5126e7691e04fe93989e3375182d13a400c77` (coinciden `sha256sum` y `Get-FileHash`) |
| Método | `pg_dump 18.3 -Fc --no-owner --no-acl -v` (procedimiento de `stage5a`); una única instantánea en transacción de solo lectura |
| Resultado | exit 0; 0 errores en el log |
| Coherencia | Conteos exactos de las 92 tablas `public` antes y después del dump: idénticos (2 247 filas) → sin escrituras durante el dump |
| Manifiesto | `MANIFEST_powergym-pilot_20261023T165445Z.txt` (SHA-256 y tamaño de cada evidencia) |
| Alcance | Esquema + datos. Sin roles, propietarios ni ACL (igual que 5A); no sirve para restaurar roles/permisos del proyecto Supabase |
| ACL | Heredada de `zolvi-backups` (igual que `stage5a`). No se subió a ningún servicio |

## C. Recuperabilidad

- `pg_restore -l`: exit 0 · 1 286 entradas TOC · 92 `TABLE public` · 130 `TABLE DATA` (92 de `public`).
- Restauración real en un clúster PostgreSQL 18.3 **nuevo y desechable** (`initdb` en el scratchpad de la sesión,
  `127.0.0.1:54397`, UTF8). Destino verificado (`data_directory` y lista de bases) antes de restaurar. Base
  `zolvi_restore_powergym_pilot`, `pg_restore --no-owner --no-acl`. No se usó el servidor local principal ni bases existentes.
- Excepciones: **3**, todas de `supabase_vault` (extensión propietaria de Supabase): `CREATE EXTENSION`, `COMMENT` y
  `COPY vault.secrets`. En producción `vault.secrets` tiene **0 filas** → no se pierde ningún dato. Idéntico a 5A.
- Conteos restaurados vs producción: **92/92 tablas, 0 diferencias** (2 247 filas).
- Objetos de esquema `public` idénticos: 92 tablas, 413 índices, 92 PK, 177 FK, 18 CHECK, 26 triggers, 18 funciones
  `gym_*`, 63 enums, 62 migraciones (última `20261021000000_gym_training_executions`). Los dos `NOT VALID`
  intencionales se conservan (`trainers_branch_id_tenant_id_fkey`, `scheduled_classes_booked_count_capacity_chk`). PG18
  cataloga además las NOT NULL como constraints (`n`): artefacto de versión.
- El preflight completo de Power Gym (§D) devolvió **los mismos valores** en la copia restaurada (solo difieren el orden
  de un `string_agg` y la zona de visualización de una fecha).
- Clúster detenido al terminar; sus archivos quedan en el scratchpad de la sesión.

Conteos de referencia (producción = restaurada): `clients` 10 · `trainers` 4 · `membership_plans` 7 ·
`client_memberships` 4 · `scheduled_classes` 16 · `class_bookings` 5 · `class_booking_events` 14 ·
`gym_booking_operations` 14 · `class_attendance` 2 · `users` 7 · `_prisma_migrations` 62.

## D. Power Gym (preflight de solo lectura)

Todo en `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`; se comprobó que el pooler respeta el modo (un `CREATE TABLE`
centinela fue rechazado: «cannot execute CREATE TABLE in a read-only transaction»).

| Verificación | Resultado |
|---|---|
| Gimnasio | Power Gym, `active`, tenant asignado (único gimnasio de la base) |
| Sucursal | 1: Sucursal Central `active`, tenant coherente |
| `gym_settings` | `America/El_Salvador` · PERSONALIZED **false** · GROUP **false** · cupo PERSONALIZED 1 · horizonte 14 d · antelación mínima 0 · cancelación 120 min · tardía consume · `apply_policy_to_open` false · ventana asistencia 48 h · series 4 sem |
| Usuarios LIVE | super_admin 2 · branch_admin 1 · reception 1 · trainer 1 · client 2; todos `active`, tenant coherente; 0 usuarios sin gimnasio |
| Entrenadores | 4 activos, 1 con usuario; 0 sin tenant; 0 usuarios trainer sin perfil |
| Ana Martínez | `active`; usuario `trainer` `active`; misma sede, location y tenant; sede activa; `personalized_capacity` NULL (usa el predeterminado 1); 0 ausencias vigentes |
| Disponibilidad de Ana | lun 10–15 · mar 11–15 · mié 13–21 · jue 15–20 (`day_of_week` 0 = domingo) |
| Sesiones futuras de Ana | 2 OPEN: lun 26-oct 11:00–12:00 y mar 27-oct 12:00–13:00 |
| Alumnos | 10 NORMAL `active` (2 con portal) |
| Planes | 7 NORMAL `active`, ninguno con `sessions_limit` |
| Membresías | 4 NORMAL `active` `paid`, 0 con entrenador, `sessions_used` 0; 0 discrepancias de modalidad plan/membresía/alumno |
| Sesiones | 16 OPEN `scheduled` (5 con `class_date` ≥ hoy), 0 PERSONALIZED/GROUP, 0 series |
| Reservas | 4 `confirmed` + 1 `cancelled`, todas `NOT_APPLICABLE` |
| Migraciones | 62/62 terminadas, 0 revertidas; 2A, 2B y 5A presentes; 26 triggers `gym_*` |
| Integridad | I1 `booked_count` ≠ reservas: **0** · I2 sobrecupo: **0** · I3 `sessions_used` ≠ consumos: **0** · I4 exceso de sesiones: **0** · I6 contadores negativos: **0** · I7 tenant cruzado: **0** |
| I5 reservas sin evento | **2 — excepción documentada, no defecto** (ver D.1) |
| PILOTO-ZOLVI | 0 alumnos, 0 usuarios, 0 planes, 0 sesiones, 0 series |
| Puerta comercial | Ver D.2: todos los módulos `gym.*` habilitados; entitlements ilimitados |

### D.1 Excepción I5

Las 2 reservas sin evento son **anteriores al motor de reservas**: creadas el 2026-03-31 y el 2026-10-13, mientras que
`gym_bookings_foundation` (2A) se aplicó el 2026-10-20 21:58 UTC. Tienen `channel = NULL`, `consumption =
NOT_APPLICABLE`, sin membresía, en sesiones OPEN. El invariante «toda reserva tiene evento» rige para reservas del motor
(post-2A). Las 3 reservas post-2A tienen eventos (2, 7 y 5). No se corrigió nada.

### D.2 Corrección a un dato documentado

`gym-modalities-production-certification.md` §10 dice que Power Gym **no** figura como `PlatformOrganization`. Es
inexacto: existe la organización `gym-0001` («GYM EL SALVADOR», `PENDING`, licencia `TRIAL`, `NOT_READY`, sin plan, sin
destino runtime, sin `deployment_url`) con el **mismo `tenant_id`**. Consecuencias verificadas en código
(`resolve-commercial-context.ts`, `entitlements-resolver.ts`):

- Power Gym sigue operando en la base del Control Plane (PLATFORM_NATIVE); eso no cambia.
- El guard comercial lo resuelve como **MANAGED**, no `LEGACY_UNMANAGED`. Los 16 módulos (incluidos `gym.classes`,
  `gym.memberships`, `gym.trainers`, `gym.weekly_plans`) están habilitados por **override de organización**; los 5
  entitlements están en `unlimited` por override. El estado `PENDING/TRIAL` no participa en el guard.
- Riesgo: cualquier cambio a los overrides de `gym-0001` en el panel de plataforma deshabilitaría GYM para Power Gym.
  No tocar esa organización durante el piloto.

### D.3 Otras observaciones (no bloquean)

- Las 16 sesiones legadas tienen `starts_at = NULL` (anteriores a 2B). La regla de solape del entrenador usa
  `class_date` + `start_time` (`scheduling-rules.ts`), así que sí las considera.
- Solo Ana tiene usuario: el piloto debe usar a Ana para las sesiones con asistencia por canal TRAINER.

**PRODUCTION_PREFLIGHT = PASS**, sin bloqueos para crear las sesiones del piloto.

## E. Piloto visual (preparado, NO ejecutado)

### E.1 Precondiciones verificadas en código

- Flags: `/dashboard/settings/bookings` → `updateGymBookingPolicyAction`, solo SA LIVE; exige timezone (ya presente).
- Alumnos PERSONALIZED/GROUP: `/dashboard/clients/new`, solo SA/BA (recepción solo NORMAL).
- Planes: `/dashboard/memberships/plans/new` (`price ≥ 0`, `sessions_limit` opcional, `modality`).
- Venta: `/dashboard/memberships/client-memberships/new` → `createClientMembershipAction`. Solo crea
  `client_memberships` (snapshot de modalidad, `sessions_total` y entrenador). **No crea venta de commerce, caja ni
  DTE.** Admite `price_at_sale = 0`. El entrenador solo se guarda en PERSONALIZED; en GROUP se descarta.
- Sesiones: `/dashboard/classes/new` (requiere flag + timezone; LIVE SA/BA tras LIVE-1/2/3); detalle en
  `/dashboard/classes/[id]`.
- Agenda y asistencia del entrenador: `/dashboard/classes` con el usuario de Ana (vista trainer).
- Portal del alumno: `/portal/clases`, `/portal/membresias`, `/portal/historial`, `/portal/plan-semanal`, `/portal/progreso`.
- Planes semanales: `/dashboard/weekly-plans/client-plans/new`; seguimiento del entrenador:
  `/dashboard/weekly-plans/seguimiento`.

### E.2 Datos sintéticos propuestos

| Tipo | Valor |
|---|---|
| Alumnos PERSONALIZED | `PILOTO-ZOLVI Personal 1`, `PILOTO-ZOLVI Personal 2`; documento `PILOTO-P1`, `PILOTO-P2` |
| Alumnos GROUP | `PILOTO-ZOLVI Grupal 1`, `PILOTO-ZOLVI Grupal 2`; documento `PILOTO-G1`, `PILOTO-G2` |
| Portal | correos `piloto+p1@…`, `piloto+p2@…`, `piloto+g1@…`, `piloto+g2@…` en un buzón controlado por el responsable |
| Planes | `PILOTO-ZOLVI Personal 2` (PERSONALIZED, `sessions_limit` 2, 30 días, precio 0) · `PILOTO-ZOLVI Grupal 4` (GROUP, `sessions_limit` 4, 30 días, precio 0) |
| Membresías | precio 0, descuento 0, final **$0.00**, `payment_status = paid`, nota `PILOTO-ZOLVI sin cobro`; PERSONALIZED con entrenador Ana Martínez |
| Sesión PERSONALIZED | `PILOTO-ZOLVI Personal`, **mié 2026-10-28 15:00–16:00 SV**, Ana, cupo 1 |
| Sesión GROUP | `PILOTO-ZOLVI Grupal`, **mié 2026-10-28 17:00–18:00 SV**, Ana, cupo 2 |
| Sesión GROUP de cupo | `PILOTO-ZOLVI Grupal cupo-1`, **mié 2026-10-28 19:00–20:00 SV**, Ana, cupo 1 (con solo 2 alumnos GROUP, es la única forma de probar el rechazo por cupo GROUP) |

El miércoles 28 está dentro del horizonte de 14 días, dentro de la disponibilidad de Ana (13–21) y sin sesiones suyas.

### E.3 Secuencia exacta

**Día previo o mañana del 28 (≥ 120 min antes de cada sesión)**

1. SA: activar PERSONALIZED y GROUP en `/dashboard/settings/bookings`. Verificar que el resto de la política no cambie.
2. SA/BA: crear los 4 alumnos y habilitar su portal.
3. SA/BA: crear los 2 planes PILOTO y vender las 4 membresías a $0.00 (P1, P2 con Ana).
4. SA/BA: crear las 3 sesiones. Rechazos esperados sin escrituras: sesión fuera de disponibilidad o solapada.
5. Portal P1 y P2: ven solo la sesión PERSONALIZED de Ana, saldo 2/2. Portal G1 y G2: solo las GROUP. Un alumno NORMAL
   real no las ve (solo observar, sin operar con él).
6. P1 reserva Personal → `booked 1/1`, P1 `sessions_used 1`.
7. P2 ve «Completo» y su intento se rechaza.
8. P1 cancela (en política) → `RELEASED`, `booked 0/1`, P1 `used 0`.
9. P2 reserva Personal → `booked 1/1`, P2 `used 1`.
10. G1 y G2 reservan Grupal → `booked 2/2`, `used 1` cada uno.
11. G2 cancela Grupal en política → `booked 1/2`, G2 `used 0`; G2 vuelve a reservar → `booked 2/2`, `used 1`.
12. G1 reserva Grupal cupo-1 → `1/1`, G1 `used 2`; G2 intenta → «Esta clase ya no tiene cupo disponible.»

**Entre 13:00 y 15:00 del 28 (menos de 120 min antes de Personal)**

13. P2 cancela Personal → `CLIENT_LATE`, sigue `CONSUMED`, P2 `used 1`, `booked 0/1`.
14. P1 reserva de nuevo Personal → `booked 1/1`, P1 `used 1`.

**Después del inicio de cada sesión (ventana de 48 h)**

15. Ana (`/dashboard/classes`): asistencia P1 `attended`; Grupal G1 `attended`, G2 `absent` (sigue consumida); Grupal
    cupo-1 G1 `late`. Antes del inicio, el registro debe rechazarse.
16. Ana: actividad común en Grupal, actividad individual para G1 y P1, nota privada para P1 y G1. Verificar que el
    portal no muestra las notas.
17. SA/BA o Ana: plan semanal individual `PILOTO-ZOLVI` para P1 y G1 con Ana. P1 autorreporta un día en el portal;
    Ana registra el día de la sesión vinculando la asistencia. Comparar el mismo porcentaje en
    `/dashboard/weekly-plans/seguimiento`, el detalle del plan y `/portal/progreso`.
18. Verificación SQL de solo lectura (`sql/preflight.sql` de la carpeta del respaldo): I1–I7 en 0 para los registros
    nuevos; esperado al final: Personal 1/1, Grupal 2/2, cupo-1 1/1; `used` P1 1 · P2 1 · G1 2 · G2 1; los 10 alumnos y 4
    membresías reales sin cambios.

### E.4 Reversión y cierre

1. Cancelar desde la UI las sesiones PILOTO que **no se hayan realizado** (`cancelSession` libera cupos y consumos con
   eventos). Las sesiones ya realizadas quedan como historial identificado por el prefijo.
2. Membresías PILOTO → `cancelled`; planes PILOTO → `inactive`; alumnos PILOTO → `inactive`; deshabilitar su portal.
3. Planes semanales PILOTO → estado inactivo/cerrado.
4. Apagar PERSONALIZED y GROUP si no se autoriza mantenerlos.
5. Quedan por diseño (append-only/FK): operaciones y eventos de reserva, historial de modalidad, asistencias,
   actividades, notas, ejecuciones 5A. Nada se borra.
6. Repetir `sql/preflight.sql` y comparar con `control-plane_preflight_powergym_prod_20261023T165445Z.txt`.
7. Restauración completa (solo ante daño grave, con autorización): `pg_restore` de este dump sobre una base nueva, nunca
   sobre producción en caliente.

Prohibido durante el piloto: clientes reales, ventas de commerce, ingresos, DTE, editar historial y tocar la
organización `gym-0001`.

## F. Veredicto

```
BACKUP_VERIFIED = YES
RESTORE_VERIFIED = YES
PRODUCTION_PREFLIGHT = PASS
READY_FOR_VISUAL_PILOT = YES
```

Condiciones: ejecutar el piloto con autorización explícita de escrituras; no modificar `gym-0001`; si pasan días o hay
escrituras relevantes, repetir el dump antes de activar los flags.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: sin cambios. Migraciones: ninguna.
- Control Plane `nygdq…`: solo lectura (`pg_dump` + consultas `READ ONLY`/`ROLLBACK`). Cero escrituras.
- Runtime Shared `vkoyw…` y TrustMe: no se conectó.
- Escritura únicamente en el clúster desechable `127.0.0.1:54397` (scratchpad, detenido).
- `DATABASE_URL`/`DIRECT_URL` locales: no tocadas. Nada que sincronizar.
