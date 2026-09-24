// ─────────────────────────────────────────────────────────────────
// platform — platform-shared-target-organizations-table.test.ts
//
// SHARED-OPS-PARITY-1 — UI Shared Runtime Targets:
// - Target con 2 organizaciones: se muestran por separado.
// - Cada "Data onboarding" y "Operar como cliente" lleva el organizationId
//   de SU fila; "Baseline Commerce" también.
// - La fila del target (base física) no tiene "Operar como cliente" ni
//   Data Onboarding sin organización.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("../actions/enter-organization-runtime.action", () => ({
  enterOrganizationRuntimeAction: function enterOrganizationRuntimeAction() {},
}));
vi.mock("../actions/set-shared-runtime-target-active.action", () => ({ setSharedRuntimeTargetActiveAction: vi.fn() }));
vi.mock("../actions/test-shared-runtime-target-connection.action", () => ({ testSharedRuntimeTargetConnectionAction: vi.fn() }));
vi.mock("./ensure-organization-baseline-button", () => ({
  EnsureOrganizationBaselineButton: function EnsureOrganizationBaselineButton() { return null; },
}));

import { PlatformSharedTargetOrganizationsTable } from "./platform-shared-target-organizations-table";
import { PlatformSharedRuntimeTargetsTable } from "./platform-shared-runtime-targets-table";
import { enterOrganizationRuntimeAction } from "../actions/enter-organization-runtime.action";
import { EnsureOrganizationBaselineButton } from "./ensure-organization-baseline-button";
import type {
  PlatformSharedRuntimeTargetItem,
  SharedRuntimeTargetOrganizationItem,
} from "../queries/list-shared-runtime-targets";

type AnyEl = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

/** Recorre el árbol expandiendo componentes función locales (sin hooks). */
function collect(node: ReactNode, pred: (el: AnyEl) => boolean, out: AnyEl[] = [], expand = new Set<unknown>()): AnyEl[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, pred, out, expand));
    return out;
  }
  const el = node as AnyEl;
  if (pred(el)) out.push(el);
  if (typeof el.type === "function" && expand.has(el.type)) {
    collect((el.type as (p: unknown) => ReactNode)(el.props), pred, out, expand);
  }
  collect(el.props?.children, pred, out, expand);
  return out;
}

const ORGS: SharedRuntimeTargetOrganizationItem[] = [
  { id: "org-a", code: "commerce-pilot-0001", name: "Zolvi Commerce Pilot", tenant_id: "TENANT_A", status: "ACTIVE", provisioning_status: "PROVISIONED", domain: "commerce-pilot.getzolvi.com" },
  { id: "org-b", code: "other-0002", name: "Otra", tenant_id: "TENANT_B", status: "ACTIVE", provisioning_status: "PROVISIONED", domain: null },
];

function rowsOf(tree: ReactNode) {
  return collect(tree, (el) => el.type === "tr" && typeof el.props["data-organization-id"] === "string");
}

describe("PlatformSharedTargetOrganizationsTable", () => {
  const tree = PlatformSharedTargetOrganizationsTable({ organizations: ORGS });

  it("muestra ambas organizaciones por separado", () => {
    expect(rowsOf(tree).map((r) => r.props["data-organization-id"])).toEqual(["org-a", "org-b"]);
  });

  it("cada fila: Data onboarding, Operar como cliente y Baseline llevan SU organizationId", () => {
    for (const row of rowsOf(tree)) {
      const orgId = row.props["data-organization-id"] as string;

      const links = collect(row, (el) => typeof el.props?.href === "string");
      expect(links.map((l) => l.props.href)).toEqual([`/dashboard/platform/data-onboarding/org/${orgId}`]);

      const forms = collect(row, (el) => el.type === "form");
      expect(forms).toHaveLength(1);
      expect(forms[0].props.action).toBe(enterOrganizationRuntimeAction);
      const hidden = collect(forms[0], (el) => el.type === "input" && el.props.name === "organizationId");
      expect(hidden.map((h) => h.props.value)).toEqual([orgId]);

      const baseline = collect(row, (el) => el.type === EnsureOrganizationBaselineButton);
      expect(baseline).toHaveLength(1);
      expect(baseline[0].props.organizationId).toBe(orgId);
    }
  });

  it("organización sin tenant → acciones deshabilitadas, sin link de onboarding", () => {
    const t = PlatformSharedTargetOrganizationsTable({
      organizations: [{ ...ORGS[0], id: "org-n", tenant_id: null }],
    });
    expect(collect(t, (el) => typeof el.props?.href === "string")).toHaveLength(0);
    const submit = collect(t, (el) => el.type === "button" && el.props.type === "submit");
    expect(submit[0].props.disabled).toBe(true);
    expect(collect(t, (el) => el.type === EnsureOrganizationBaselineButton)[0].props.disabled).toBe(true);
  });
});

describe("PlatformSharedRuntimeTargetsTable — separación base física / organización", () => {
  const target: PlatformSharedRuntimeTargetItem = {
    id: "target-1", label: "Zolvi Shared 01", environment: "PRODUCTION", provider: "SUPABASE",
    db_host: "h", db_port: 5432, db_name: "d", db_user: "u", ssl_mode: "REQUIRE", is_active: true,
    last_tested_at: null, last_test_status: "SUCCESS", last_test_message: null,
    organizationCount: 2, organizations: ORGS, created_at: new Date(), updated_at: new Date(),
  };
  const baseProps = {
    items: [target], testingId: null, togglingId: null,
    onEdit: vi.fn(), onToggleActive: vi.fn(), onTest: vi.fn(), onToggleOrganizations: vi.fn(),
  };

  it("colapsada: la fila del target no tiene Operar como cliente ni Data onboarding", () => {
    const tree = PlatformSharedRuntimeTargetsTable({ ...baseProps, expandedId: null });
    expect(collect(tree, (el) => el.type === "form")).toHaveLength(0);
    expect(collect(tree, (el) => typeof el.props?.href === "string")).toHaveLength(0);
    expect(collect(tree, (el) => el.type === PlatformSharedTargetOrganizationsTable)).toHaveLength(0);
  });

  it("expandida: renderiza la subtabla con las organizaciones del target", () => {
    const tree = PlatformSharedRuntimeTargetsTable({ ...baseProps, expandedId: "target-1" });
    const sub = collect(tree, (el) => el.type === PlatformSharedTargetOrganizationsTable);
    expect(sub).toHaveLength(1);
    expect(sub[0].props.organizations).toBe(ORGS);
    // Todas las acciones tenant-scoped vienen de la subtabla (una por organización)
    const forms = collect(tree, (el) => el.type === "form", [], new Set([PlatformSharedTargetOrganizationsTable]));
    expect(forms).toHaveLength(2);
  });
});
