# MH 2.0 — Fase 9.1: inventario remoto (solo lectura)

- **Fecha:** 2026-11-25. Consultas ejecutadas dentro de transacciones `READ ONLY` (`transaction_read_only = on` verificado en ambas bases).
- **No** se modificó ninguna base, configuración, emisor, firmador ni credencial. **No** se transmitió nada. **No** se aplicaron migraciones.
- Salida saneada: sin URLs, contraseñas, tokens, NIT ni datos de clientes. Las bases se identifican por los 5 primeros caracteres del ref de proyecto.

## 1. Destinos físicos

| Base física | Origen de la conexión | Rol |
|---|---|---|
| `nygdq…` | `.env.vercel.production` | Control Plane; también runtime nativo de `gym-0001` (Power Gym) |
| `vkoyw…` | `.env.trustme-remote` | Runtime compartido "Zolvi Shared 01" |

## 2. Organizaciones (Control Plane)

| Organización | Estado / aprovisionamiento | Destino físico | ¿Comparte base física? |
|---|---|---|---|
| TrustMe (`trustme-0001`) | ACTIVE / NOT_READY | perfil dedicado → `vkoyw…` | **Sí**: el "dedicado" apunta a la misma base que el compartido |
| Compaws (`compaws`) | ACTIVE / PROVISIONED | compartido → `vkoyw…` | Sí (aislamiento por `tenant_id`) |
| Metatraining (`meta-training`) | ACTIVE / PROVISIONED | compartido → `vkoyw…` | Sí |
| REC High Training (`rechightraining`) | ACTIVE / PROVISIONED | compartido → `vkoyw…` | Sí |
| Zolvi Commerce Pilot (`commerce-pilot-0001`) | PENDING / PROVISIONED | compartido → `vkoyw…` | Sí |
| GYM EL SALVADOR (`gym-0001`) | PENDING / NOT_READY | perfil dedicado → `nygdq…` | Sí, con el Control Plane |

No se encontraron otros runtimes activos (1 destino compartido, `last_test = SUCCESS`).

## 3. Migraciones

| Base | Aplicadas del repo | Pendientes | Fuera de esta rama | Fallidas |
|---|---|---|---|---|
| Control Plane `nygdq…` | 65/70 | M1, M1b, M2, M4, M-COR-01 | `20261119000000_gym_customer_links` | 0 |
| Runtime `vkoyw…` | 65/70 | M1, M1b, M2, M4, M-COR-01 | `20261119000000_gym_customer_links` | 0 |

**Hallazgo:** `20261119000000_gym_customer_links` está aplicada en ambos remotos y vive en `origin/main` (10 commits por delante de `b682b70`, PR #33/#34), pero no en esta rama. Antes de cualquier despliegue remoto, la rama debe integrar `origin/main` y resolver `schema.prisma`; si no, `migrate status` reportará una migración desconocida y habrá drift de schema.

## 4. Configuración fiscal por runtime (`vkoyw…`)

| Tenant | Ambiente | Emisor activo | Códigos 2.0 (`^[MSBP]\d{3}$` / `^P\d{3}$`) | Campos fiscales | Credencial MH activa | Correlativos | Documentos |
|---|---|---|---|---|---|---|---|
| Compaws | TEST | **Sí** | OK / OK | OK | 1 | **0** | **0** |
| METATRAINING | PRODUCTION | Sí | OK / OK | OK | 1 | 4 | 5 |
| METATRAINING | TEST | No | OK / OK | OK | 1 | 5 | 384 |
| REC High Training | PRODUCTION | Sí | OK / OK | OK | 1 | 2 | 1 |
| REC High Training | TEST | No | OK / OK | OK | 1 | 2 | 98 |
| TrustmeDB | PRODUCTION | Sí | OK / OK | OK | 1 | 4 | 4 |
| TrustmeDB | TEST | **No** | OK / OK | OK | 1 | 5 | 69 (incluye 4 `PENDING_GENERATION`, 6 `GENERATED`, 16 `SCHEMA_VALIDATED`) |

El Control Plane no tiene emisores DTE (tenant Power Gym sin configuración fiscal).

## 5. Firmadores (registro en Control Plane)

| Organización | Ambiente | Estado | API key | Credencial registrada | Autorización MH confirmada |
|---|---|---|---|---|---|
| Compaws | TEST | SIGNER_READY | Sí | Sí | **No** |
| REC High Training | TEST | SIGNER_READY | Sí | Sí | No |
| REC High Training | PRODUCTION | SIGNER_READY | Sí | Sí | No |
| Metatraining | PRODUCTION | SIGNER_READY | Sí | Sí | Sí |
| TrustMe | — | **sin aprovisionamiento** | — | — | — |

TrustMe depende del firmador global de la app (`DTE_SIGNER_URL_TEST`), no de uno aprovisionado por organización.

## 6. Flags, catálogos y COR-01

| Elemento | Control Plane | Runtime |
|---|---|---|
| Columnas M1 (`mh_spec_profile`) | ausentes | ausentes |
| Tabla M4 | ausente | ausente |
| Catálogos activos | v1: 427 filas, 16 catálogos | v1: 427 filas, 16 catálogos |
| Catálogos 2.0 | no sembrados | no sembrados |
| Ambiguos COR-01 | **0** | **0** |
| Duplicados `(tenant, ambiente, control_number)` | 0 | 0 |
| Corridas MH TEST (1.2) | 19 Metatraining (18 COMPLETED, 1 CANCELLED, 17–18/11), 1 REC (COMPLETED, 17/11) | — |

- **MH 2.0 no puede estar activo en remoto:** sin columnas M1 ni tabla M4, el perfil 2.0 y el gate de corridas 2.0 no tienen dónde persistir, sea cual sea el valor de los flags.
- Catálogos: local tiene 428 filas v1 y remoto 427 (diferencia de 1 fila, a revisar antes del seed 2.0).

## 7. Bloqueos de permisos (exactos)

| Consulta | Bloqueo |
|---|---|
| Valores vivos de `DTE_MH20_PROFILE_ENABLED`, `DTE_MH_TEST_RUNS_ENABLED`, `DTE_MH_TEST_RUNS_M4_APPLIED`, `DTE_MH_TEST_RUNS_MH20_ENABLED`, `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS` en Vercel | **No hay acceso:** la CLI de Vercel no está instalada y su sesión estaba expirada (notas del 2026-11-16). El snapshot local `.env.vercel.production` es del 2026-09-01 y no contiene esos nombres. No se intentó eludirlo. |
| Vigencia real de credenciales MH TEST | Requiere autenticarse ante MH; fuera del alcance (prohibido contactar Hacienda). Solo consta `is_active` y la ausencia de `expires_at` vencido. |
| Salud viva de los firmadores TEST | No se sondearon; consta el estado registrado `SIGNER_READY`. |

Las corridas del 17–18/11 indican que `DTE_MH_TEST_RUNS_ENABLED` estuvo encendido en esas fechas; su valor actual no se pudo leer.
