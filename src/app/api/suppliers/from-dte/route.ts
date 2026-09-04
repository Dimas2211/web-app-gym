export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { createSupplier } from "@/modules/commerce/suppliers/services/supplier.service";
import { taxpayerTypeEnum } from "@/modules/commerce/suppliers/schemas/create-supplier.schema";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

// Acepta NIT con guiones (0614-180389-101-1) o sin guiones (06141803891011).
// En ambos casos se normaliza a formato con guiones antes de pasar al service,
// ya que el schema del maestro suppliers usa /^\d{4}-\d{6}-\d{3}-\d$/.
function normalizeNit(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`;
  }
  return raw;
}

const fromDteBodySchema = z.object({
  name:          z.string().min(1, "El nombre es requerido.").max(200).trim(),
  taxpayer_type: taxpayerTypeEnum,
  nit: z
    .string()
    .trim()
    .refine(
      (val) => val.replace(/\D/g, "").length === 14,
      { message: "El NIT debe tener 14 digitos. Formatos aceptados: 06141803891011 o 0614-180389-101-1." },
    )
    .nullish(),
  nrc:           z.string().max(20).trim().nullish(),
  phone:         z.string().min(7, "El telefono debe tener al menos 7 caracteres.").max(20).trim().nullish(),
  email:         z.string().email("Email invalido.").max(200).trim().nullish(),
});

function genProvisionalCode(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 15);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "PROV-" + slug + "-" + rand;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  if (!user.tenant_id) {
    return NextResponse.json({ error: "La sesion no tiene un tenant activo." }, { status: 400 });
  }

  // Alta rápida de proveedor exclusiva del flujo de importación DTE de
  // Purchases (purchase-dte-create-supplier-dialog) -> commerce.purchases.
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la peticion invalido." }, { status: 400 });
  }

  const parsed = fromDteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, taxpayer_type, nrc, phone, email } = parsed.data;
  // Normaliza NIT a formato con guiones requerido por el maestro suppliers
  const nit = parsed.data.nit ? normalizeNit(parsed.data.nit) : parsed.data.nit;

  const buildPayload = (code: string) => ({
    supplier_code: code,
    name,
    taxpayer_type,
    ...(nit   ? { nit }   : {}),
    ...(nrc   ? { nrc }   : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  });

  let supplierCode = genProvisionalCode(name);
  let result = await createSupplier(user.tenant_id, user.id, buildPayload(supplierCode));

  if (!result.ok && result.code === "DUPLICATE_CODE") {
    supplierCode = genProvisionalCode(name);
    result = await createSupplier(user.tenant_id, user.id, buildPayload(supplierCode));
  }

  if (!result.ok) {
    const status = result.code === "DUPLICATE_CODE" ? 409 : 422;
    return NextResponse.json(
      { error: result.error, ...(result.field && { field: result.field }) },
      { status },
    );
  }

  return NextResponse.json(
    { id: result.id, supplier_code: result.supplier_code, name },
    { status: 201 },
  );
}