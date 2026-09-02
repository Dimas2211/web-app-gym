# TrustMe — Preparación PRODUCCIÓN DTE (sin ejecución fiscal)

Fecha: 01/09/2026.
Ambiente: PRODUCTION — solo preparación/auditoría. **No se creó, firmó, validó ni
transmitió ningún DTE productivo en esta fase.**

## 1. Resumen ejecutivo

Esta fase preparó infraestructura, scripts y documentación para operar
PRODUCCIÓN TrustMe cuando exista una operación fiscal real, sin ejecutar
ningún acto con efecto fiscal. No se llamó a Hacienda producción, no se
firmó nada, no se hizo delivery a MariaDB, no se modificaron correlativos.

**Principio fiscal:** producción no se usa para pruebas. Un DTE transmitido
a MH producción es un documento fiscal real y puede afectar la declaración
legal de TrustMe.

## 2. Auditoría PRODUCCIÓN TrustMe (solo lectura)

Auditoría hecha por consulta directa de solo lectura contra la base
configurada en `DATABASE_URL`/`DIRECT_URL` local, que en este entorno
apunta **directamente a `TrustmeDB`** (no al control plane multiindustria —
ver nota técnica en §2.4). No se descifró ningún `encrypted_payload`, no se
imprimió ningún secreto.

### 2.1 `DteIssuerConfig` PRODUCTION

| Campo | Valor |
|---|---|
| id | `584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad` |
| tenant_id | `382d8840-3311-4da5-8acb-86e9f858e980` |
| location_id | `bbd6cb00-78b2-4d85-a4b3-9e6bfa8dafd9` |
| is_active | `true` |
| NIT / NRC | `05280807241037` / `3464880` |
| Razón social | TECNOLOGIAS TRUST ME, S.A. DE C.V. |
| Actividad | `62010` — Programación Informática |
| Establecimiento / PV | `M001` / `P001` |
| Dirección | Santa Tecla, Av. Manuel Gallardo, Col. Santa Cecilia, #4 (depto 05, municipio 11) |

Config PRODUCTION existe, está activa y con los datos fiscales del emisor
completos.

### 2.2 `DteCorrelative` PRODUCTION

| Tipo | last_sequence | baseline |
|---|---|---|
| 01 (FE) | 1 | null |
| 14 (FSE) | 1 | null |

`last_sequence` por defecto en schema es `0`. Que ambos estén en `1`
confirma que **ya se consumió un correlativo real de cada tipo** (ver
§2.3) — no se tocaron ni incrementaron en esta fase.

### 2.3 `DteOutgoingDocument` environment=PRODUCTION — antecedente conocido

Existen **2 documentos previos**, anteriores a esta fase, confirmados por
el usuario como antecedente conocido (no generados en esta sesión):

| Tipo | control_number | status | origen | fecha |
|---|---|---|---|---|
| 14 (FSE) | `DTE-14-M001P001-000000000000001` | `ACCEPTED` | `purchase_id=8a90ce9e-4713-415a-92ef-ac2d809ba825` | 2026-08-25 |
| 01 (FE) | `DTE-01-M001P001-000000000000001` | `OBSERVED` | `sale_id=26398b56-6217-4126-b5d8-3b69d60333eb` | 2026-08-19 |

Esto significa que **ya hubo al menos una transmisión real a Hacienda
producción** (el FSE14 `ACCEPTED` solo se logra con respuesta real de MH).
El FE01 quedó `OBSERVED` — pendiente de revisión/seguimiento fiscal fuera
del alcance de esta fase (no se tocó, no se reintentó, no se invalidó).

**No se creó, modificó ni tocó ninguno de estos dos documentos en esta fase.**

### 2.4 `DteCredential` PRODUCTION — ya existe

| Campo | Valor |
|---|---|
| id | `0712f405-4923-489e-9ef9-f282df4e9d16` |
| issuer_config_id | `584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad` |
| credential_type | `MH_CREDENTIALS` |
| is_active | `true` |
| created_at | 2026-08-19 |

