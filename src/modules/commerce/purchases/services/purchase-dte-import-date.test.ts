import { describe, expect, it } from "vitest";
import { extractDteMetadata } from "./purchase-dte-import.service";
import { businessDateKey } from "@/lib/utils/business-date";

describe("fecha y hora de emisión importadas", () => {
  it("interpreta horEmi en El Salvador incluso cuando el instante UTC pasa al siguiente día", () => {
    const metadata = extractDteMetadata({ identificacion: { fecEmi: "2026-11-16", horEmi: "23:30:00" } });
    expect(metadata.issued_at).toBe("2026-11-17T05:30:00.000Z");
    expect(businessDateKey(metadata.issued_at!)).toBe("2026-11-16");
  });
  it("conserva el día de emisión cuando solo hay fecha", () => {
    const metadata = extractDteMetadata({ identificacion: { fecEmi: "2026-11-04" } });
    expect(metadata.issued_at).toBe("2026-11-04T06:00:00.000Z");
  });
});
