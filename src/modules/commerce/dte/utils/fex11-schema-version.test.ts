import { describe, it, expect } from "vitest";
import {
  FEX11_SCHEMA_VERSION,
  fex11LegacyVersionError,
  readDteJsonIdentificacionVersion,
} from "./fex11-schema-version";

describe("fex11-schema-version", () => {
  it("la versión de producto es 3", () => {
    expect(FEX11_SCHEMA_VERSION).toBe(3);
  });

  it("lee identificacion.version desde objeto o string", () => {
    expect(readDteJsonIdentificacionVersion({ identificacion: { version: 3 } })).toBe(3);
    expect(readDteJsonIdentificacionVersion(JSON.stringify({ identificacion: { version: 1 } }))).toBe(1);
    expect(readDteJsonIdentificacionVersion("no-json")).toBeNull();
    expect(readDteJsonIdentificacionVersion(null)).toBeNull();
    expect(readDteJsonIdentificacionVersion({ identificacion: {} })).toBeNull();
  });

  it("solo JSON v3 pasa la guardia de firma/transmisión", () => {
    expect(fex11LegacyVersionError({ identificacion: { version: 3 } })).toBeNull();
    expect(fex11LegacyVersionError({ identificacion: { version: 1 } })).toContain("versión de schema 1");
    expect(fex11LegacyVersionError(null)).toContain("desconocida");
  });
});