Ya hay un `DteCredential` PRODUCTION registrado para este issuer (consistente
con que ya hubo transmisiones reales — §2.3). El resolver issuer-aware
(`resolveDteSignerConfigForIssuer`, documentado en
[dte-signer-multitenant-block.md](dte-signer-multitenant-block.md)) puede
resolverlo sin cambios adicionales, siempre que el `encrypted_payload`
contenga `signerUrl`/`signerNit`/`signerPrivateKeyPassword` válidos para el
firmador PROD real — **no se verificó el contenido del payload en esta
fase** (nunca se descifra solo para inspección fuera de los scripts ya
existentes que enmascaran el resultado).

### 2.5 Servicios aún no issuer-aware (dependen de variables globales)

Sin cambios respecto a lo ya documentado en
[dte-signer-multitenant-block.md](dte-signer-multitenant-block.md): el
firmado real (`sign-dte-document.service.ts`) y el runner FSE14 ya son
issuer-aware con fallback a `DTE_SIGNER_URL_TEST`/`DTE_SIGNER_URL_PRODUCTION`
globales. No se auditó ningún cambio adicional en esta fase — ver ese
documento para el detalle de qué queda pendiente (nivel intermedio
tenant/organización).

### 2.6 Nota técnica — control plane vs. runtime directo

`prisma/scripts/audit-trustme-dte-runtime.ts` asume acceso vía control
plane + Runtime Database Router (`platform_organizations` +
`withRuntimePrisma`). En este checkout local, `DATABASE_URL`/`DIRECT_URL`
apuntan directo a `TrustmeDB` (0 filas en `platform_organizations`), así
que ese script no encuentra la organización aquí — no es un bug del
script, es que este entorno está configurado como runtime directo de
TrustMe. La auditoría de esta fase se hizo con consultas equivalentes
contra el Prisma Client global (`@/lib/db/prisma`), sin escribir nada, y
los scripts temporales usados para leer se descartaron sin quedar en el
repositorio.

## 3. Qué quedó listo

- **INSPECT PRODUCTION** (`register-dte-signer-credential.ts --environment
  PRODUCTION --step INSPECT`): solo lectura, siempre permitido, nunca
  requiere secretos ni confirmación.
- **REGISTER PRODUCTION DRY_RUN**: valida variables, resuelve
  CREATE/UPDATE, muestra resumen seguro (host/ruta sin credenciales, NIT
  enmascarado, presencia de password/apiKey) y **no escribe nada**.
- **REGISTER PRODUCTION EXECUTE**: preparado, con confirmación textual
  propia y distinta de TEST (`REGISTER DTE SIGNER CREDENTIAL PRODUCTION`,
  no intercambiable con la de TEST). **No se ejecutó.**
- **Health check PROD** (`health-check-dte-signer.ts --environment
  PRODUCTION`): GET a `/status` del firmador PROD real, mismo mecanismo que
  usa la app (`resolveDteSignerConfig` + `MhHttpDteSignerAdapter.checkHealth`).
  No firma, no transmite, no toca base de datos. **No se ejecutó.**
- Checklist de primer DTE productivo real — ver §5.

## 4. Comandos preparados

### 4.1 INSPECT PRODUCTION (solo lectura — puede ejecutarse cuando se quiera)

```powershell
npx tsx prisma/scripts/register-dte-signer-credential.ts `
  --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
  --environment PRODUCTION --step INSPECT
```

### 4.2 REGISTER PRODUCTION — DRY_RUN (no escribe nada — puede ejecutarse cuando se quiera)

```powershell
$env:DTE_CREDENTIAL_SIGNER_URL = "https://<host-real-produccion>/firmardocumento/"
$env:DTE_CREDENTIAL_SIGNER_NIT = "..."
$env:DTE_CREDENTIAL_SIGNER_PRIVATE_KEY_PASSWORD = "..."
npx tsx prisma/scripts/register-dte-signer-credential.ts `
  --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
  --environment PRODUCTION --step REGISTER --mode DRY_RUN
```

### 4.3 REGISTER PRODUCTION — EXECUTE — **NO EJECUTAR sin aprobación explícita**

```powershell
npx tsx prisma/scripts/register-dte-signer-credential.ts `
  --org "TRUSTME-0001" --issuer "584ae9dc-a3f1-4ca8-bcee-e9ad3b9749ad" `
  --environment PRODUCTION --step REGISTER --mode EXECUTE `
  --confirm "REGISTER DTE SIGNER CREDENTIAL PRODUCTION"
