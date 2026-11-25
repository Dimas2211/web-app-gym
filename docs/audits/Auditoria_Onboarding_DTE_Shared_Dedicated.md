# Auditoría — Onboarding fiscal DTE: compatibilidad SHARED y DEDICATED

**Iniciativa:** compatibilidad SHARED y DEDICATED · **Etapa 1:** auditoría (sin implementación)
**Fecha:** 2026-11-11 · **Alcance:** plataforma / onboarding fiscal DTE, ambientes TEST y PRODUCTION

---

## 0. Precheck Git y base auditada

| Dato | Valor |
|---|---|
| Rama actual | `fix/dte-correlatives-runtime-guard` (no se cambió de rama) |
| HEAD | `b3e8c53` |
| Árbol de trabajo | limpio antes de la auditoría (`git status --porcelain` vacío) |
| Remoto | `origin` → `github.com/Dimas2211/web-app-gym` |
| `git fetch origin` | ejecutado; `origin/main` avanzó `7c72156 → 27115f4` |
| HEAD vs `origin/main` | 0 adelante / 17 atrás; HEAD es ancestro de `origin/main` |

**Base efectiva de la auditoría.** `git diff HEAD origin/main` no muestra cambios en `src/modules/platform/**` (onboarding, runtime, router), `dte-production-preflight.service.ts` ni `src/lib`. En `prisma/schema.prisma` solo cambia el valor `CANCELLED` del enum `DteOutgoingStatus`, que no afecta esta auditoría. Los 17 commits pendientes tocan ventas/cancelación y generadores DTE (`generate-*-json`), fuera de la resolución de runtime. **Por tanto, los hallazgos sobre HEAD `b3e8c53` valen también para `origin/main` `27115f4` en los archivos auditados.** Las líneas citadas son de HEAD.

No se usaron force, reset, clean ni stash. No hubo commit, push, merge ni deploy.

---

## 1. Respuesta directa

**No. El código de onboarding y de emisión no está limitado a Dedicated.** La exigencia de base dedicada es **una sola regla de política** del servicio que calcula el estado del onboarding y solo bloquea **PRODUCTION**.

| Ambiente / etapa | SHARED | DEDICATED |
|---|---|---|
| TEST — registro de emisor, credenciales, firmador, VERIFY, READY_TEST, activación | Soportado. `DEDICATED_DB` aparece solo como advertencia, no entra en los pasos obligatorios ni en los bloqueos. | Soportado |
| TEST — emisión (generar, firmar, transmitir) | Soportado (mismo router) | Soportado |
| PRODUCTION — emisor, credenciales, firmador, preflight, atestación MH | Soportado (ninguno de esos pasos depende del modelo de base) | Soportado |
| PRODUCTION — `READY_PROD` / `canActivate` en el panel de onboarding | **Bloqueado** solo por `DEDICATED_DB` | Soportado |
| PRODUCTION — emisión después de activar | Técnicamente compatible (mismo router y filtros por tenant) | Soportado |

En resumen, el bloqueo es una **restricción de política codificada** (`fiscal-onboarding-status.service.ts:174-181, 281, 296`) y **no responde a una dependencia técnica** del router, del preflight, del firmador ni de los servicios de emisión.

También hay dos incompatibilidades técnicas reales con SHARED, menores y fuera del flujo principal: la entrega MariaDB manual desde "Operar como cliente" (H-06) y la semántica del propio check (H-02). Se detallan abajo.

---

## 2. Matriz de soporte

| Caso | Onboarding (estado y activación) | Emisión posterior | Evidencia | Veredicto |
|---|---|---|---|---|
| **TEST / SHARED** | `DEDICATED_DB` = `warning`, excluido de los obligatorios y de los bloqueos → puede llegar a `READY_TEST` | Router resuelve `PlatformSharedRuntimeTarget`; los filtros llevan `tenant_id` | Código + tests (mock). El propietario informa que MetaTraining está en READY_TEST con 8 DTE aceptados; no se verificó en vivo. | **YES** |
| **TEST / DEDICATED** | Igual; `DEDICATED_DB` = `done` | Router resuelve `PlatformDatabaseProfile` | Código + tests (mock). REC High Training, según el propietario. | **YES** |
| **PRODUCTION / SHARED** | `DEDICATED_DB` = `blocked` → `readyProd = false` y `canActivate = false` aunque todos los demás pasos estén `done` | Compatible por código; no ejecutado | Código + test que fija el bloqueo como esperado | **NO** (por política, no por técnica) |
| **PRODUCTION / DEDICATED** | Con perfil activo + preflight + VERIFY + atestación MH → `READY_PROD` | Compatible | Código + test `READY_PROD` con `dedicated: true` | **YES**, con la salvedad de H-02 (un perfil registrado no prueba aislamiento físico) |

---

## 3. Mapa de bloqueos

