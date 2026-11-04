import { describe, it, expect } from "vitest";
import {
  buildDteJsonFileName,
  serializeDteJsonDocument,
  buildDteExternalJsonFileName,
  serializeExternalDtePayloadForInsert,
} from "./dte-json-file.utils";

describe("buildDteJsonFileName", () => {
  it("formato DTE_{tipo}_{codigoGeneracion}.json", () => {
    expect(buildDteJsonFileName({
      dte_type_code: "01", generation_code: "CB09D13B-EFB3-40C5-933C-41E7C1C9606D", id: "x",
    })).toBe("DTE_01_CB09D13B-EFB3-40C5-933C-41E7C1C9606D.json");
  });

  it("normaliza a mayúsculas y elimina caracteres no seguros para cabeceras", () => {
    expect(buildDteJsonFileName({ dte_type_code: "14", generation_code: 'ab"c/d\\e;f', id: "x" }))
      .toBe("DTE_14_ABCDEF.json");
  });

  it("sin código de generación usa el id interno", () => {
    expect(buildDteJsonFileName({ dte_type_code: "05", generation_code: null, id: "cmabc123" }))
      .toBe("DTE_05_cmabc123.json");
  });
});

describe("serializeDteJsonDocument", () => {
  it("solo formatea: el round-trip conserva valores, tipos y nulos", () => {
    const json = { a: 1, b: 0.01, c: null, d: [1, "x", { e: false }], f: "ñ" };
    expect(JSON.parse(serializeDteJsonDocument(json))).toEqual(json);
  });
});

describe("buildDteExternalJsonFileName / serializeExternalDtePayloadForInsert", () => {
  it("DTE_COMPLETO_{codigoGeneracion}.json", () => {
    expect(buildDteExternalJsonFileName({ generation_code: "cb09d13b-efb3-40c5-933c-41e7c1c9606d", id: "x" }))
      .toBe("DTE_COMPLETO_CB09D13B-EFB3-40C5-933C-41E7C1C9606D.json");
    expect(buildDteExternalJsonFileName({ generation_code: null, id: "cm1" })).toBe("DTE_COMPLETO_cm1.json");
  });
  it("serialización compacta igual a JSON.stringify (forma del INSERT)", () => {
    const p = { a: 1, token: "x.y.z", responseMH: { observaciones: [] } };
    expect(serializeExternalDtePayloadForInsert(p)).toBe(JSON.stringify(p));
  });
});
