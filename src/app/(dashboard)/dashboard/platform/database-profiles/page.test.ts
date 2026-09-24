// ─────────────────────────────────────────────────────────────────
// platform — database-profiles/page.test.ts
//
// SHARED-PILOT-4C-B0. Verifica que la página compone las dos secciones
// independientes: Shared Runtime Targets y perfiles Dedicated, sin
// regresión en las props que recibe PlatformDatabaseProfilesClient.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";

const requireSuperAdminMock = vi.fn();
vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdminMock(...args),
}));

const queries = vi.hoisted(() => ({
  orgs:     vi.fn(),
  profiles: vi.fn(),
  shared:   vi.fn(),
}));
vi.mock("@/modules/platform/queries/list-platform-organizations", () => ({
  listPlatformOrganizationsQuery: queries.orgs,
}));
vi.mock("@/modules/platform/queries/list-database-profiles", () => ({
  listDatabaseProfiles: queries.profiles,
}));
vi.mock("@/modules/platform/queries/list-shared-runtime-targets", () => ({
  listSharedRuntimeTargets: queries.shared,
}));

// Componentes cliente sustituidos por marcadores — se inspeccionan props
vi.mock("@/modules/platform/components/platform-database-profiles-client", () => ({
  PlatformDatabaseProfilesClient: function PlatformDatabaseProfilesClient() { return null; },
}));
vi.mock("@/modules/platform/components/platform-shared-runtime-targets-panel", () => ({
  PlatformSharedRuntimeTargetsPanel: function PlatformSharedRuntimeTargetsPanel() { return null; },
}));

import PlatformDatabaseProfilesPage from "./page";
import { PlatformDatabaseProfilesClient } from "@/modules/platform/components/platform-database-profiles-client";
import { PlatformSharedRuntimeTargetsPanel } from "@/modules/platform/components/platform-shared-runtime-targets-panel";

function findByType(node: ReactNode, type: unknown): ReactElement | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type === type) return el;
  return findByType(el.props?.children, type);
}

const DEDICATED_PROFILES = [
  { id: "p-trustme", label: "TRUST ME", organization_id: "org-1" },
  { id: "p-gym",     label: "GymSystem Supabase Producción", organization_id: "org-2" },
];
const SHARED_TARGETS = [
  { id: "t-1", label: "Shared A", organizationCount: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdminMock.mockResolvedValue({ id: "super-admin-1" });
  queries.profiles.mockResolvedValue(DEDICATED_PROFILES);
  queries.shared.mockResolvedValue(SHARED_TARGETS);
});

async function renderPage() {
  return PlatformDatabaseProfilesPage({ searchParams: Promise.resolve({}) });
}

describe("PlatformDatabaseProfilesPage", () => {
  it("perfiles Dedicated siguen llegando al client sin cambios", async () => {
    queries.orgs.mockResolvedValue({
      items: [
        { id: "org-1", code: "TRUSTME", name: "TRUST ME", extra: "x" },
        { id: "org-2", code: "GYM",     name: "GymSystem" },
      ],
    });

    const tree = await renderPage();
    const dedicated = findByType(tree, PlatformDatabaseProfilesClient);

    expect(requireSuperAdminMock).toHaveBeenCalledOnce();
    expect(dedicated).not.toBeNull();
    const props = dedicated!.props as Record<string, unknown>;
    expect(props.profiles).toBe(DEDICATED_PROFILES);
    expect(props.organizations).toEqual([
      { id: "org-1", code: "TRUSTME", name: "TRUST ME" },
      { id: "org-2", code: "GYM",     name: "GymSystem" },
    ]);
    expect(queries.profiles).toHaveBeenCalledWith({});
  });

  it("carga Shared targets con listSharedRuntimeTargets({}) en panel propio", async () => {
    queries.orgs.mockResolvedValue({ items: [{ id: "org-1", code: "A", name: "A" }] });

    const tree = await renderPage();
    const shared = findByType(tree, PlatformSharedRuntimeTargetsPanel);

    expect(queries.shared).toHaveBeenCalledWith({});
    expect(shared).not.toBeNull();
    expect((shared!.props as Record<string, unknown>).targets).toBe(SHARED_TARGETS);
  });

  it("sin organizaciones: Shared targets siguen visibles", async () => {
    queries.orgs.mockResolvedValue({ items: [] });

    const tree = await renderPage();
    const shared = findByType(tree, PlatformSharedRuntimeTargetsPanel);
    const dedicated = findByType(tree, PlatformDatabaseProfilesClient);

    expect((shared!.props as Record<string, unknown>).targets).toBe(SHARED_TARGETS);
    // Comportamiento Dedicated previo preservado
    expect((dedicated!.props as Record<string, unknown>).profiles).toEqual([]);
  });
});
