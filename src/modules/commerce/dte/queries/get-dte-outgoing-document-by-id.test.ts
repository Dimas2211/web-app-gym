// ─────────────────────────────────────────────────────────────────
// commerce/dte/queries — get-dte-outgoing-document-by-id.test.ts
//
// FASE VI-E2A: certifica que un documento DTE de tenant B no puede
// leerse desde el runtime de tenant A — la query siempre filtra
// por `id + tenant_id`, nunca por `id` solo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { getDteOutgoingDocumentById } from "./get-dte-outgoing-document-by-id";

function fakeClient(rows: Array<{ id: string; tenant_id: string }>) {
  return {
    dteOutgoingDocument: {
      findFirst: vi.fn(({ where }: { where: { id: string; tenant_id: string } }) => {
        const row = rows.find((r) => r.id === where.id && r.tenant_id === where.tenant_id);
        return Promise.resolve(row ?? null);
      }),
    },
  } as never;
}

describe("getDteOutgoingDocumentById — aislamiento cross-tenant", () => {
  it("tenant A no puede leer un documento de tenant B (mismo id)", async () => {
    const client = fakeClient([{ id: "doc-1", tenant_id: "tenant-B" }]);

    const result = await getDteOutgoingDocumentById("doc-1", "tenant-A", client);

    expect(result).toBeNull();
  });

  it("tenant B sí puede leer su propio documento", async () => {
    const client = fakeClient([{ id: "doc-1", tenant_id: "tenant-B" }]);

    const result = await getDteOutgoingDocumentById("doc-1", "tenant-B", client);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("doc-1");
  });
});