| # | Lugar | Archivo:líneas | Condición exacta | Efecto TEST | Efecto PROD | SHARED | DEDICATED | Tipo |
|---|---|---|---|---|---|---|---|---|
| B1 | Servicio de estado | `src/modules/platform/dte-onboarding/fiscal-onboarding-status.service.ts:77-87` (`defaultGetOrganization`) | `has_dedicated_profile = database_profiles.where(is_active).length > 0` | — | — | false salvo perfil residual | true | Insumo del check |
| B2 | Servicio de estado | mismo archivo `:174-181` (paso `DEDICATED_DB`) | `has_dedicated_profile ? "done" : isProd ? "blocked" : "warning"` | warning | **blocked** | **Bloquea PROD** | done | Política codificada |
| B3 | Servicio de estado | `:281-282` (`mandatory`, `allMandatoryDone`) | `DEDICATED_DB` es obligatorio solo si `isProd` | sin efecto | `allMandatoryDone = false` | `readyProd = false` | ok | Política codificada |
| B4 | Servicio de estado | `:292, :300` (`readyProd`, `canActivate`) | `canActivate = isProd ? readyProd : …` | sin efecto | `canActivate = false` | Botón deshabilitado | ok | Consecuencia |
| B5 | Servicio de estado | `:296` (`blockers`) | `DEDICATED_DB` se lista como bloqueo solo en PROD | no listado | listado (el texto que ve el propietario) | Visible | — | Política codificada |
| B6 | Acción de activación | `src/modules/platform/actions/fiscal-onboarding.action.ts:224-227` | `if (!status.canActivate \|\| !status.runtime.issuer) return error` | Requiere `canActivate` | Rechaza por B2 | **Bloquea** | ok | Aplica B2 en servidor |
| B7 | UI | `src/modules/platform/components/platform-fiscal-onboarding-panel.tsx:155, 371-378` | Muestra `blockers.length`; botón `disabled={!status.canActivate}` | — | Botón deshabilitado | Visible | — | Presentación (no decide) |
| B8 | Preflight PROD | `src/modules/commerce/dte/services/dte-production-preflight.service.ts:181-366` | **Ningún** check sobre el modelo de base. Checks: emisor, datos fiscales, establecimiento, credenciales MH, descifrado, firmador efectivo propio, NIT, aislamiento firmador TEST↔PROD, health, endpoints, correlativos, consistencia de config activa | — | Bloquea por causas fiscales | Neutral | Neutral | Independiente del modelo |
| B9 | Switch de ambiente | `src/modules/commerce/dte/services/dte-issuer-config.service.ts:243-276` | PRODUCTION exige preflight no `BLOCKED`; sin check de base | — | Preflight | Neutral | Neutral | Independiente del modelo |
| B10 | Acción Configuración DTE (cliente) | `src/modules/commerce/dte/actions/switch-dte-environment.action.ts:31-91` | `requireAdmin` + módulo `fiscal.dte` + `write` + texto `PRODUCCION` + preflight (vía B9). **No evalúa `DEDICATED_DB` ni la atestación MH** | — | Solo preflight | Ver H-04 | Ver H-04 | Inconsistencia de compuertas |
| B11 | Atestación MH | `src/modules/platform/dte-onboarding/signer-provisioning.service.ts:585-588` | Exige fila `PlatformDteSignerProvisioning(PRODUCTION)` | — | Sin spec PROD no se puede atestar | Neutral | Neutral | Configuración (H-07) |

**Conclusión del mapa:** el único bloqueo que distingue SHARED de DEDICATED es B2, que se propaga por B3–B7. Ningún bloqueo de preflight, switch, firmador o emisión depende del modelo de base.

---

## 4. Recorrido efectivo del runtime

### 4.1 Onboarding (panel de Control Plane, super_admin de plataforma)

```
platform-fiscal-onboarding-panel.tsx
  → getFiscalOnboardingStatusAction / activateFiscalEnvironmentAction   (fiscal-onboarding.action.ts, requireSuperAdmin)
    → getFiscalOnboardingStatus(orgId, env)                              (fiscal-onboarding-status.service.ts:147)
        ├─ defaultGetOrganization  → controlPlanePrisma (tenant_id, shared_runtime_target_id, perfiles activos)
        ├─ getSignerProvisioningSummary(orgId, env) → controlPlanePrisma (por organization_id + environment)
        ├─ getDteMariaDbIntegrationSummary(orgId)   → controlPlanePrisma (por organización, sin ambiente)
        └─ defaultReadRuntimeFacts → withOrganizationRuntimePrisma(orgId)  (runtime-database-router.ts:414)
              → resolveRuntimeDatabaseProfileForOrganization(orgId)        (:180-208)
                   ├─ SHARED:    shared_runtime_target_id → PlatformSharedRuntimeTarget (activo) (:185-192, :137-152)
                   └─ DEDICATED: PlatformDatabaseProfile activo; con varios, prioridad PRODUCTION>…>LOCAL (:194-207)
              → PrismaClient temporal → dteIssuerConfig{tenant_id, environment}, DteCredential, firmador efectivo,
                 conteo ACCEPTED{tenant_id, environment}, preflight PROD{tenant_id, location_id}
    → (activar) withOrganizationRuntimePrisma(orgId) → switchActiveDteEnvironment{tenant_id, location_id} (fiscal-onboarding.action.ts:234-243)
```

