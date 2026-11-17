// DTE-MH-TEST-RUNS — actor runtime de las pruebas preparadas desde el Control Plane.
//   - El usuario de plataforma NO necesita existir en la base runtime del cliente
//     (runtime SHARED): el preflight no lo bloquea.
//   - Actor runtime = el mismo id si existe en el tenant; si no, null (mismo
//     mecanismo que el registro de credenciales del onboarding).
//   - Guardia de schema: las columnas donde los servicios DTE escriben el actor
//     deben seguir siendo nullables; si alguna se vuelve obligatoria, null dejaría
//     de ser válido y esta prueba falla antes que producción.

import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("@/modules/commerce/dte/services/dte-credential.service", () => ({
  getDteCredentialStatus: vi.fn(async () => ({ configured: true, is_active: true, has_api_user: true, has_api_password: true, secret_collisions: [] })),
  resolveDteSignerConfigForIssuer: vi.fn(async () => ({ ok: true, source: "ISSUER_CREDENTIAL" })),
}));

import { resolveMhTestRuntimeActor, runMhTestPreflight } from "./mh-test-run.runtime-port";

function fakeDb(users: Array<{ id: string; tenant_id: string }>) {
  return {
    user: { findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => users.find((u) => u.id === where.id && u.tenant_id === where.tenant_id) ?? null) },
    dteIssuerConfig: { findFirst: vi.fn(async () => ({ environment: "TEST", cod_estable_mh: "M001", cod_punto_venta_mh: "P001" })) },
  } as unknown as PrismaClient;
}
const scope = { organizationId: "org-1", tenantId: "t-1", locationId: "l-1", issuerConfigId: "iss-1", userId: "platform-admin" };

describe("actor runtime de las pruebas MH TEST", () => {
  it("preflight pasa aunque el usuario de plataforma no exista en el runtime (runtime compartido)", async () => {
    const r = await runMhTestPreflight(fakeDb([]), scope);
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it("actor = mismo id si existe en el tenant; null si no existe o es de otro tenant", async () => {
    expect(await resolveMhTestRuntimeActor(fakeDb([{ id: "platform-admin", tenant_id: "t-1" }]), scope)).toBe("platform-admin");
    expect(await resolveMhTestRuntimeActor(fakeDb([]), scope)).toBeNull();
    expect(await resolveMhTestRuntimeActor(fakeDb([{ id: "platform-admin", tenant_id: "otro" }]), scope)).toBeNull();
    expect(await resolveMhTestRuntimeActor(fakeDb([]), { ...scope, userId: "" })).toBeNull();
  });

  it("las columnas de auditoría que reciben el actor son nullables en el schema", () => {
    const dm = Prisma.dmmf.datamodel;
    const cols: Record<string, string[]> = {
      DteOutgoingDocument:          ["created_by", "updated_by"],
      DteInvalidationEvent:         ["requested_by"],
      DteContingencyEvent:          ["requested_by"],
      DteDocumentRelation:          ["created_by"],
      DteFiscalMeteringReservation: ["created_by"],
    };
    for (const [model, fields] of Object.entries(cols)) {
      const m = dm.models.find((x) => x.name === model);
      expect(m, model).toBeDefined();
      for (const f of fields) expect(m!.fields.find((x) => x.name === f)?.isRequired, `${model}.${f}`).toBe(false);
    }
  });
});
