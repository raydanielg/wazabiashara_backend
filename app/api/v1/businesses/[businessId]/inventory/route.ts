import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { adjustStock } from "@/lib/services/catalog";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const adjustSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().refine((v) => v !== 0, "Quantity cannot be zero"),
  reason: z.string().min(2).max(300),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "inventory");
  requirePermission(biz, "inventory.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const where = {
    businessId: biz.businessId,
    ...(sp.get("productId") ? { productId: sp.get("productId")! } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "inventory");
  requirePermission(biz, "inventory.adjust");
  const input = await body(req, adjustSchema);
  const product = await adjustStock(biz.businessId, biz.user.id, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "inventory.adjusted",
    entityType: "product",
    entityId: input.productId,
    newValues: { quantity: input.quantity, reason: input.reason },
    ...requestMeta(req),
  });
  return ok(product, "Stock adjusted");
});
