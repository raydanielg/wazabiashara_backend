import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { createExpense, listExpenses } from "@/lib/services/finance";
import { audit, requestMeta } from "@/lib/audit";

const createSchema = z.object({
  categoryId: z.string().optional(),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  paymentMethodId: z.string().optional(),
  date: z.string().datetime().optional(),
  attachment: z.string().max(500).optional(),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "expenses");
  requirePermission(biz, "expenses.view");
  const pg = pagination(new URL(req.url).searchParams);
  const [items, total] = await listExpenses(biz.businessId, pg);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "expenses");
  requirePermission(biz, "expenses.create");
  const input = await body(req, createSchema);
  const expense = await createExpense(biz.businessId, biz.user.id, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "expense.created",
    entityType: "expense",
    entityId: expense.id,
    newValues: { amount: String(expense.amount) },
    ...requestMeta(req),
  });
  return ok(expense, "Expense recorded", 201);
});
