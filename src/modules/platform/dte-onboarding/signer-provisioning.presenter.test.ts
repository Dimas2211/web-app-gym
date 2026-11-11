// FISCAL-ONBOARDING — presentación del firmador: última inspección y
// aprovisionamiento son conceptos independientes; last_error se conserva
// y se etiqueta como histórico cuando un INSPECT posterior es exitoso.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import { presentSignerState, type SignerStateInput } from "./signer-provisioning.presenter";
import { digestObservedState } from "./signer-provisioning.service";

const STALE = "EXECUTOR_UNREACHABLE: No se pudo contactar al ejecutor del VPS.";
const t = (iso: string) => new Date(iso);

// observed_state real de REC TEST (sanitizado): contenedor OK, falta vhost.
const REC_OBSERVED = digestObservedState({
  container: { name: "dte-firmador-rechightraining-test", state: "running", managed: true, templateVersion: "zolvi-signer-v1", loopbackOnly: true, boundToExpectedPort: true },
  cert: { present: true, fingerprint: "x" }, apiKey: { present: true, fingerprint: "y" },
  compose: { present: true, templateVersion: "zolvi-signer-v1", matches: true },
  vhost: { present: false, templateVersion: null, matches: false },
  containerCount: 4,
});

const REC: SignerStateInput = {
  status: "FAILED",
  last_error: STALE,
  last_apply_run:   { id: "apply-1", mode: "APPLY", status: "FAILED", started_at: t("2026-11-10T15:00:00Z"), error_message: STALE },
  last_inspect_run: { id: "insp-9", mode: "INSPECT", status: "SUCCESS", started_at: t("2026-11-11T02:00:00Z"), error_message: null },
  observed: REC_OBSERVED,
};

describe("presentSignerState — caso REC TEST", () => {
  const p = presentSignerState(REC);

  it("INSPECT exitoso no se presenta como fallo de conectividad", () => {
    expect(p.inspection).toMatchObject({ tone: "ok", current: true });
    expect(p.inspection.text).not.toMatch(/UNREACHABLE|contactar/);
  });

  it("FAILED no se convierte en READY por un INSPECT exitoso", () => {
    expect(p.provisioning).toEqual({ tone: "error", text: "Incompleto (FAILED)." });
  });

  it("pendiente: configuración HTTPS (solo vhost; contenedor, cert, API Key y compose OK)", () => {
    expect(p.pending).toEqual(["Configuración HTTPS del firmador (include Apache)"]);
  });

  it("último APPLY: falló por interrupción de comunicación, con la evidencia original", () => {
    expect(p.lastApply?.text).toBe(`Falló por interrupción de comunicación — ${STALE}`);
    expect(p.lastApply?.tone).toBe("error");
  });

  it("last_error se conserva textual, atribuido al APPLY y marcado histórico", () => {
    expect(p.lastError).toEqual({ text: STALE, origin: "último APPLY", fromLastApply: true, historical: true });
  });
});

describe("presentSignerState — errores actuales siguen visibles", () => {
  it("INSPECT actual fallido se muestra como error actual con su código", () => {
    const p = presentSignerState({ ...REC, last_inspect_run: { id: "i", mode: "INSPECT", status: "FAILED", started_at: t("2026-11-11T03:00:00Z"), error_message: "EXECUTOR_UNREACHABLE: No se pudo contactar al ejecutor del VPS." } });
    expect(p.inspection).toMatchObject({ tone: "error", current: true });
    expect(p.inspection.text).toContain("EXECUTOR_UNREACHABLE");
    expect(p.lastError?.historical).toBe(false);
  });

  it("INSPECT exitoso ANTERIOR al APPLY fallido no vuelve histórico el error", () => {
    const p = presentSignerState({ ...REC, last_inspect_run: { ...REC.last_inspect_run!, started_at: t("2026-11-10T14:00:00Z") } });
    expect(p.lastError?.historical).toBe(false);
  });

  it("APPLY fallido por otra causa no se etiqueta como interrupción de comunicación", () => {
    const msg = "API_KEY_DRIFT: la API Key del VPS no coincide con la registrada en Zolvi.";
    const p = presentSignerState({ ...REC, last_error: msg, last_apply_run: { ...REC.last_apply_run!, error_message: msg } });
    expect(p.lastApply?.text).toBe(`Falló — ${msg}`);
  });

  it("error de VERIFY (no del último APPLY) se atribuye genéricamente", () => {
    const p = presentSignerState({ ...REC, status: "INFRA_READY", last_error: "DNS: no resuelve", last_apply_run: { ...REC.last_apply_run!, status: "SUCCESS", error_message: null } });
    expect(p.lastError).toMatchObject({ origin: "última operación de aprovisionamiento", fromLastApply: false });
    expect(p.provisioning.text).toContain("falta VERIFY");
  });

  it("sin INSPECT ni APPLY: neutral, sin pendientes inventados", () => {
    const p = presentSignerState({ status: "DRAFT", last_error: null, last_inspect_run: null, last_apply_run: null, observed: null });
    expect(p.inspection.tone).toBe("neutral");
    expect(p.pending).toEqual([]);
    expect(p.lastApply).toBeNull();
    expect(p.lastError).toBeNull();
  });

  it("SIGNER_READY: completo y sin pendientes", () => {
    const p = presentSignerState({ ...REC, status: "SIGNER_READY", last_error: null });
    expect(p.provisioning.tone).toBe("ok");
    expect(p.pending).toEqual([]);
  });
});

describe("digestObservedState — sin secretos", () => {
  it("solo devuelve booleanos (sin huellas, nombres ni contenedores ajenos)", () => {
    const d = REC_OBSERVED!;
    expect(Object.values(d).every((v) => typeof v === "boolean" || v === null)).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/rechightraining|"x"|"y"/);
  });

  it("observed_state nulo o inválido -> null", () => {
    expect(digestObservedState(null)).toBeNull();
    expect(digestObservedState([])).toBeNull();
  });
});
