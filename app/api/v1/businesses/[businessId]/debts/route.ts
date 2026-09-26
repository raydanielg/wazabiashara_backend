import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { createDebt, listDebts } from "@/lib/services/finance";
import { audit, requestMeta } from "@/lib/audit";

const createSchema = z.object({
  direction: z.enum(["customer_owes", "business_owes"]),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  amount: z.number().positive(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "debts");
  requirePermission(biz, "debts.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const [items, total] = await listDebts(biz.businessId, {
    skip: pg.skip,
    take: pg.take,
    direction: sp.get("direction") ?? undefined,
  });
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "debts");
  requirePermission(biz, "debts.create");
  const input = await body(req, createSchema);
  const debt = await createDebt(biz.businessId, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "debt.created",
    entityType: "debt",
    entityId: debt.id,
    newValues: { direction: debt.direction, amount: String(debt.originalAmount) },
    ...requestMeta(req),
  });
  return ok(debt, "Debt recorded", 201);
});
