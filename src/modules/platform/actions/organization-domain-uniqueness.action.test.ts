// ─────────────────────────────────────────────────────────────────
// platform/actions — organization-domain-uniqueness.action.test.ts
//
// SHARED-PILOT-4A / Gap F. Cubre el guard explícito de unicidad de
// domain agregado a create/update-platform-organization.action.ts
// (equivalente al guard preexistente de `code`), previo a la
// constraint de BD.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "super_admin" }),
}));

const orgFindUniqueMock = vi.fn();
const orgFindFirstMock  = vi.fn();
const orgTransactionMock = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    platformOrganization:  { create: vi.fn().mockResolvedValue({ id: "org-new", name: "Nueva" }) },
    platformBranding:      { create: vi.fn() },
    platformDeploymentLog: { create: vi.fn() },
  }),
);
const orgUpdateMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformOrganization: {
      findUnique:   (...a: unknown[]) => orgFindUniqueMock(...a),
      findFirst:    (...a: unknown[]) => orgFindFirstMock(...a),
      update:       (...a: unknown[]) => orgUpdateMock(...a),
    },
    $transaction: (cb: (tx: unknown) => unknown) => orgTransactionMock(cb),
  },
}));

import { createPlatformOrganizationAction } from "./create-platform-organization.action";
import { updatePlatformOrganizationAction } from "./update-platform-organization.action";

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPlatformOrganizationAction — unicidad de domain", () => {
  it("rechaza si ya existe otra organización con el mismo domain", async () => {
    orgFindUniqueMock.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ("code" in where) return Promise.resolve(null); // code libre
      if ("domain" in where) return Promise.resolve({ id: "org-existente" }); // domain tomado
      return Promise.resolve(null);
    });

    const result = await createPlatformOrganizationAction(
      undefined,
      formDataOf({ code: "cliente-2", name: "Cliente 2", domain: "cliente.getzolvi.com" }),
    );

    expect(result?.errors?.domain?.[0]).toMatch(/ya existe una organización con este dominio/i);
    expect(orgTransactionMock).not.toHaveBeenCalled();
  });

  it("permite crear si el domain está libre (o vacío)", async () => {
    orgFindUniqueMock.mockResolvedValue(null);

    const result = await createPlatformOrganizationAction(
      undefined,
      formDataOf({ code: "cliente-3", name: "Cliente 3", domain: "cliente3.getzolvi.com" }),
    );

    expect(result).toBeUndefined();
    expect(orgTransactionMock).toHaveBeenCalledTimes(1);
  });
});

const ORG_ID = "11111111-1111-1111-1111-111111111111";

describe("updatePlatformOrganizationAction — unicidad de domain", () => {
  it("rechaza si OTRA organización ya tiene ese domain", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: ORG_ID }); // exists check
    orgFindFirstMock.mockResolvedValue({ id: "org-otra" }); // domain tomado por otra

    const result = await updatePlatformOrganizationAction(
      undefined,
      formDataOf({ id: ORG_ID, domain: "compartido.getzolvi.com" }),
    );

    expect(result?.errors?.domain?.[0]).toMatch(/ya existe otra organización con este dominio/i);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it("permite actualizar cuando el domain es el mismo que ya tenía la propia organización", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: ORG_ID });
    orgFindFirstMock.mockResolvedValue(null); // excluyendo la propia org, nadie más lo tiene

    const result = await updatePlatformOrganizationAction(
      undefined,
      formDataOf({ id: ORG_ID, domain: "cliente.getzolvi.com" }),
    );

    expect(result).toBeUndefined();
    expect(orgUpdateMock).toHaveBeenCalledTimes(1);
  });
});
