# MH 2.0: Phase 9.0 individual smoke-test plan for MH TEST (NOT EXECUTED)

**Rule:** one document at a time. Each step requires the previous one to be ACCEPTED (`PROCESADO`). No batches before every step is individually accepted.

## Prerequisites (all required)

1. M1/M1b/M2 applied in the TEST runtime and M4 in the CP. Verify with `migrate status`.
2. The 26 PG integration tests are green on a scratch database.
3. 2.0 catalogs seeded in the TEST runtime, through the explicit seed runner.
4. Issuer in TEST with:
   - establishment and point-of-sale codes valid under 2.0;
   - valid credentials and signer (not modified by Zolvi);
   - a recorded issuer snapshot.
5. CP flags:
   - `DTE_MH_TEST_RUNS_ENABLED=true`
   - `DTE_MH_TEST_RUNS_M4_APPLIED=true`
   - `DTE_MH_TEST_RUNS_MH20_ENABLED=true`
   - organization included in `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS`
6. Global switch `DTE_MH20_PROFILE_ENABLED` **OFF**. The run uses its own override.
7. Run profile M4 = `MH_2_0`, environment `TEST`. Confirmation text: "INICIAR PRUEBAS TEST MH 2.0".
8. MariaDB delivery excluded in TEST. Confirm it.

## Sequence

| # | Document | `identificacion.version` | Depends on |
|---|---|---|---|
| 1 | FE v2 (identified receiver) | 2 | none |
| 2 | CCF v4 | 4 | 1 accepted |
| 3 | NC v4 on the CCF from step 2 | 4 | 2 accepted, with its code and control number |
| 4 | FSE v2 | 2 | 3 accepted |
| 5 | FEX v3 (services only) | 3 | 4 accepted |
| 6 | Invalidation v3 of a FE from step 1, or a dedicated FE | 3 | 5 accepted. Event date per campo 9 núm. 5. |

Not included: Contingency v4 (INC-005), Return, Special Operations, FEX goods.

## Evidence to record for each step

Store it sanitized, with no credentials, signed JWT or personal data:

- `dte_type_code` and schema version
- `codigoGeneracion`
- TEST control number
- result of local schema validation
- signature status (OK or error code), without the token
- MH response: `estado`, `codigoMsg`, `descripcionMsg`, `observaciones`
- fiscal status in Zolvi
- `selloRecibido` (present or absent)
- rejection code, if any
- timestamps of generation, transmission and response (El Salvador time)

## Stop criteria

| Situation | Action |
|---|---|
| `RECHAZADO` | Stop. Analyze the code. Do not move to the next step. |
| `UNCERTAIN` or timeout | Stop. Query status. **Do not retransmit automatically.** |
| Preflight or gate fails | Do not start. |

The first real transmission requires explicit authorization from the owner at that moment. **This phase stops before any transmission.**
