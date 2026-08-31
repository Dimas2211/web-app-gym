// ─────────────────────────────────────────────────────────────────
// api/dte/issuer-config/route.ts
//
// GET  /api/dte/issuer-config — listar configs DTE de la location activa
// POST /api/dte/issuer-config — crear configuración de emisor DTE
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listDteIssuerConfigs } from "@/modules/commerce/dte/queries/list-dte-issuer-configs";
import { createDteIssuerConfigSchema } from "@/modules/commerce/dte/schemas/dte-issuer-config.schemas";
import { createDteIssuerConfig } from "@/modules/commerce/dte/services/dte-issuer-config.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getDteApiContext } from "../dte-api-context";

const VALID_ENVIRONMENTS = ["TEST", "PRODUCTION"] as const;

// ── GET — listar configs ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const sp     = req.nextUrl.searchParams;
  const envRaw = sp.get("environment") ?? undefined;
  const environment = envRaw && (VALID_ENVIRONMENTS as readonly string[]).includes(envRaw)
    ? envRaw as typeof VALID_ENVIRONMENTS[number]
    : undefined;

  const isActiveRaw = sp.get("is_active");
  const is_active   = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;

  try {
    const configs = await listDteIssuerConfigs({
      tenant_id:   ctx.tenant_id,
      location_id: ctx.location_id,
      environment,
      is_active,
    }, ctx.client);

    return NextResponse.json({ ok: true, data: configs });
  } finally {
    await ctx.dispose();
  }
}

// ── POST — crear config ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa para configurar el emisor DTE." }, { status: 409 });

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = createDteIssuerConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createDteIssuerConfig(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    const isConflict = result.error.includes("Ya existe");
    return NextResponse.json({ ok: false, error: result.error }, { status: isConflict ? 409 : 422 });
  }

  return NextResponse.json(
    { ok: true, data: { id: result.id } },
    { status: 201 },
  );
}
