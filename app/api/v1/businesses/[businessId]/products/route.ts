import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule, getPlan, assertWithinLimit } from "@/lib/plan";
import { listProducts, createProduct } from "@/lib/services/catalog";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  sku: z.string().max(80).optional(),
  barcode: z.string().max(80).optional(),
  buyingPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  unit: z.string().max(30).optional(),
  image: z.string().max(500).optional(),
  lowStockThreshold: z.number().nonnegative().optional(),
  openingStock: z.number().nonnegative().optional(),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "products");
  requirePermission(biz, "products.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const [items, total] = await listProducts(biz.businessId, {
    search: sp.get("search") ?? undefined,
    stock: sp.get("stock") ?? undefined,
    skip: pg.skip,
    take: pg.take,
  });
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  const plan = await requireModule(biz, "products");
  requirePermission(biz, "products.create");
  const input = await body(req, createSchema);

  const count = await prisma.product.count({
    where: { businessId: biz.businessId, status: "active" },
  });
  assertWithinLimit(plan, "max_products", count);

  const product = await createProduct(biz.businessId, biz.user.id, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "product.created",
    entityType: "product",
    entityId: product.id,
    newValues: { name: product.name },
    ...requestMeta(req),
  });
  return ok(product, "Product created", 201);
});
