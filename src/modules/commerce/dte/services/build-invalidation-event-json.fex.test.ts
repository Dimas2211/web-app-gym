import { describe, expect, it } from "vitest";
import { buildInvalidationEventJson } from "./build-invalidation-event-json.service";
import { buildFexJsonFromLoadedData } from "./generate-fex-json.service";
import { makeFexV3LoadedData } from "./fex11-v3.test-fixture";

// Exercise the real FEX v3 -> MH invalidation v2 builders, including AJV.
describe("invalidación de FEX 11", () => {
  it("construye un evento tipo 2 con receptor extranjero e IVA cero conforme al schema MH", () => {
    const loaded = makeFexV3LoadedData();
    const fex = buildFexJsonFromLoadedData(loaded);
    expect(fex.ok).toBe(true);
    if (!fex.ok) return;
    const persona = { nombre: "Responsable de prueba", tipoDocumento: "13", numeroDocumento: "12345678-9" };
    const result = buildInvalidationEventJson({
      issuerConfig: {
        nit: "06141234567890", name: "Emisor de prueba", legal_name: "Emisor de prueba",
        establishment_type_code: "01", establishment_code: "M001", cod_estable_mh: "M001",
        point_of_sale_code: "P001", cod_punto_venta_mh: "P001", phone: "22223333",
        email: "prueba@example.com", environment: "TEST",
      },
      dteDocument: {
        dte_type_code: "11", dte_status: "ACCEPTED",
        generation_code: fex.json.identificacion.codigoGeneracion,
        control_number: fex.json.identificacion.numeroControl, reception_stamp: "A".repeat(40),
      },
      originalJsonDocument: fex.json,
      eventGenerationCode: "A1234567-1234-1234-1234-123456789ABC",
      invalidationTypeCode: "2", reason: "Prueba de invalidación de exportación",
      responsable: persona, solicita: persona, now: new Date("2026-11-11T22:30:00Z"),
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.eventJson.documento).toMatchObject({ tipoDte: "11", montoIva: 0, codigoGeneracionR: null });
  });
});