### 4.2 Emisión (cliente real, login por hostname)

```
hostname → resolveOrganizationByHostname (domain único, fail closed 0/2+)      resolve-organization-by-hostname.ts:105-139
  → login RUNTIME_CLIENT → getDteApiContext → resolveEffectiveApiContext        app/api/dte/dte-api-context.ts:109
    → requireRuntimeOrganizationContext (licencia, tenant JWT = tenant org, usuario/sede LIVE)  require-runtime-organization-context.ts:170-325
      → resolveRuntimeDatabaseProfileForOrganization  (MISMO router, SHARED o DEDICATED)        :246
        → generar JSON / firmar (issuer verificado por tenant+location y ambiente)   sign-dte-document.service.ts:134-166
        → transmitir (ambiente del documento, nunca NODE_ENV)                        transmit-dte-document.service.ts:245
```

### 4.3 Hallazgos sobre la ruta

- **TEST y PRODUCTION usan el mismo router, sin dimensión de ambiente fiscal.** El emisor TEST y el PROD viven en la misma base runtime del tenant y se distinguen por `DteIssuerConfig.environment`, con `@@unique([tenant_id, location_id, environment])` (`schema.prisma:2444`). `ENVIRONMENT_PRIORITY` (router `:62-68`) se refiere al ambiente del *perfil de base*, no al ambiente fiscal. No existe una ruta PROD separada que pueda elegir otra base. *(Código.)*
- **SHARED y DEDICATED convergen** en `RuntimeDatabaseProfile` y `withRuntimePrisma`. Solo cambia la tabla de origen de la conexión (router `:130-136`). *(Código + `runtime-database-router.shared-target.test.ts`, 7 tests.)*
- **Precedencia:** si una organización tiene `shared_runtime_target_id`, el router usa SHARED aunque también exista un `PlatformDatabaseProfile` activo (`:185`). *(Código.)*
- **Resolución por hostname:** no depende del ambiente ni del modelo de base. *(Código + 9 tests.)*
- **Sin fallback a otro cliente en estas rutas:** `withOrganizationRuntimePrisma` lanza error (no hay degradación), `requireRuntimeOrganizationContext` es fail closed, y `resolveOrganizationRuntime` valida tenant del perfil = tenant de la organización (`resolve-organization-runtime.ts:129-133`). *(Código + tests.)*

---

## 5. Hallazgos clasificados

Clasificación: **[T]** incompatibilidad técnica · **[P]** restricción de política codificada · **[C]** configuración incompleta · **[U]** error de interfaz o resumen. Evidencia: **código**, **doc**, **ejecución** (tests locales con mocks) o **propietario** (informado por UI, no verificado).

### H-01 [P] Política "Dedicated DB Only" en el estado del onboarding
- **Dónde:** `fiscal-onboarding-status.service.ts:9-11` (cabecera), `:174-181`, `:281`, `:296`.
- **Condición:** PROD sin `PlatformDatabaseProfile` activo → `blocked`.
- **TEST:** advertencia. **PROD:** bloqueo total de `READY_PROD`/activación.
- **SHARED:** imposibilita PROD. **DEDICATED:** sin efecto.
- **¿Dependencia técnica?** No. Ningún consumidor posterior (preflight, switch, firma, transmisión, correlativos, metering, outbox) lee `has_dedicated_profile` ni el modelo de base. *(Código: búsqueda dirigida de `has_dedicated_profile`, `database_profiles`, `DEDICATED_DB` y `Dedicated DB Only` en `src/**`. El único consumidor es este servicio.)*
- **Contradicción:** la regla contradice el requisito del propietario. Ver §5.1.

### H-02 [U] El check no mide lo que su etiqueta afirma
- **Dónde:** `fiscal-onboarding-status.service.ts:77-87` y `:177` ("Base runtime dedicada verificada").
- Las condiciones del punto 4 del encargo son distintas, y el check solo comprueba la primera:

| Condición | ¿Lo prueba `has_dedicated_profile`? |
|---|---|
| Tener un perfil registrado | Sí, y nada más |
| Tener una base físicamente dedicada | **No.** Un perfil es host/usuario/base cifrados; nada impide que apunte a la misma base física que un Shared Target. La documentación registra "Runtime Shared/TrustMe (`vkoywmzlgygypaddxjtn`)" como una sola base física (`docs/context/current-state.md:64`). *(Doc, no verificado.)* |
| Resolver un runtime válido | No. Eso lo mide `RUNTIME_REACHABLE` con el router real. |
| Aislamiento lógico por tenant/location | No. Lo garantizan los filtros `tenant_id`/`location_id` (H-08). |

- **Además, no coincide con el router:** una organización SHARED con un perfil dedicado activo residual obtendría `DEDICATED_DB = done` mientras el router la envía a la base compartida (router `:185`). *(Código, inferencia sobre datos posibles; no se consultaron datos.)*
- **Efecto:** el check puede bloquear clientes SHARED válidos y dar por "verificado" un aislamiento físico que no comprueba.

