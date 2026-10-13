// ─────────────────────────────────────────────────────────────────
// api/avatars — helpers compartidos de los route handlers de avatar.
//
// Sesión SIN redirect (route handler → 401 JSON), con la misma
// normalización de auth_scope que getSessionOrRedirect (fail closed).
// Las respuestas de imagen nunca exponen bucket, object key ni secretos.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { isAuthScope } from "@/core/auth/types";
import type { SessionUser } from "@/lib/permissions/guards";
import type { AvatarReadResult, AvatarUploadResult } from "@/core/storage";

export async function getRouteSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    tenant_id: u.tenant_id,
    location_id: u.location_id,
    auth_scope: isAuthScope(u.auth_scope) ? u.auth_scope : undefined,
    organization_id: typeof u.organization_id === "string" ? u.organization_id : undefined,
  };
}

export function unauthenticated() {
  return NextResponse.json({ error: "No autenticado." }, { status: 401 });
}

export function uploadResponse(result: AvatarUploadResult) {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url }, { headers: { "Cache-Control": "no-store" } });
}

export function imageResponse(result: AvatarReadResult) {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      // Fotografía privada autorizada por request: sin caché persistente (el
      // cache del navegador podría sobrevivir a logout / cambio de usuario o
      // de permisos). ?v={uuid} identifica la versión activa, no se usa para cachear.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

export async function readUploadedFile(req: Request): Promise<unknown> {
  try {
    const formData = await req.formData();
    return formData.get("file");
  } catch {
    return null;
  }
}
