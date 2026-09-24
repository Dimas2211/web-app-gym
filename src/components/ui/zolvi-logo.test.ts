import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ZOLVI_BRAND } from "./zolvi-logo";

const root = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const BRAND_COLORS = ["#1c1953", "#40ace1", "#ec195a"];

describe("branding global Zolvi (SHARED-PILOT-4B.2)", () => {
  it("el asset oficial existe y usa la paleta del logo", () => {
    const svg = read(path.join("public", ZOLVI_BRAND.markSrc)).toLowerCase();
    for (const color of BRAND_COLORS) expect(svg).toContain(color);
  });

  it("globals.css centraliza los tokens de marca", () => {
    const css = read("src/app/globals.css").toLowerCase();
    expect(css).toContain("--color-brand-navy: #1c1953");
    expect(css).toContain("--color-brand-blue: #40ace1");
    expect(css).toContain("--color-brand-magenta: #ec195a");
  });

  it("login, dashboard y portal muestran el logo Zolvi sin marca GYM", () => {
    const files = [
      "src/app/(auth)/login/page.tsx",
      "src/app/(dashboard)/layout.tsx",
      "src/app/(portal)/layout.tsx",
    ];
    for (const file of files) {
      const src = read(file);
      expect(src).toMatch(/Zolvi(Mark|Logo)/);
      expect(src).not.toMatch(/Sistema GYM/i);
      expect(src).not.toMatch(/>\s*GYM\s*</);
    }
  });

  it("el branding es global: no depende de hostname ni tenant", () => {
    const src = read("src/components/ui/zolvi-logo.tsx");
    expect(src).not.toMatch(/hostname|headers\(|tenant_id|location_id/);
  });
});