```

### 4.4 Health check firmador PROD — **NO EJECUTAR sin aprobación explícita**

```powershell
$env:DTE_SIGNER_URL_PRODUCTION = "https://<host-real-produccion>/firmardocumento/"
$env:DTE_SIGNER_API_KEY        = "..."
npx tsx prisma/scripts/health-check-dte-signer.ts --environment PRODUCTION
```

## 5. Checklist — primer DTE productivo real

Usar antes de emitir el **primer** DTE productivo nuevo (no aplica
retroactivamente a los 2 documentos de §2.3):

1. ☐ Confirmación administrativa/contable de que la operación es real (no
   una prueba, no un dato de demostración).
2. ☐ Tipo de DTE correcto para la operación (01 FE, 03 CCFE, 05 NC, 14 FSE, etc.).
3. ☐ Cliente/proveedor correcto y con datos fiscales completos.
4. ☐ Montos correctos, verificados contra el documento origen (venta/compra).
5. ☐ Retenciones correctas si aplica (renta, IVA percibido/retenido).
6. ☐ `DteIssuerConfig` PRODUCTION correcto y activo (ver §2.1 — ya lo está).
7. ☐ `DteCredential` PRODUCTION registrado y verificado con `INSPECT`
   (ver §4.1) — ya existe (§2.4), pero **revisar con INSPECT antes de
   confiar en él**, especialmente si cambió el firmador o las credenciales
   MH desde agosto 2026.
8. ☐ Firmador PROD `health check` OK (ver §4.4) — ejecutar solo con
   aprobación explícita, el mismo día de la operación real.
9. ☐ Credenciales MH producción (`apiUser`/`apiPassword`) confirmadas
   vigentes — no vencidas, no rotadas sin actualizar.
10. ☐ Correlativos PRODUCTION revisados (§2.2) — confirmar que el siguiente
    número a usar es el esperado, sin saltos ni duplicados.
11. ☐ MariaDB externa lista para recibir el delivery (conexión probada).
12. ☐ Confirmación explícita de que el documento se transmitirá a MH
    PRODUCCIÓN y tendrá efecto fiscal real e irreversible.
13. ☐ Plan de contingencia si MH rechaza (a quién se escala, cómo se
    corrige, si se necesita nota de crédito o invalidación).
14. ☐ **Prohibido usar PRODUCCIÓN para pruebas ficticias.** Invalidar o
    anular un documento real no es un mecanismo de prueba — es una acción
    fiscal con sus propias implicaciones legales.

## 6. Qué NO debe ejecutarse todavía

- `register-dte-signer-credential.ts --environment PRODUCTION --step
  REGISTER --mode EXECUTE` — solo con aprobación explícita, y solo si el
  `DteCredential` existente (§2.4) necesita actualizarse.
- `health-check-dte-signer.ts --environment PRODUCTION` — solo con
  aprobación explícita.
- Cualquier `CREATE`/`GENERATE`/`VALIDATE`/`SIGN`/`TRANSMIT`/`DELIVER` de un
  DTE nuevo contra PRODUCTION — pendiente hasta que exista una operación
  fiscal real de TrustMe y se complete el checklist de §5.
- Cualquier uso de invalidación/anulación como mecanismo de prueba.

## 7. Impacto en bases de datos y sincronización local/remota

- No hubo cambios en `schema.prisma`.
- No se generó ninguna migración.
- No se aplicó ninguna migración.
- Se tocó únicamente `DATABASE_URL`/`DIRECT_URL` local (`TrustmeDB`) en modo
  lectura, para la auditoría de §2. No se escribió nada en esa base.
- No aplica sincronización local/remoto en esta fase — no hubo escritura
  en ninguna base.

## 8. Archivos tocados en esta fase

- `prisma/scripts/register-dte-signer-credential.ts` — extendido para
  soportar `--environment PRODUCTION` en INSPECT y REGISTER (DRY_RUN
  siempre permitido, EXECUTE con confirmación propia). TEST no cambió de
  comportamiento.
- `prisma/scripts/health-check-dte-signer.ts` — nuevo, generaliza
  `health-check-dte-signer-test.ts` (que se dejó intacto) con
  `--environment TEST|PRODUCTION`.
- `docs/modules/dte-trustme-production-readiness.md` — este documento.

Ningún archivo de módulos cerrados (`purchases`, `sales`, `cash`,
`suppliers`, `products`, `inventory`) fue tocado.