### H-03 [—] TEST y PROD comparten router y base del tenant
Descrito en §4.3. No es un defecto: el aislamiento TEST↔PROD se apoya en `environment` del emisor, en la verificación de ambiente en la firma (`sign-dte-document.service.ts:144-148`), en las credenciales por `issuer_config_id` y en `SIGNER_ENV_ISOLATION` del preflight (`:145-164`). Vale igual para SHARED y DEDICATED. *(Código.)*

### H-04 [P/U] Dos caminos de activación PROD con compuertas distintas
- **Camino A — panel de plataforma** (`fiscal-onboarding.action.ts:213-246`): exige `canActivate`, es decir `DEDICATED_DB` + atestación MH + VERIFY del firmador administrado + `SIGNER_REACHABLE = ok` + preflight. Después vuelve a correr el preflight dentro de `switchActiveDteEnvironment`.
- **Camino B — Configuración DTE del cliente** (`switch-dte-environment.action.ts:31-91`): `requireAdmin` (super_admin o branch_admin del tenant), módulo `fiscal.dte`, `write`, texto `PRODUCCION` y **solo** el preflight (no `BLOCKED`; un `WARNING` por firmador inaccesible sí pasa).
- **Efecto:** el camino B no aplica `DEDICATED_DB`, ni la atestación MH, ni la exigencia de health OK. Para PRODUCTION/SHARED, el camino B no está bloqueado por el modelo de base. *(Código; no ejecutado.)* Esto **no** se considera una vía autorizada: es una inconsistencia de controles que la Etapa 2 debe resolver con una sola compuerta y que nadie debe usar como atajo.

### H-05 [U] Mensaje de activación con una vía que no funciona
- **Dónde:** `fiscal-onboarding.action.ts:237-240`.
- El camino A exige que el `user.id` del super_admin de plataforma exista en el runtime del cliente. Si no existe, sugiere activar desde "Operar como cliente → Configuración DTE". Pero Support Session es `readOnly = true` (`effective-tenant-context.ts:148`) y `switchDteEnvironmentAction` pide `write: true` → `READ_ONLY` (`require-operational-context.ts:177-179`).
- **Efecto:** en SHARED y DEDICATED por igual, la sugerencia lleva a un rechazo. No distingue modelos, pero confunde el diagnóstico de PROD. *(Código.)*
- No se determinó cómo se activó TEST en REC y MetaTraining (camino A con usuario espejo o camino B con login del cliente). Ver §10.

### H-06 [T] Entrega MariaDB manual desde "Operar como cliente" incompatible con SHARED
- **Dónde:** `src/modules/commerce/dte/runtime/require-runtime-dte-write-access.ts:201-210`.
- Con Support Session activa resuelve `resolveRuntimeDatabaseProfileById(runtime.profileId)`, que solo busca en `PlatformDatabaseProfile`. En SHARED, `runtime.profileId` es el **id del Shared Target** (`enter-organization-runtime.action.ts:59-71` ← `resolve-organization-runtime.ts:109, 135-143`; `toRuntimeProfile` usa `target.id`). Resultado esperado: `ProfileNotFoundError`.
- El resolver correcto ya existe: `resolveRuntimeProfileForSession` (`resolve-runtime-session-profile.ts:35-47`) contempla `runtimeKind = SHARED`.
- **Afecta:** `deliver-dte-to-external-db.action.ts` y `deliver-invalidation-to-external-db.action.ts` en Support Session, en TEST y PROD. **No afecta** al worker automático (`external-delivery-processor.service.ts:51-52, 101-102`, que usa `withOrganizationRuntimePrisma` con filtro `tenant_id`), a la prueba MariaDB del onboarding ni al camino RUNTIME_CLIENT (`:122-161`).
- *(Código; no ejecutado. El test existente mockea `resolveRuntimeDatabaseProfileById` y no cubre una sesión SHARED.)*

### H-07 [C] La atestación MH PROD exige un firmador PROD registrado en el aprovisionador
- **Dónde:** `signer-provisioning.service.ts:576-594`; el paso `MH_PROD_AUTHORIZATION` lee `signer.mh_authorization_confirmed_at` (`fiscal-onboarding-status.service.ts:273-277`).
- Un firmador PROD registrado **manualmente** (como el TEST de MetaTraining, `!signer.exists`) pasa `SIGNER_INFRA`/`SIGNER_CREDENTIAL`, pero no puede atestar MH sin una spec `PlatformDteSignerProvisioning(PRODUCTION)`.
- No depende del modelo de base, pero condiciona el piloto. *(Código.)*

