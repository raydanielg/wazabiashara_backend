import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { getDebt, payDebt } from "@/lib/services/finance";
import { audit, requestMeta } from "@/lib/audit";

const paySchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string().optional(),
  note: z.string().max(300).optional(),
});

export const POST = handler(async (req, ctx) => {
  const { businessId, id } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "debts");
  requirePermission(biz, "debts.update");
  const input = await body(req, paySchema);
  const debt = await payDebt(biz.businessId, biz.user.id, id, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "debt.payment",
    entityType: "debt",
    entityId: id,
    newValues: { amount: input.amount, status: debt.status },
    ...requestMeta(req),
  });
  return ok(debt, "Payment recorded");
});

export const GET = handler(async (req, ctx) => {
  const { businessId, id } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "debts");
  requirePermission(biz, "debts.view");
  return ok(await getDebt(biz.businessId, id));
});
