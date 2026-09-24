// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — create-supplier.schema.test.ts
//
// SHARED-PILOT-4C-C1 — id_type_code "36" (NIT) ofrecido por la UI debe
// ser aceptado por Zod (create y update), preservando la validación de
// formato NIT/DUI y el resto de códigos existentes.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { createSupplierSchema, idTypeCodeEnum } from "./create-supplier.schema";
import { updateSupplierSchema } from "./update-supplier.schema";

const BASE = {
  supplier_code: "PROV-NIT-001",
  name:          "Supplier Test NIT",
  taxpayer_type: "SMALL_TAXPAYER",
};

function fieldErrors(input: Record<string, unknown>) {
  const r = createSupplierSchema.safeParse(input);
  return r.success ? {} : r.error.flatten().fieldErrors;
}

describe("createSupplierSchema — id_type_code / NIT", () => {
  it("SMALL_TAXPAYER + id_type_code=36 + NIT válido → PASS", () => {
    const r = createSupplierSchema.safeParse({
      ...BASE,
      person_type:  "NATURAL_PERSON",
      id_type_code: "36",
      nit:          "0614-010268-009-9",
      nrc:          "160466-8",
    });
    expect(r.success).toBe(true);
  });

  it("id_type_code=36 + NIT mal formado → error solo en nit", () => {
    const errors = fieldErrors({ ...BASE, id_type_code: "36", nit: "06140102680099" });
    expect(errors.nit?.[0]).toBe("El NIT debe tener el formato 0000-000000-000-0.");
    expect(errors.id_type_code).toBeUndefined();
    expect(errors.taxpayer_type).toBeUndefined();
  });

  it("id_type_code=13 + DUI válido → PASS; DUI mal formado → error en dui", () => {
    expect(createSupplierSchema.safeParse({ ...BASE, id_type_code: "13", dui: "01234567-8" }).success).toBe(true);
    expect(fieldErrors({ ...BASE, id_type_code: "13", dui: "012345678" }).dui).toBeTruthy();
  });

  it.each(["02", "03", "13", "36", "37"])("id_type_code=%s aceptado (CAT-022 oficial)", (code) => {
    expect(idTypeCodeEnum.safeParse(code).success).toBe(true);
    expect(createSupplierSchema.safeParse({ ...BASE, id_type_code: code }).success).toBe(true);
  });

  it.each(["00", "99"])("id_type_code=%s rechazado (no pertenece a CAT-022)", (code) => {
    expect(fieldErrors({ ...BASE, id_type_code: code }).id_type_code?.[0]).toBe("Tipo de identificación inválido.");
  });

  it("id_type_code null (sin tipo) sigue aceptado", () => {
    expect(createSupplierSchema.safeParse({ ...BASE, id_type_code: null }).success).toBe(true);
  });

  it("taxpayer_type vacío sigue rechazado (select sin seleccionar)", () => {
    expect(fieldErrors({ ...BASE, taxpayer_type: "" }).taxpayer_type?.[0]).toBe("Tipo de contribuyente inválido.");
  });
});

describe("updateSupplierSchema — id_type_code=36", () => {
  const UPDATE_BASE = {
    id:            "7f1c1f0e-7a55-4c8e-9a0d-2f3b7a1f5e11",
    name:          "Supplier Test NIT",
    taxpayer_type: "SMALL_TAXPAYER",
  };

  it("acepta id_type_code=36 con NIT válido", () => {
    const r = updateSupplierSchema.safeParse({ ...UPDATE_BASE, id_type_code: "36", nit: "0614-010268-009-9" });
    expect(r.success).toBe(true);
  });

  it("id_type_code=36 + NIT mal formado → error en nit", () => {
    const r = updateSupplierSchema.safeParse({ ...UPDATE_BASE, id_type_code: "36", nit: "0614-01026-009-9" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.nit).toBeTruthy();
  });
});