### H-08 [—] Aislamiento lógico en las rutas implicadas (revisado)
| Operación | Filtro / control | Archivo |
|---|---|---|
| Emisor del onboarding | `tenant_id` + `environment` | `fiscal-onboarding-status.service.ts:103-108` |
| DTE aceptados | `tenant_id` + `environment` (+ `accepted_at`) | `:125-130` |
| Preflight PROD | `tenant_id` + `location_id` + `environment` | `dte-production-preflight.service.ts:189-191, 146-149, 335-337, 349-351` |
| Registro de credencial del firmador | issuer por `id` + `tenant_id` + `environment`; upsert por `id` + `tenant_id` + `location_id` | `signer-provisioning.service.ts:537-547`; `dte-credential.service.ts:182-199` |
| Switch de ambiente | `id` + `tenant_id` + `location_id` | `dte-issuer-config.service.ts:256-259, 295-298` |
| Firma | issuer por `id` + `tenant_id` + `location_id` y ambiente igual al del documento | `sign-dte-document.service.ts:134-149` |
| Correlativos | `@@unique([tenant_id, location_id, issuer_config_id, environment, dte_type_code, year])` | `schema.prisma:2558` |
| Outbox MariaDB | `tenant_id` del org en Control Plane; jobs por `organization_id` | `external-delivery-processor.service.ts:56-66, 101-102` |

- `DteCredential` no tiene `tenant_id`. Se aísla por `issuer_config_id`, y `resolveDteSignerConfigForIssuer` busca solo por ese id (`dte-credential.service.ts:411-415`). En todas las rutas auditadas el issuer se validó antes por tenant; un caller futuro que no lo haga sería un riesgo en SHARED.
- `getDteProductionPreflight` y `switchActiveDteEnvironment` usan `prisma` global por defecto si no reciben `db`. Todos los callers auditados pasan el cliente runtime (`get-dte-environment-panel-data.test.ts` lo verifica).
- **Conclusión:** en las rutas auditadas no se encontró ninguna lectura o escritura sin filtro de tenant ni fallback a otro cliente. *(Solo código; los tests son unitarios con mocks, no una prueba de aislamiento contra una base compartida real.)*

### H-09 [—] Requisitos PROD independientes del modelo de base
Autorización MH (atestación), emisor PROD con datos fiscales y códigos MH, credenciales MH PROD propias y descifrables, firmador efectivo propio (URL + API Key + NIT del certificado = NIT del emisor, distinto del firmador TEST, accesible), endpoints MH PROD, correlativos PROD (se crean en la primera reserva), y metering fiscal MANAGED + PROD con `timezone` obligatorio (`dte-fiscal-metering.service.ts:127`). Ninguno lee el modelo de base. *(Código.)*

### H-10 [C] La integración MariaDB es por organización, sin ambiente
- `PlatformExternalIntegration` tiene `@@unique([organization_id, type])`, sin `environment`. El worker toma DTE `ACCEPTED` de **ambos** ambientes (`external-delivery-processor.service.ts:101-102`, sin filtro de `environment`).
- Al abrir PROD, los DTE productivos irían al mismo destino que los TEST (p. ej. `dtes_metatraining`), salvo que se reconfigure. No depende del modelo de base, pero sí afecta al piloto. Que sea o no lo deseado lo decide el propietario. *(Código.)*

### H-11 [—] Riesgos menores detectados (fuera de alcance, independientes del modelo)
- La firma conserva el fallback `GLOBAL_ENV` incluso en PRODUCTION (`dte-credential.service.ts:435-463`; `sign-dte-document.service.ts:158-166`). El preflight lo bloquea al activar, pero si después falla el descifrado de la credencial, la firma caería al firmador global. Conviene endurecerlo aparte.
- `defaultReadRuntimeFacts` elige el emisor por `tenant_id` + `environment` sin sucursal (`:103-108`). En multi-sede, el estado refleja una sola sede.

### 5.1 Contradicciones documentales (no tratadas como autorización)

