// ─────────────────────────────────────────────────────────────────
// platform/actions — update-platform-plan.action.test.ts
//
// FASE V-C — `code` editable en PlatformPlan:
// - schema update acepta/normaliza/rechaza code igual que create;
// - guardar el mismo code es válido; cambiar a uno libre también;
// - colisión con OTRO plan → error controlado, sin escribir nada;
// - el update es siempre `where: { id }` y todas las relaciones
//   (módulos/entitlements) se reescriben con el MISMO plan_id; nunca se
//   crea/borra el plan ni se tocan organizaciones.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "super_admin" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const planFindUniqueMock = vi.fn();
const planFindFirstMock  = vi.fn();
const defsFindManyMock   = vi.fn();
const tx = {
  platformPlan:            { update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  platformPlanModule:      { deleteMany: vi.fn(), createMany: vi.fn() },
  platformPlanEntitlement: { deleteMany: vi.fn(), createMany: vi.fn() },
  platformOrganization:    { update: vi.fn(), updateMany: vi.fn() },
};
const transactionMock = vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformPlan: {
      findUnique: (...a: unknown[]) => planFindUniqueMock(...a),
      findFirst:  (...a: unknown[]) => planFindFirstMock(...a),
    },
    platformEntitlementDefinition: { findMany: (...a: unknown[]) => defsFindManyMock(...a) },
    $transaction: (cb: (t: typeof tx) => unknown) => transactionMock(cb),
  },
}));

import { updatePlatformPlanAction } from "./update-platform-plan.action";
import { updatePlatformPlanSchema } from "../schemas/update-platform-plan.schema";

const PLAN_A = "11111111-1111-4111-8111-111111111111";
const PLAN_B = "22222222-2222-4222-8222-222222222222";

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function planForm(overrides: Record<string, string> = {}): FormData {
  return formDataOf({
    id:                PLAN_A,
    code:              "starter",
    name:              "Starter",
    billing_cycle:     "MONTHLY",
    price_monthly:     "7",
    price_annual:      "70",
    modules_json:      JSON.stringify([{ module_id: "mod-dte", is_enabled: true }]),
    entitlements_json: JSON.stringify([{ entitlement_definition_id: "def-dte", numeric_value: 50, is_unlimited: false }]),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  planFindUniqueMock.mockResolvedValue({ id: PLAN_A });
  planFindFirstMock.mockResolvedValue(null);
  defsFindManyMock.mockResolvedValue([]);
});

describe("updatePlatformPlanSchema — code", () => {
  const base = { id: PLAN_A };

  it("acepta code válido y lo normaliza (trim + lowercase)", () => {
    const r = updatePlatformPlanSchema.safeParse({ ...base, code: "  Growth " });
    expect(r.success).toBe(true);
    expect(r.success && r.data.code).toBe("growth");
  });

  it.each([
    ["vacío", ""],
    ["menos de 2", "g"],
    ["más de 60", "x".repeat(61)],
  ])("rechaza code %s", (_label, code) => {
    const r = updatePlatformPlanSchema.safeParse({ ...base, code });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.flatten().fieldErrors.code?.length).toBeGreaterThan(0);
  });

  it("rechaza code ausente (el form de edición siempre lo envía)", () => {
    expect(updatePlatformPlanSchema.safeParse(base).success).toBe(false);
  });
});

describe("updatePlatformPlanAction — code editable", () => {
  it("guardar el MISMO code es válido (unicidad excluye el propio plan)", async () => {
    const result = await updatePlatformPlanAction(undefined, planForm({ code: "starter" }));

    expect(result).toBeUndefined();
    expect(planFindFirstMock).toHaveBeenCalledWith({
      where:  { code: "starter", NOT: { id: PLAN_A } },
      select: { id: true },
    });
    expect(tx.platformPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PLAN_A }, data: expect.objectContaining({ code: "starter" }) }),
    );
  });

  it("cambia a un code libre (enterprise → starter) actualizando por id", async () => {
    const result = await updatePlatformPlanAction(undefined, planForm({ code: "Starter" }));

    expect(result).toBeUndefined();
    const call = tx.platformPlan.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: PLAN_A });
    expect(call.data.code).toBe("starter");
  });

  it("colisión con OTRO plan → error controlado y cero writes", async () => {
    planFindFirstMock.mockResolvedValue({ id: PLAN_B });

    const result = await updatePlatformPlanAction(undefined, planForm({ code: "growth" }));

    expect(result?.errors?.code?.[0]).toBe('Ya existe otro plan con el código "growth".');
    expect(transactionMock).not.toHaveBeenCalled();
    expect(tx.platformPlan.update).not.toHaveBeenCalled();
  });

  it("carrera: P2002 sobre code se traduce a error de campo sin filtrar detalles", async () => {
    tx.platformPlan.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002", clientVersion: "test", meta: { target: ["code"] },
      }),
    );

    const result = await updatePlatformPlanAction(undefined, planForm({ code: "growth" }));

    expect(result).toEqual({ errors: { code: ['Ya existe otro plan con el código "growth".'] } });
  });

  it("P2002 ajeno a code (p.ej. plan_modules) no se enmascara como colisión de code", async () => {
    tx.platformPlanModule.createMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002", clientVersion: "test", meta: { target: ["plan_id", "module_id"] },
      }),
    );

    await expect(updatePlatformPlanAction(undefined, planForm())).rejects.toThrow();
  });

  it("plan inexistente → 'Plan no encontrado.' sin writes", async () => {
    planFindUniqueMock.mockResolvedValue(null);

    const result = await updatePlatformPlanAction(undefined, planForm());

    expect(result).toEqual({ error: "Plan no encontrado." });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("cambiar code preserva identidad y relaciones: mismo id, mismo name, mismo plan_id; sin crear/borrar plan ni tocar organizaciones", async () => {
    await updatePlatformPlanAction(undefined, planForm({ code: "growth", name: "Growth" }));

    const call = tx.platformPlan.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: PLAN_A });
    expect(call.data).not.toHaveProperty("id");
    expect(call.data.name).toBe("Growth");
    expect(call.data.code).toBe("growth");

    expect(tx.platformPlanModule.deleteMany).toHaveBeenCalledWith({ where: { plan_id: PLAN_A } });
    expect(tx.platformPlanModule.createMany.mock.calls[0][0].data).toEqual([
      { plan_id: PLAN_A, module_id: "mod-dte", is_enabled: true },
    ]);
    expect(tx.platformPlanEntitlement.deleteMany).toHaveBeenCalledWith({ where: { plan_id: PLAN_A } });
    expect(tx.platformPlanEntitlement.createMany.mock.calls[0][0].data).toEqual([
      { plan_id: PLAN_A, entitlement_definition_id: "def-dte", numeric_value: 50, is_unlimited: false },
    ]);

    expect(tx.platformPlan.create).not.toHaveBeenCalled();
    expect(tx.platformPlan.delete).not.toHaveBeenCalled();
    expect(tx.platformOrganization.update).not.toHaveBeenCalled();
    expect(tx.platformOrganization.updateMany).not.toHaveBeenCalled();
  });
});
