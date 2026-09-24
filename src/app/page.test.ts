import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { redirect } from "next/navigation";
import Home from "./page";

describe("root entrypoint /", () => {
  it("redirige server-side a /login", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("no contiene branding GYM ni es client component", () => {
    const src = readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");
    expect(src).not.toMatch(/Sistema GYM/i);
    expect(src).not.toMatch(/["']use client["']/);
  });
});