| Documento | Afirmación | Relación con el requisito del propietario |
|---|---|---|
| `docs/modules/dte-fiscal-onboarding-automation.md:12` | PROD requiere "BD dedicada" | **Contradice** |
| `fiscal-onboarding-status.service.ts:9-11, 174` (comentario) | "política Dedicated DB Only" | **Contradice** |
| `docs/modules/platform-phase-6e6c…:3`, `…6e7-external-delivery.md:3`, `…6e8-dte-integral-certification.md:10` | "Dedicated DB only. NO Shared/Hybrid" | Describen el **alcance de esas fases** (anteriores a SHARED-PILOT-4A), no una política vigente. `current-state.md:1228` las marca como superadas. Probable origen de la regla. |
| `docs/modules/guia-zolvi-firmador-dte-mariadb.md:76, 414` | "*Si* la política exige Dedicated DB Only…" | Condicional; no establece la política |
| `prisma/schema.prisma:3242-3245` | En Shared "el aislamiento … lo garantiza `tenant_id`" | **Respalda** el requisito |
| `docs/context/current-state.md:115` | Shared y Dedicated convergen en el mismo router | **Respalda** |
| `docs/context/current-state.md:123, 125, 1276` | "DTE Shared: onboarding fiscal DEFERRED; Metatraining sin DteIssuerConfig…" | **Desactualizado** frente a la evidencia del propietario (TEST operativo) |
| `docs/context/current-state.md:54` | FISCAL-ONBOARDING "sin commit; migración no aplicada" | Posiblemente desactualizado (PR #15/#16 en `main`). No se verificaron las bases. |

---

## 6. Controles que deben conservarse

1. `READY_TEST` nunca implica `READY_PROD`; estados separados.
2. El router como única puerta al runtime: identidad por `organizationId`, `tenant_id` siempre desde Control Plane, fail closed sin fallback global ni a otro cliente.
3. Validación tenant del perfil = tenant de la organización, y revalidación en vivo de licencia, usuario, rol y sede en RUNTIME_CLIENT.
4. En PROD, un runtime resuelto, alcanzable y **coherente con el modelo declarado** sigue siendo obligatorio (se sustituye el "dedicado" por esto, no se elimina).
5. Preflight PROD completo: firmador efectivo propio, `GLOBAL_ENV` bloqueado, NIT del certificado, secretos distintos, firmador PROD ≠ TEST, health real exigido para `READY_PROD`, credenciales MH propias y descifrables.
6. VERIFY real del firmador administrado (`SIGNER_READY`) antes de contarlo como efectivo; solo cuentan DTE aceptados desde el registro de su credencial.
7. Atestación MH manual por super_admin con referencia documental.
8. Confirmación textual exacta (`PRODUCCION` / `ACTIVAR TEST`) y preflight repetido dentro del switch (defensa en profundidad).
9. Switch atómico de ambiente con exactamente una config activa por sede y auditoría (`DteEnvironmentAuditLog`).
10. Filtros `tenant_id`/`location_id` en todas las lecturas y escrituras DTE y unicidades que incluyen `tenant_id` (correlativos, emisor).
11. Support Session en solo lectura y allowlist de escritura DTE (`DELIVER_EXTERNAL`) con super_admin + confirmación.
12. MariaDB opcional; `UNCERTAIN` nunca se reintenta solo.
13. Sin excepciones por organización ni perfiles ficticios.

---

## 7. Pruebas ejecutadas y cobertura faltante

### 7.1 Verificación previa (sin red ni bases reales)
- `vitest.config.ts` sin `globalSetup`/`setupFiles`.
- Los 18 archivos usan `vi.mock` o dependencias inyectadas (fake DB, transporte simulado, `fetchMock`, `controlPlanePrisma: {}`). El health check del preflight está mockeado (`dte-production-preflight.service.test.ts:10-12`).
- Por precaución, se ejecutó con `DATABASE_URL` y `DIRECT_URL` apuntando a `127.0.0.1:1` (inalcanzable), sin tocar `.env`.

### 7.2 Comando y resultado real

```bash
DATABASE_URL="postgresql://audit:audit@127.0.0.1:1/none" DIRECT_URL="postgresql://audit:audit@127.0.0.1:1/none" \
npx vitest run src/modules/platform/dte-onboarding \
  src/modules/platform/runtime/{runtime-database-router.shared-target,resolve-organization-runtime,resolve-runtime-session-profile,require-operational-context,require-runtime-organization-context,resolve-organization-by-hostname,effective-tenant-context}.test.ts \
  src/modules/commerce/dte/services/dte-production-preflight.service.test.ts \
  src/modules/commerce/dte/queries/get-dte-environment-panel-data.test.ts \
  src/modules/commerce/dte/actions/switch-dte-environment.action.test.ts \
  src/modules/commerce/dte/services/dte-issuer-config.service.runtime-write.test.ts \
  src/modules/commerce/dte/runtime/require-runtime-dte-write-access.test.ts \
  src/app/api/dte/dte-api-context.test.ts
```

**Resultado: 18 archivos, 170 tests, todos PASS (≈2,9 s).**

| Archivo | Tests |
|---|---|
| fiscal-onboarding-status.service | 7 |
| signer-provisioning.service | 20 |
| signer-provisioning.presenter | 13 |
| signer-executor.transport | 6 |
| dte-mariadb-integration.service | 9 |
| runtime-database-router.shared-target | 7 |
| resolve-organization-runtime | 9 |
| resolve-runtime-session-profile | 5 |
| require-operational-context | 14 |
| require-runtime-organization-context | 21 |
| resolve-organization-by-hostname | 9 |
| effective-tenant-context | 12 |
| dte-production-preflight.service | 7 |
| get-dte-environment-panel-data | 2 |
| switch-dte-environment.action | 4 |
| dte-issuer-config.service.runtime-write | 5 |
| require-runtime-dte-write-access | 7 |
| dte-api-context | 13 |

No se ejecutó la suite completa ni `build`, porque no aportan evidencia a esta pregunta. No se ejecutó ninguna prueba con conexión real.

### 7.3 Por qué los tests no detectaron la restricción
- El fixture de `fiscal-onboarding-status.service.test.ts:41` fija siempre `shared_runtime_target_id: null`; ningún caso modela una organización SHARED.
- El test `:61-68` ("MetaTraining PRODUCTION hoy") **afirma** que `DEDICATED_DB` debe bloquear. La restricción está cubierta como comportamiento esperado, no como defecto.
- `READY_PROD` solo se prueba con `dedicated: true` (`:96-120`).
- El router sí prueba SHARED (7 tests), pero no hay una prueba de punta a punta onboarding → router → estado.

### 7.4 Cobertura faltante
1. Onboarding TEST/SHARED y PROD/SHARED con todos los demás pasos `done`.
2. Organización SHARED con perfil dedicado residual activo (incoherencia del modelo, H-02).
3. Shared Target inactivo/inexistente → PROD bloqueado (en el onboarding, no solo en el router).
4. `requireRuntimeDteWriteAccess` con Support Session `runtimeKind = SHARED` (H-06).
5. Paridad de compuertas entre el camino A y el camino B (H-04).
6. Aislamiento real entre dos tenants en una misma base física (PostgreSQL desechable) para las rutas DTE PROD: emisor, credencial, preflight, correlativo, switch y outbox.
7. Atestación MH con firmador PROD manual (H-07).

---

## 8. Propuesta mínima para la Etapa 2 (sin implementar)

### 8.1 Cambio central: de "base dedicada" a "aislamiento runtime verificado"
Sustituir el paso `DEDICATED_DB` por `RUNTIME_ISOLATION`, calculado a partir de **la misma resolución del router** y no de la mera existencia de un perfil:

| Situación (desde Control Plane, igual que el router) | TEST | PROD | Detalle mostrado |
|---|---|---|---|
| `shared_runtime_target_id` → target activo, tenant resuelto = tenant org | done | done | "Base compartida (SHARED): aislamiento lógico por tenant_id/location_id." |
| Sin shared target → `PlatformDatabaseProfile` activo, tenant coincide | done | done | "Base con perfil propio (DEDICATED). El perfil no certifica aislamiento físico." |
| Shared target inactivo/inexistente, o sin perfil activo | blocked | blocked | Error del router (ya lo refleja `RUNTIME_REACHABLE`) |
| SHARED **y** perfil dedicado activo a la vez (modelo ambiguo) | warning | **decisión del propietario** (recomendado: blocked, "reconciliar modelo") | "El router usa SHARED; existe un perfil dedicado activo residual." |

Reglas: sin listas de organizaciones, sin flags por cliente y sin perfiles ficticios. El paso sigue siendo obligatorio en PROD (control 6.4). Si en el futuro se quiere exigir Dedicated a ciertos clientes, debe hacerse con un dato explícito por organización o plan, nunca en código. Queda como opción, no se propone ahora.

### 8.2 Archivos que cambiarían
| Archivo | Cambio |
|---|---|
| `src/modules/platform/dte-onboarding/fiscal-onboarding-status.service.ts` | `getOrganization` devuelve `runtimeKind` y la señal de ambigüedad, además de `has_active_profile`. El paso `DEDICATED_DB` pasa a `RUNTIME_ISOLATION` y se retiran las excepciones `s.code !== "DEDICATED_DB"` de `:281` y `:296`. Se actualiza la cabecera `:9-11`. |
| `src/modules/platform/dte-onboarding/fiscal-onboarding-status.service.test.ts` | Casos nuevos de §7.4 (1–3). Se reescribe `:61-68`: MetaTraining PROD sigue bloqueado, pero por emisor, credenciales, firmador y MH, no por la base. |
| `src/modules/commerce/dte/runtime/require-runtime-dte-write-access.ts:203` | Usar `resolveRuntimeProfileForSession(runtime)` en lugar de `resolveRuntimeDatabaseProfileById` (H-06), más su test SHARED. |
| `src/modules/platform/actions/fiscal-onboarding.action.ts:239` | Corregir el mensaje (H-05): indicar la vía real (login del administrador del cliente → Configuración DTE, o usuario operador en el runtime). |
| `docs/modules/dte-fiscal-onboarding-automation.md`, `docs/context/current-state.md` | Retirar "BD dedicada" como requisito PROD, documentar `RUNTIME_ISOLATION` y actualizar "DTE Shared DEFERRED". |

Si `getOrganization` reutiliza `resolveOrganizationRuntime` (`resolve-organization-runtime.ts:83`), el check queda alineado por construcción con el router y ya valida que el tenant coincide. Esto es preferible a duplicar la lógica.

### 8.3 Decisiones fuera del cambio mínimo (requieren autorización del propietario)
- **H-04:** unificar la compuerta PROD de los caminos A y B, por ejemplo haciendo que `switchDteEnvironmentAction` hacia PROD exija también la atestación MH y el health real. Cambia el comportamiento de un módulo en operación (Configuración DTE), así que se propone como subetapa separada.
- **H-10:** ¿destino MariaDB separado por ambiente o filtro de `environment` en el worker?
- **H-07:** permitir atestar MH con firmador PROD manual o exigir una spec del aprovisionador.
- **H-11:** bloquear `GLOBAL_ENV` en la firma PRODUCTION.

### 8.4 Pruebas necesarias en la Etapa 2
- Matriz unitaria TEST/PROD × SHARED/DEDICATED/ambiguo/inactivo en el servicio de estado.
- Regresión: `READY_PROD` DEDICATED sin cambios; `READY_TEST` sin cambios; MetaTraining PROD sigue bloqueado por las causas fiscales reales.
- `requireRuntimeDteWriteAccess` SHARED y DEDICATED en Support Session.
- Recomendado: una prueba de integración con PostgreSQL desechable, con dos tenants en una sola base, para preflight, switch, upsert de credencial y conteo de aceptados (aislamiento probado, no solo leído).
- `npx tsc --noEmit`, `npm run lint` y los 18 archivos de §7.2. Sin migraciones: **la Etapa 2 no requiere cambios en `schema.prisma`.**

### 8.5 Riesgos
- **El aislamiento SHARED es solo de aplicación.** No hay RLS (deuda registrada en `current-state.md:125`). En SHARED, un filtro de tenant omitido en código futuro expone datos fiscales de otro cliente; en DEDICATED quedaría contenido. Mitigación: la prueba de integración de §8.4 y una revisión obligatoria de filtros en PRs DTE.
- Cambiar la etiqueta y semántica del check puede hacer que clientes DEDICATED actuales muestren otro texto; el estado no debería cambiar.
- Si se elige "blocked" para el modelo ambiguo, alguna organización real podría quedar bloqueada en PROD hasta reconciliarse. Antes de desplegar debe hacerse un inventario de solo lectura (§10).

---

## 9. Aplicación a MetaTraining como piloto de la solución general

MetaTraining es **una organización SHARED más**. No se le aplicaría nada específico. Con la Etapa 2, su panel PROD mostraría:

| Paso | Estado esperado tras Etapa 2 | Acción (fuera de esta etapa, con autorización) |
|---|---|---|
| `RUNTIME_ISOLATION` | done (SHARED), si su target está activo y no hay perfil residual | Verificar en solo lectura que no exista un `PlatformDatabaseProfile` activo |
| `ISSUER_CONFIG` PROD | blocked | Crear `DteIssuerConfig(PRODUCTION)` en la misma sede/tenant, con códigos MH productivos |
| `MH_CREDENTIALS` | blocked | Registrar credenciales MH PROD propias |
| `SIGNER_INFRA` / `SIGNER_CREDENTIAL` | pending/blocked | Firmador PROD **distinto** del TEST (`dte-firmador-metatraining-test`, puerto 8115, `firmador-metatraining-test.getzolvi.com` no pueden reutilizarse), con certificado PROD, API Key propia, NIT = emisor y VERIFY real |
| `PROD_PREFLIGHT` | pending | "Verificar PRODUCCIÓN" (sin firmar ni transmitir); exige `SIGNER_ENV_ISOLATION` ok y `SIGNER_REACHABLE` ok |
| `MH_PROD_AUTHORIZATION` | blocked | Atestación con referencia MH. Requiere una spec PROD en el aprovisionador (H-07) |
| Metering | — | `PlatformOrganization.timezone` informado (MANAGED + PROD) |
| MariaDB | optional | Decidir H-10 antes de la primera emisión PROD |
| Activación | — | Camino A con confirmación `PRODUCCION`. Resolver antes H-05 (actor en runtime) |

El mismo resultado aplicaría a Commerce Pilot u otra organización SHARED. Para DEDICATED (p. ej. TrustMe, REC) el comportamiento no cambia.

---

## 10. Evidencias pendientes (no resolubles con auditoría local)

1. **Modelo real de MetaTraining en Control Plane:** `shared_runtime_target_id` poblado, target activo y ausencia de un `PlatformDatabaseProfile` activo residual. Requiere consulta de solo lectura al Control Plane (no autorizada en esta etapa).
2. **Inventario de organizaciones** con el modelo ambiguo (shared target + perfil activo) y organizaciones DEDICATED cuyo perfil apunta a la misma base física que un target compartido (p. ej. la nota "Runtime Shared/TrustMe `vkoywm…`").
3. **Cómo se activó TEST** en REC y MetaTraining (camino A con usuario espejo, o camino B), para resolver H-05 sin suposiciones.
4. **Estado de la migración** `20261110000000_dte_fiscal_onboarding_automation` en el Control Plane productivo (la documentación dice "no aplicada" y la UI del propietario funciona).
5. **Comportamiento en vivo de H-06** (entrega manual SHARED desde Support Session): solo por código.
6. **Aislamiento SHARED probado** contra una base compartida real o desechable; hoy es solo código.
7. **Autorización productiva MH** de MetaTraining, certificado PROD, hostname y puerto del firmador PROD: dependen de terceros e infraestructura (WHM, DNS, Docker), fuera del alcance.
8. Los estados de MetaTraining y REC citados en este informe son **evidencia del propietario por UI**; no se verificaron en vivo.

---

## Estados

```
AUDIT_COMPLETE                     = YES
TEST_SHARED_SUPPORTED              = YES
TEST_DEDICATED_SUPPORTED           = YES
PROD_SHARED_SUPPORTED              = NO          (bloqueo de política DEDICATED_DB en el onboarding; la emisión es técnicamente compatible)
PROD_DEDICATED_SUPPORTED           = YES
DEDICATED_ONLY_BLOCKERS_IDENTIFIED = YES         (B2→B7; además H-06 técnico secundario)
RUNTIME_ISOLATION_VERIFIED         = CODE_ONLY
MINIMAL_FIX_DEFINED                = YES
CODE_UNCHANGED                     = YES
READY_FOR_STAGE_2                  = YES         (con las decisiones de §8.3 abiertas)
```

No se inicia la Etapa 2 sin autorización.
