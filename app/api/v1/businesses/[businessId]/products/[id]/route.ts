import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, stripNulls } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { getProduct, updateProduct, archiveProduct } from "@/lib/services/catalog";
import { audit, requestMeta } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  categoryId: z.string().nullable().optional(),
  sku: z.string().max(80).nullable().optional(),
  barcode: z.string().max(80).nullable().optional(),
  buyingPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  unit: z.string().max(30).optional(),
  image: z.string().max(500).nullable().optional(),
  lowStockThreshold: z.number().nonnegative().nullable().optional(),
});

async function resolve(req: Request, params: Promise<Record<string, string>>) {
  const { businessId, id } = await params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "products");
  return { biz, id };
}

export const GET = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "products.view");
  return ok(await getProduct(biz.businessId, id));
});

export const PATCH = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "products.update");
  const input = await body(req, updateSchema);
  const product = await updateProduct(biz.businessId, id, stripNulls(input));
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "product.updated",
    entityType: "product",
    entityId: id,
    newValues: input,
    ...requestMeta(req),
  });
  return ok(product);
});

export const DELETE = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "products.delete");
  const product = await archiveProduct(biz.businessId, id);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "product.deleted",
    entityType: "product",
    entityId: id,
    ...requestMeta(req),
  });
  return ok(product, "Product archived");
});
