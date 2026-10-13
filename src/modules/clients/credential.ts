/**
 * clients — credential.ts (GYM)
 *
 * Carga de datos de la credencial de un Client para la pantalla de gestión
 * (/dashboard/clients/[id]/credential) y la vista de impresión CR80
 * (/dashboard/clients/[id]/credential/print). Una sola fuente de scope:
 *
 *   - DB y tenant EFECTIVOS (requireOperationalContext, lectura)
 *   - Client por id + context.tenantId
 *   - canManageClient con identidad efectiva (rol LIVE en RUNTIME_CLIENT)
 *   - canEdit = false bajo Support Session (siempre solo lectura)
 *
 * Nunca devuelve el Client si el solicitante no está en scope (fail closed
 * como "not_found", sin revelar existencia).
 */
if (typeof window !== "undefined") {
  throw new Error("[clients/credential] Módulo server-only.");
}

import type { Status, UserRole } from "@prisma/client";
import { canManageClient, type SessionUser } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import type { RuntimeMode } from "@/modules/platform/runtime/effective-tenant-context";
import { suggestNextClientCode } from "@/lib/utils/operational-codes";

export interface ClientCredentialData {
  client: {
    id: string;
    first_name: string;
    last_name: string;
    operational_code: string | null;
    avatar_url: string | null;
    qr_token: string | null;
    status: Status;
    branchName: string;
  };
  gym: { name: string; logo_url: string | null } | null;
  tenantId: string;
  runtimeMode: RuntimeMode;
  /** false bajo Support Session — ninguna escritura permitida. */
  canEdit: boolean;
  /** Sugerencia de código (vacía si !canEdit). */
  suggestedCode: string;
}

export type ClientCredentialResult =
  | { ok: true; data: ClientCredentialData }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "unavailable"; message: string };

export async function loadClientCredential(
  sessionUser: SessionUser,
  clientId: string,
  options: { withSuggestedCode?: boolean } = {},
): Promise<ClientCredentialResult> {
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser);
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return { ok: false, reason: "unavailable", message: err.userMessage };
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const client = await context.client.client.findFirst({
      where: { id: clientId, tenant_id: context.tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        operational_code: true,
        avatar_url: true,
        qr_token: true,
        status: true,
        branch_id: true,
        branch: { select: { name: true } },
      },
    });
    if (!client) return { ok: false, reason: "not_found" };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    } as SessionUser;
    if (!canManageClient(effectiveSessionUser, client)) return { ok: false, reason: "not_found" };

    const canEdit = !context.readOnly;
    const [gym, suggestedCode] = await Promise.all([
      context.client.gym.findUnique({
        where: { tenant_id: context.tenantId },
        select: { name: true, logo_url: true },
      }),
      canEdit && options.withSuggestedCode
        ? suggestNextClientCode(context.tenantId, context.client)
        : Promise.resolve(""),
    ]);

    return {
      ok: true,
      data: {
        client: {
          id: client.id,
          first_name: client.first_name,
          last_name: client.last_name,
          operational_code: client.operational_code,
          avatar_url: client.avatar_url,
          qr_token: client.qr_token,
          status: client.status,
          branchName: client.branch.name,
        },
        gym,
        tenantId: context.tenantId,
        runtimeMode: context.runtimeMode,
        canEdit,
        suggestedCode,
      },
    };
  } finally {
    await dispose();
  }
}
