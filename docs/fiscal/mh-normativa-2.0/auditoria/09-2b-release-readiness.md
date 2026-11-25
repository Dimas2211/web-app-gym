# MH 2.0 — Fase 9.2B: preparación del release

- **Fecha:** 2026-11-25. **Código verificado:** `0746c94` (sin cambios de código en 9.2B; solo documentación y scripts SQL de runbook).

## 1. Git

| Control | Resultado |
|---|---|
| `git fetch origin` | `origin/main` = `79f0b7b`, **sin commits nuevos** desde la integración 9.2A |
| Rama remota `feat/mh-normativa-2.0` | No existía antes de esta fase |
| Commits sobre `main` | 10 (9.0–9.2A) + documentación 9.2B |
| Archivos no versionados | 310, intactos; manifiesto `09-1-official-sources.sha256` verificado (`sha256sum -c` exit 0) |
| `.env*`, `.vercel/` | Ignorados por `.gitignore` (`.env.*`, `.vercel`) |

## 2. Contenido a publicar (262 archivos frente a `main`)

| Control | Resultado |
|---|---|
| Nombres de riesgo (`.env`, `.pem`, `.p12`, `.pfx`, `.key`, `.dump`, `originales/`, `ocr/`, PDF) | Ninguno. Solo coincide el nombre `09-0-local-backup-report.md` (informe, sin datos) |
| Patrones de secreto en el diff (DSN con contraseña, claves privadas, tokens GitHub/AWS/Anthropic/Vercel, JWT) | Solo el DSN ficticio `postgresql://audit:audit@127.0.0.1:1/none`, ya conocido |
| Schemas oficiales que usa el código | Versionados en `src/modules/commerce/dte/schemas/mh/` (8 + 9 en `v2_0/`, con `SHA256SUMS.md`) |
| Referencias de código a `docs/` | Solo comentarios; ninguna lectura en tiempo de ejecución ni de build |
| Repositorio | **Público.** La rama añade información de la misma clase que `main` ya publica (prefijos de ref de base, nombres de organizaciones, rutas de respaldo locales); ningún secreto |

## 3. Seguridad del Preview que dispara el push

| Riesgo | Evidencia | Resultado |
|---|---|---|
| Migraciones automáticas | `build` = `prisma generate && next build`; sin `postinstall`, sin `vercel.json`, sin CI en `.github/`. Historial: `main` tuvo migraciones sin aplicar en remoto durante semanas pese a varios deployments de Production (`current-state.md`, entrada 2026-11-16), así que el comando de build del proyecto no migra | **No migra** |
| Escrituras en build | Solo se prerenderizan `/`, `/login`, `/icon.svg`, `/_not-found` | Sin escrituras |
| Código de servidor que migre | Ninguno (`child_process` solo en un harness de tests y en textos de UI) | OK |
| Acceso de clientes vía `*.vercel.app` | El resolver por hostname falla cerrado; ningún `*.vercel.app` es plataforma salvo que se liste en `PLATFORM_HOSTS` | Sin login de runtime |
| Transmisiones MH | Solo por acción de un usuario autenticado o por el tick, que llama al host de Production con secreto | Ninguna automática |
| Crons | Sin `vercel.json` (y Vercel solo ejecuta crons en Production) | Ninguno |
| Variables y bases del scope Preview | Tras el login: solo `AUTH_TRUST_HOST`, sin `DATABASE_URL`/`DIRECT_URL` ni flags (`09-2b-pull-request-report.md` §1) | **Sin acceso a ninguna base** |

## 4. Expediente Compaws para el smoke (solo lectura; nada activado)

| Control | Evidencia | Estado |
|---|---|---|
| Organización | `compaws`, id **`1b7d3db7-ee0e-4514-9376-c5796910ccfe`**, ACTIVE / PROVISIONED, `compaws.getzolvi.com`, target "Zolvi Shared 01" (`vkoyw…`) | OK, único |
| Tenant | md5 `73a1a51c…`; 1 fila en `runtime_tenants` del runtime | OK |
| Location | 1 (`branches`) | OK |
| Emisor TEST | 1, activo, con location; códigos AT y campos fiscales válidos; sin emisor PRODUCTION | OK |
| Firmador TEST | `SIGNER_READY`, API key cifrada, credencial registrada, emisor vinculado; últimos runs: VERIFY FAILED ×2 y luego **VERIFY SUCCESS** (2026-11-23) | OK, repetir VERIFY antes del smoke |
| Credenciales MH TEST | 1 `MH_CREDENTIALS` activa, sin `expires_at` | Vigencia ante MH no comprobada (requiere autenticación real) |
| Correlativos / documentos de Compaws | **0 / 0** | Sigue siendo cierto |
| Corridas MH TEST previas de Compaws | 0 | OK |
| Autorización MH TEST | `mh_authorization_confirmed_at` **vacío** | **PENDIENTE** (atestación con referencia en el CP) |
| Perfil `MH_2_0` | Columna inexistente hasta M1 | Bloqueado por migraciones |

No se transmitió nada a MH, no se activaron perfiles y no se tocaron credenciales ni firmador.

## 5. Verificación del árbol

| Bloque | Resultado |
|---|---|
| `tsc --noEmit` y `next build` en worktree limpio de `0746c94` (sin los 310 no versionados) | **0 errores / build OK**: build reproducible sin documentos oficiales |
| Golden MH 1.2 | 8/8 |
| Certificación interna | 77/77 |
| Exclusión MariaDB | 8/8 |
| Onboarding MH 2.0 (`mh20-onboarding`, `runner-wiring`, `runtime-port-wiring`) | 64/64 |
| Integridad de migraciones | 72/72 registradas en TrustmeDB; 70 iguales al working tree, 2 solo fin de línea, 0 divergentes; los 7 checksums nuevos coinciden con el inventario |
| Suite completa | No repetida: código idéntico a `0746c94`, verificado en 9.2A (3707/0, PG 70/70) |

## 6. Prerrequisitos restantes, cada uno con autorización propia

1. ~~`vercel login` e inventario vivo de flags~~: hecho; flags MH 2.0 OFF.
2. Migraciones remotas (`09-2b-remote-migration-runbook.md`), runtime → CP.
3. Merge y deploy el mismo día, antes del 2026-12-31 18:00 SV, con flags MH 2.0 OFF; luego el backfill COR-01.
4. Seed de catálogos 2.0 (aclarar la fila v1 de diferencia), autorización MH TEST, VERIFY, flags con allowlist = id de §4 y perfil `MH_2_0` solo en el emisor TEST de Compaws.
