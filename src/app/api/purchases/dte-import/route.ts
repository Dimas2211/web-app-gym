// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/route.ts
//
// POST /api/purchases/dte-import
//   Recibe un JSON DTE, extrae metadata básica y guarda un registro
//   en purchase_dte_imports con status UPLOADED.
//   No crea Purchase, Supplier, Product ni InventoryMovement.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { dteImportBodySchema } from "@/modules/commerce/purchases/schemas/dte-import.schema";
import { createPurchaseDteImport } from "@/modules/commerce/purchases/services/purchase-dte-import.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export async function POST(req: NextRequest) {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) {
      return NextResponse.json(
        { error: "Sesión sin tenant o location activa." },
        { status: 401 },
      );
    }

    // Parsear body — falla controlada si JSON inválido o vacío
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON inválido o vacío." },
        { status: 400 },
      );
    }

    // Rechazar null y arrays en raíz
    if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json(
        { error: "El body debe ser un objeto JSON. No se aceptan null ni arrays como raíz." },
        { status: 400 },
      );
    }

    // Normalizar: soporta { raw_json: {...} } y DTE directo como objeto raíz
    const bodyRecord = rawBody as Record<string, unknown>;
    const normalizedBody =
      "raw_json" in bodyRecord &&
      typeof bodyRecord["raw_json"] === "object" &&
      bodyRecord["raw_json"] !== null &&
      !Array.isArray(bodyRecord["raw_json"])
        ? bodyRecord
        : { raw_json: bodyRecord };

    // Validar con Zod
    const parsed = dteImportBodySchema.safeParse(normalizedBody);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createPurchaseDteImport(
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data.raw_json,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(
      {
        ok:       true,
        id:       result.id,
        status:   result.status,
        metadata: result.metadata,
        ...(result.warnings.length > 0 && { warnings: result.warnings }),
      },
      { status: 201 },
    );
  } finally {
    await dispose();
  }
}
