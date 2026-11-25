# MH 2.0 — Fase 9.1: commits locales

- **Rama:** `feat/mh-normativa-2.0`. **Base:** `b682b70` (sin reescribir historial).
- **Sin push, merge ni deploy.** Sin Git LFS.

## 1. Commits (orden por dependencias)

El manifiesto de 9.0 proponía G (COR-01) después de A–E. En 9.1 G va **justo después de A**. Los hunks COR-01 de generadores y consumidores están mezclados con los cambios MH 2.0 del mismo archivo, así que no se pueden separar sin riesgo. Esos hunks viajan con C, D y E, y cada uno de esos commits necesita la base COR-01 de G. Se mantienen los 7 grupos.

| # | Grupo | SHA | Mensaje | Archivos |
|---|---|---|---|---|
| 1 | A | `c05fa1b1ed0ae65baf9f13052dc9c189045a1a4d` | feat(dte): MH 2.0 schema + migrations M1/M1b/M2/M4 | 6 |
| 2 | G | `4dfb63bd3ceddb632795f777f290b2aa59aa0fad` | feat(dte): COR-01 annual control-number restart by SV fiscal year | 13 |
| 3 | B | `a8edef107bab0422a9a9f1642585181b789ab230` | feat(dte): MH 2.0 catalogs seed + territory dry-run | 8 |
| 4 | C | `22df2dcbfa506e55189c0231c7497a949434ef7b` | feat(dte): MH 2.0 builders, validator and spec profile (flag OFF) | 122 |
| 5 | D | `338c233fe9098e94ae84ace1655be29ac3833a93` | feat(dte): MH TEST runs with persisted MH 2.0 profile and CP gate | 22 |
| 6 | E | `9feab6365ec3e3bdc7014d0ebe0103d2a1f29eb0` | fix(dte): consumers adjusted for MH 2.0 versions | 10 |
| 7 | F | *(el commit que contiene este informe; SHA en `git log` y en el cierre de la fase)* | docs(fiscal): MH 2.0 audit through Phase 9.1 | documentación |

### Detalles por grupo

| Grupo | Detalle |
|---|---|
| A | `schema.prisma` **sin** el hunk COR-01, construido como blob y validado con `prisma validate`. La versión en el commit corresponde exactamente a M1–M4. `.gitattributes` fija las nuevas migraciones en LF: se aplicaron desde LF y así su checksum de Prisma no cambia en checkouts con `core.autocrlf=true`, igual que las migraciones ya fijadas. |
| G | Hunk COR-01 de `schema.prisma`, M-COR-01 (con su línea en `.gitattributes`), `dte-fiscal-year.ts`, `dte-fiscal-year-lifecycle.ts`, `dte-correlative.service.ts`, pruebas unitarias, PG y SQL, mocks de reserva y `COR-01-reinicio-anual.md` (actualizado con §7). |
| D | Incluye `dte-fiscal-year-lifecycle.test.ts`: verifica fuentes de C y D, así que va con D para que cada commit intermedio sea coherente. |

## 2. Controles antes de cada commit

- `git diff --cached --name-only` revisado contra la lista del grupo. Lo staged coincide con lo previsto: 0 archivos sin asignar.
- Escaneo de secretos sobre los 246 archivos incluidos: DSN con contraseña, llaves privadas, JWT, AWS y patrones de token o contraseña.
  - Único hallazgo: el DSN ficticio conocido `postgresql://audit:…@127.0.0.1:1/none` en `docs/audits/Auditoria_Onboarding_DTE_Shared_Dedicated.md`.
  - El ref de proyecto `vkoyw…` aparece en documentación, como ya ocurre en documentos versionados (`docs/context/current-state.md`). No es una credencial.
- Ningún `.env*`, `.pem`, `.p12`, `.key`, `.crt`, dump, respaldo ni archivo temporal.
- Archivos preexistentes ajenos: no se tocaron. `.gitattributes` solo recibió 5 líneas nuevas.

## 3. Excluidos (siguen locales y sin seguimiento)

| Ruta | Archivos | Motivo |
|---|---|---|
| `docs/dte-actualizacion-dic26/` | 20 | **Duplicado** exacto de `originales/` (mismos SHA-256) |
| `docs/fiscal/mh-normativa-2.0/originales/` | 20 | PDF/XLSX oficiales sin política de almacenamiento (~22 MB), más los schemas JSON oficiales. Los que usa el código ya están versionados en `src/modules/commerce/dte/schemas/mh/` con hash idéntico. |
| `docs/fiscal/mh-normativa-1.2/*.pdf` | 1 | PDF oficial (~48 MB) |
| `docs/fiscal/mh-normativa-1.2/ocr/` | 113 | OCR bruto |
| `docs/fiscal/mh-normativa-2.0/auditoria/ocr-recovery/` | 156 | OCR bruto y curado. La evidencia resumida está en `ocr-recovery-report.json`, que sí se versiona. |

Manifiesto reproducible: `auditoria/09-1-official-sources.sha256`, con 41 archivos. Se verifica con `grep -v '^#' docs/fiscal/mh-normativa-2.0/auditoria/09-1-official-sources.sha256 | sha256sum -c`, que dio OK.

## 4. Punto de restauración

| Punto | Contenido |
|---|---|
| `b682b70` | Estado previo a MH 2.0 |
| `c05fa1b` | Schema y migraciones M1–M4 |
| `4dfb63b` | Más la base COR-01 |
| HEAD | Todo, verificado en `09-1-test-results.md` |

Los commits intermedios no se compilaron uno por uno. La verificación completa (tsc, lint, build y suites) se hizo sobre el estado final.

**Antes de abrir un PR:** integrar `origin/main`, que está 10 commits por delante e incluye `20261119000000_gym_customer_links`, ya aplicada en remoto. Ver `09-1-remote-readiness-inventory.md` §3.
