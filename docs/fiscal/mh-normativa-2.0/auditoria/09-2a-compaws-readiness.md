# MH 2.0 — Fase 9.2A: preparación de Compaws (solo lectura)

- **Fecha:** 2026-11-25. Consultas `READ ONLY` en el CP (`nygdq…`) y el runtime (`vkoyw…`). Sin transmisión a MH, sin activar perfiles y sin tocar credenciales, certificados ni firmador.
- Salida saneada: sin URLs, NIT, API keys ni identificadores completos. El tenant se cotejó por md5.

## 1. Resultado

| Control | Evidencia | Estado |
|---|---|---|
| Organización | `compaws`, ACTIVE / PROVISIONED, dominio `compaws.getzolvi.com` | OK |
| Tenant / location | Tenant `compaws` activo (md5 idéntico CP ↔ runtime); 1 location | OK |
| Destino físico | Compartido "Zolvi Shared 01" → `vkoyw…` | OK |
| ¿Comparte base con emisores productivos? | **Sí**: `vkoyw…` aloja los emisores PRODUCTION activos de Metatraining, REC High Training y TrustMe. El aislamiento es lógico (`tenant_id` / `location_id` / `environment`) | Riesgo aceptado, mitigado (§3) |
| Emisor TEST | 1 emisor, **activo**; Compaws no tiene emisor PRODUCTION | OK |
| Códigos AT | `cod_estable_mh` `^[MSBP]\d{3}$` y `cod_punto_venta_mh` `^P\d{3}$` válidos | OK |
| Campos fiscales | NIT, NRC, actividad, departamento y municipio presentes | OK |
| Perfil MH | Columna `mh_spec_profile` **ausente** (M1 no aplicada): hoy el emisor solo puede operar en MH 1.2 | Bloqueado por migraciones |
| Credenciales TEST | 1 `MH_CREDENTIALS` activa, 0 vencidas por `expires_at`. Su vigencia real ante MH no es verificable sin autenticarse | Pendiente de prueba real |
| Firmador TEST | `SIGNER_READY`, API key cifrada presente, credencial registrada, emisor vinculado. Historial del 23/11: INSPECT/PLAN OK, un APPLY fallido y luego OK, 5 VERIFY fallidos y el **último VERIFY SUCCESS** | OK (salud viva no sondeada) |
| Autorización MH TEST | `mh_authorization_confirmed_at` **vacío** | **Pendiente** |
| Correlativos TEST | **0** | Secuencia limpia |
| Documentos TEST | **0** | Sin históricos: COR-01 no interactúa |
| Corridas MH TEST previas | 0 (solo Metatraining 19 y REC 1) | OK |
| Tabla M4 en runtime | Ausente (se usa solo en el CP) | Esperado |

## 2. Prerrequisitos restantes, cada uno con autorización propia

1. Push, PR y merge de la rama (o despliegue Preview, ver `09-2a-deployment-plan.md`).
2. Migraciones remotas: runtime y luego CP (6 cada uno).
3. Seed de catálogos 2.0 en el runtime. Antes, aclarar la fila v1 de diferencia (local 428, remoto 427).
4. Confirmar la autorización MH TEST de Compaws, atestada en el CP con su referencia.
5. Nuevo `VERIFY` del firmador TEST justo antes del smoke test.
6. Flags (ver `09-2a-vercel-access.md`) con allowlist = el **id** de la organización Compaws. `mh20AuthorizedOrganizations` compara contra `organizationId`, no contra el código `compaws`.
7. Perfil `MH_2_0` solo en el emisor TEST de Compaws.

## 3. Mitigación de la base compartida

- Allowlist de una sola organización; corridas solo `environment = TEST`.
- Compaws no tiene emisor PRODUCTION, así que un error de alcance no puede emitir documentos productivos a su nombre.
- Filtros `tenant_id` / `location_id` cubiertos por pruebas. Entrega a MariaDB excluida (8/8).
