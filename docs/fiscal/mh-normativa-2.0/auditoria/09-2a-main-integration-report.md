# MH 2.0 — Fase 9.2A: integración de `origin/main`

- **Fecha:** 2026-11-25. **Rama:** `feat/mh-normativa-2.0`.
- **Estrategia:** `git merge --no-ff origin/main` (sin rebase, reset ni force push). Los siete commits de 9.0–9.1 quedan intactos.
- **Sin push, PR, merge a `main` ni deploy.**

## 1. SHA registrados

| Referencia | SHA |
|---|---|
| Rama antes del merge (HEAD 9.1) | `b3d0d6affabe6d1bad3e32241a78350e362dbbc5` |
| `origin/main` integrado | `79f0b7b02f07fe3aca116a92ecc34db4385e8ba1` |
| Base común | `b682b70abc0ef6e8f2b52dcf073c8b2c7f6f0b6f` |
| Commit de merge | `9f8e3630d242a5e63d670fb235fb99adb9af94ba` |
| Siete commits preservados | `c05fa1b`, `4dfb63b`, `a8edef1`, `22df2dc`, `338c233`, `9feab63`, `b3d0d6a` |

## 2. Commits incorporados desde `main` (10)

| SHA | Cambio |
|---|---|
| `43437e6` / `8e2d0cf` (PR #32) | Edición de códigos maestros y fechas de transacción alineadas a SV (commerce) |
| `2e3d7d0` (PR #31) | Merge de `b682b70` (ya en la rama) |
| `8aaf4be` / `26e1c1e` (PR #33) | Crear y vincular clientes Gym desde clientes fiscales; **migración `20261119000000_gym_customer_links`** |
| `3819d53` | Script de release con el session pooler de Supabase |
| `deecd45` / `204b38b` (PR #34) | Crear y vincular clientes fiscales desde la ficha Gym |
| `d2dcf2f` / `79f0b7b` (PR #35) | Vencimiento de membresías según el calendario de cada gimnasio |

Impacto: 84 archivos, +2818/−345.

## 3. Conflictos

| Área | Resultado |
|---|---|
| Archivos tocados por ambas ramas | **2**: `prisma/schema.prisma` y `src/modules/commerce/purchases/services/purchase-dte-import.service.ts` |
| `schema.prisma` | Hunks disjuntos. Main añade `GymCustomerLink`, `Customer @@unique([id, tenant_id])` y relaciones en `Client`/`Customer`; la rama añade M1–M4 y COR-01. `prisma validate` OK. `migrate diff` (migraciones → schema) vacío salvo M5. |
| `purchase-dte-import.service.ts` | Main: `fecEmi` interpretado en `-06:00`. Rama: advertencias de convivencia 1.2/2.0 (`inspectReceivedDteSpec`). Hunks disjuntos y ambos presentes. |
| Migraciones | Sin choque. `20261119000000` queda antes de `20261124…/20261125…`: el orden cronológico se conserva. |
| DTE, onboarding, Gym | Ningún otro archivo en común. No hubo que descartar el lado de ninguna rama. |

Resolución automática sin conflictos textuales. Revisión semántica: ningún cambio de main toca correlativos, builders, firmador, transmisión ni el runner MH TEST.

## 4. Protección de archivos no versionados

- Se tomó una huella SHA-256 de los 310 archivos no versionados (oficiales, OCR y duplicados) antes del merge. `main` no contiene rutas bajo `docs/dte-actualizacion-dic26/` ni `docs/fiscal/`.
- Después del merge y de los commits, la huella es idéntica (§6 del informe de pruebas).

## 5. Fin de línea de migraciones

`gym_customer_links` llegó sin regla en `.gitattributes`. Con `core.autocrlf=true`, el working tree la tenía en CRLF (checksum `c2e5186a…`), mientras que el CP y el runtime la registraron en LF (`f24e6a20…`, igual que el blob de git). Se añadió `text eol=lf` para ella y para M5, y se renormalizó el archivo. El ensayo local registra ahora `f24e6a20…`, idéntico a los remotos. No hubo cambio de contenido.

## 6. Commits de esta fase

| # | Contenido |
|---|---|
| 1 | Merge `9f8e363` |
| 2 | M5: integridad de organización en M4, `.gitattributes` y pruebas PG |
| 3 | Documentación 9.2A |
