import { describe, expect, it } from "vitest";
import { localDateString } from "./today-summary";

describe("localDateString", () => {
  it("usa el día calendario de El Salvador, no el UTC del servidor", () => {
    // 2026-11-10 03:00 UTC = 2026-11-09 21:00 en El Salvador (UTC-6)
    expect(localDateString("America/El_Salvador", new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-09");
    expect(localDateString("America/El_Salvador", new Date("2026-11-10T07:00:00Z"))).toBe("2026-11-10");
  });
});
