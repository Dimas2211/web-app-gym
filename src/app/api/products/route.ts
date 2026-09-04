export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET  /api/products  — lista paginada del catálogo
// POST /api/products  — crear producto en el catálogo maestro
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getProducts } from "@/modules/commerce/products/queries/get-products";
import { createProductSchema } from "@/modules/commerce/products/schemas/create-product.schema";
import type {
  ProductFilters,
  ProductSort,
  ProductSortField,
  SortDirection,
} from "@/modules/commerce/products/types/product-filters.types";
import type { ProductStatus, ProductType } from "@/modules/commerce/products/types/product.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  withCapacityCheckedTransaction,
  isProductCountedForCapacity,
  capacityDelta,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// Roles que pueden ver el catálogo (lectura)
const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];
// Roles que pueden modificar el catálogo
const ADMIN_ROLES = ["super_admin", "branch_admin"];

// ── GET /api/products ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;

  // ── Filtros ─────────────────────────────────────────────────────
  const filters: ProductFilters = {};

  // Todos los params usan snake_case, igual que los campos de ProductFilters.
  // No hay traducción de naming entre la URL y el tipo.

  // Búsquedas separadas por código y por nombre
  const searchCode = searchParams.get("search_code");
  if (searchCode?.trim()) filters.search_code = searchCode.trim();

  const searchName = searchParams.get("search_name");
  if (searchName?.trim()) filters.search_name = searchName.trim();

  const VALID_STATUSES: ProductStatus[] = [
    "ACTIVE", "INACTIVE", "DISCONTINUED", "BLOCKED_PURCHASE", "BLOCKED_SALE",
  ];
  const statusParam = searchParams.get("status");
  if (statusParam && VALID_STATUSES.includes(statusParam as ProductStatus)) {
    filters.status = statusParam as ProductStatus;
  }

  const VALID_TYPES: ProductType[] = ["PRODUCT", "SERVICE"];
  const productTypeParam = searchParams.get("product_type");
  if (productTypeParam && VALID_TYPES.includes(productTypeParam as ProductType)) {
    filters.product_type = productTypeParam as ProductType;
  }

  const categoryId = searchParams.get("category_id");
  if (categoryId) filters.category_id = categoryId;

  const lineId = searchParams.get("line_id");
  if (lineId) filters.line_id = lineId;

  const sublineId = searchParams.get("subline_id");
  if (sublineId) filters.subline_id = sublineId;

  const supplierId = searchParams.get("supplier_id");
  if (supplierId) filters.supplier_id = supplierId;

  const brandParam = searchParams.get("brand");
  if (brandParam?.trim()) filters.brand = brandParam.trim();

  const isStockableParam = searchParams.get("is_stockable");
  if (isStockableParam !== null) {
    filters.is_stockable = isStockableParam === "true";
  }

  const allowPurchaseParam = searchParams.get("allow_purchase");
  if (allowPurchaseParam !== null) {
    filters.allow_purchase = allowPurchaseParam === "true";
  }

  const allowSaleParam = searchParams.get("allow_sale");
  if (allowSaleParam !== null) {
    filters.allow_sale = allowSaleParam === "true";
  }

  // ── Ordenamiento ────────────────────────────────────────────────
  const sortFieldParam = searchParams.get("sort_field") as ProductSortField | null;
  const sortDirParam = searchParams.get("sort_direction") as SortDirection | null;
  const sort: ProductSort | undefined = sortFieldParam
    ? { field: sortFieldParam, direction: sortDirParam ?? "asc" }
    : undefined;

  // ── Paginación ──────────────────────────────────────────────────
  // parseInt(..., 10) || fallback convierte NaN (valor falsy) al default
  // sin necesidad de un if adicional. Number("abc") no es seguro aquí.
  const page     = Math.max(1, parseInt(searchParams.get("page")      ?? "1",  10) || 1);
  const pageSize = Math.max(1, parseInt(searchParams.get("page_size") ?? "20", 10) || 20);

  // PASO 6A: si hay sesión runtime "Operar como cliente" activa, leer de
  // la base del perfil runtime en vez de la del tenant del super_admin.
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id });
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    try {
      assertOrganizationModule(commercialCtx, "commerce.products");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
      }
      throw err;
    }

    const result = await getProducts(context.tenantId, {
      filters,
      sort,
      pagination: { page, pageSize },
    }, context.client);

    return NextResponse.json(result);
  } finally {
    await dispose();
  }
}

