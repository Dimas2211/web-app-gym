// ─────────────────────────────────────────────────────────────────
// GYM-5A — sesión y contexto operacional simulados para ejecutar las
// Server Actions REALES contra una base PostgreSQL desechable.
//
// Uso (en el test, antes de importar las acciones):
//   vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
//   vi.mock("next/navigation", async () => (await import("./testing/plan-action-mocks")).navigationMock());
//   vi.mock("@/lib/permissions/guards", async () => (await import("./testing/plan-action-mocks")).guardsMock());
//   vi.mock("@/modules/platform/runtime/require-operational-context", async () => (await import("./testing/plan-action-mocks")).operationalContextMock());
// ─────────────────────────────────────────────────────────────────

import { vi } from "vitest";
import type { FakeUser } from "./plan-it-harness";

export const planActionState = {
  user: null as null | FakeUser,
  /** Rol del JWT (puede diferir del LIVE para probar rol degradado). */
  jwtRole: null as null | string,
  db: null as unknown,
  readOnly: false,
  moduleDisabled: false,
  /** Módulos deshabilitados por código (p. ej. "gym.classes"). */
  disabledModules: new Set<string>(),
  runtimeMode: "RUNTIME_CLIENT" as string,
  /** users.branch_id vigente puede diferir de la sede del JWT: se simula con locationId. */
};

export function resetPlanActionState(user: FakeUser) {
  planActionState.user = user;
  planActionState.jwtRole = null;
  planActionState.readOnly = false;
  planActionState.moduleDisabled = false;
  planActionState.disabledModules = new Set();
  planActionState.runtimeMode = "RUNTIME_CLIENT";
}

function sessionUser() {
  const u = planActionState.user!;
  return {
    id: u.id,
    tenant_id: u.tenantId,
    location_id: u.locationId,
    role: planActionState.jwtRole ?? u.role,
    auth_scope: "RUNTIME_CLIENT",
  };
}

export function navigationMock() {
  return {
    redirect: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT:${to}`);
    }),
  };
}

export function guardsMock() {
  return {
    requireAdmin: vi.fn(async () => sessionUser()),
    requireClassViewer: vi.fn(async () => sessionUser()),
    requireClient: vi.fn(async () => sessionUser()),
    getSessionOrRedirect: vi.fn(async () => sessionUser()),
    canDeleteDirectly: vi.fn(() => true),
  };
}

export function operationalContextMock() {
  class OperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    OperationalContextError,
    requireOperationalContext: vi.fn(async (_s: unknown, opts: { module?: string; write?: boolean } = {}) => {
      const st = planActionState;
      if (opts.write && st.readOnly) throw new OperationalContextError("READ_ONLY", "Sesión de soporte de solo lectura.", 403);
      if (opts.module && (st.moduleDisabled || st.disabledModules.has(opts.module))) {
        throw new OperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 403);
      }
      const u = st.user!;
      return {
        context: {
          runtimeMode: st.runtimeMode,
          authScope: "RUNTIME_CLIENT",
          effectiveUser: { id: u.id, tenant_id: u.tenantId, location_id: u.locationId, role: u.role, auth_scope: "RUNTIME_CLIENT" },
          organizationId: null,
          tenantId: u.tenantId,
          gymId: u.tenantId,
          locationId: u.locationId,
          client: st.db,
          readOnly: st.readOnly,
          commercialContext: null,
        },
        dispose: async () => {},
      };
    }),
  };
}

/** Ejecuta una acción que termina en redirect(): devuelve undefined si redirigió. */
export async function runAction<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) return undefined;
    throw e;
  }
}

export function formData(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}
