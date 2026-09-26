import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { createSale, listSales } from "@/lib/services/sale";
import { audit, requestMeta } from "@/lib/audit";

const createSchema = z.object({
  customerId: z.string().optional(),
  saleType: z.enum(["cash", "credit"]).optional(),
  paymentMethodId: z.string().optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
        discount: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "sales");
  requirePermission(biz, "sales.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const [items, total] = await listSales(biz.businessId, {
    skip: pg.skip,
    take: pg.take,
    status: sp.get("status") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    search: sp.get("search") ?? undefined,
  });
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "sales");
  requirePermission(biz, "sales.create");
  const input = await body(req, createSchema);
  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
  const sale = await createSale(biz.businessId, biz.user.id, {
    ...input,
    idempotencyKey,
  });
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "sale.created",
    entityType: "sale",
    entityId: sale.id,
    newValues: { receiptNo: sale.receiptNo, total: String(sale.total) },
    ...requestMeta(req),
  });
  return ok(sale, "Sale recorded", 201);
});