// ── POST /api/products ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  // Bloque B: módulo commerce.products debe estar habilitado
  const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
  try {
    assertOrganizationModule(commercialCtx, "commerce.products");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  // ── Parseo del body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la petición inválido." },
      { status: 400 }
    );
  }

  // ── Validación Zod ──────────────────────────────────────────────
  // La API recibe JSON directamente; el schema es el mismo contrato
  // que usa create-product.action.ts (FormData). El schema no depende
  // del transporte, solo de la forma del objeto validado.
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const tenantId = user.tenant_id;

  // ── Unicidad de product_code ────────────────────────────────────
  const duplicate = await prisma.product.findUnique({
    where: {
      tenant_id_product_code: {
        tenant_id: tenantId,
        product_code: data.product_code,
      },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { errors: { product_code: ["Ya existe un producto con este código en el catálogo."] } },
      { status: 409 }
    );
  }

  // ── Verificación de entidades relacionadas ──────────────────────

  const category = await prisma.productCategory.findFirst({
    where: { id: data.category_id, tenant_id: tenantId, status: "active" },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json(
      { errors: { category_id: ["La categoría seleccionada no existe o está inactiva."] } },
      { status: 422 }
    );
  }

  if (data.line_id) {
    const line = await prisma.productLine.findFirst({
      where: {
        id: data.line_id,
        tenant_id: tenantId,
        category_id: data.category_id,
        status: "active",
      },
      select: { id: true },
    });
    if (!line) {
      return NextResponse.json(
        { errors: { line_id: ["La línea no existe, está inactiva o no pertenece a la categoría."] } },
        { status: 422 }
      );
    }
  }

  if (data.subline_id) {
    const subline = await prisma.productSubline.findFirst({
      where: {
        id: data.subline_id,
        tenant_id: tenantId,
        line_id: data.line_id!,
        status: "active",
      },
      select: { id: true },
    });
    if (!subline) {
      return NextResponse.json(
        { errors: { subline_id: ["La sublínea no existe, está inactiva o no pertenece a la línea."] } },
        { status: 422 }
      );
    }
  }

  const unit = await prisma.unitOfMeasure.findFirst({
    where: { id: data.unit_id, status: "active" },
    select: { id: true },
  });
  if (!unit) {
    return NextResponse.json(
      { errors: { unit_id: ["La unidad de medida no existe o está inactiva."] } },
      { status: 422 }
    );
  }

  if (data.tax_rate_id) {
    const taxRate = await prisma.taxRate.findFirst({
      where: { id: data.tax_rate_id, tenant_id: tenantId, status: "active" },
      select: { id: true },
    });
    if (!taxRate) {
      return NextResponse.json(
        { errors: { tax_rate_id: ["La tasa de impuesto no existe o está inactiva."] } },
        { status: 422 }
      );
    }
  }

  if (data.supplier_id) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplier_id, tenant_id: tenantId, status: "active" },
      select: { id: true },
    });
    if (!supplier) {
      return NextResponse.json(
        { errors: { supplier_id: ["El proveedor no existe o está inactivo."] } },
        { status: 422 }
      );
    }
  }

  // ── Crear producto ──────────────────────────────────────────────
  const delta = capacityDelta(false, isProductCountedForCapacity("ACTIVE"));
  try {
    const product = await withCapacityCheckedTransaction(
      prisma,
      "commerce.products.max",
      delta,
      commercialCtx,
      (tx) =>
        tx.product.create({
          data: {
            tenant_id:      tenantId,
            product_code:   data.product_code,
            name:           data.name,
            description:    data.description ?? null,
            product_type:   data.product_type,
            status:         "ACTIVE",
            is_stockable:   data.is_stockable,
            allow_purchase: data.allow_purchase,
            allow_sale:     data.allow_sale,
            category_id:    data.category_id,
            line_id:        data.line_id ?? null,
            subline_id:     data.subline_id ?? null,
            brand:          data.brand ?? null,
            unit_id:        data.unit_id,
            package_unit:   data.package_unit ?? null,
            supplier_id:    data.supplier_id ?? null,
            sku:            data.sku ?? null,
            cost_price:     data.cost_price ?? null,
            sale_price:     data.sale_price ?? null,
            tax_rate_id:    data.tax_rate_id ?? null,
            created_by:     user.id,
            updated_by:     user.id,
          },
          select: { id: true, product_code: true, name: true },
        }),
    );

    return NextResponse.json(product, {
      status: 201,
      headers: { Location: `/api/products/${product.id}` },
    });
  } catch (e) {
    if (e instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.httpStatus });
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json(
        { errors: { product_code: ["Ya existe un producto con este código en el catálogo."] } },
        { status: 409 }
      );
    }
    throw e;
  }
}
