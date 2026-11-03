import { describe, expect, it } from "vitest";
import { normalizeProductAvailabilityFormData } from "./product-availability-form-data";

describe("normalizeProductAvailabilityFormData", () => {
  it("mantiene true cuando ambas casillas están marcadas", () => {
    const formData = new FormData();
    formData.set("allow_sale", "true");
    formData.set("allow_purchase", "true");
    normalizeProductAvailabilityFormData(formData);
    expect(formData.get("allow_sale")).toBe("true");
    expect(formData.get("allow_purchase")).toBe("true");
  });

  it("registra false cuando se desmarca venta y conserva compra", () => {
    const formData = new FormData();
    formData.set("allow_purchase", "true");
    formData.set("name", "CAFE");
    normalizeProductAvailabilityFormData(formData);
    expect(formData.get("allow_sale")).toBe("false");
    expect(formData.get("allow_purchase")).toBe("true");
    expect(formData.get("name")).toBe("CAFE");
  });

  it("registra false cuando se desmarcan ambas casillas", () => {
    const formData = new FormData();
    normalizeProductAvailabilityFormData(formData);
    expect(formData.get("allow_sale")).toBe("false");
    expect(formData.get("allow_purchase")).toBe("false");
  });
});
