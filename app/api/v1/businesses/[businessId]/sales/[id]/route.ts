import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { getSale } from "@/lib/services/sale";

export const GET = handler(async (req, ctx) => {
  const { businessId, id } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "sales");
  requirePermission(biz, "sales.view");
  return ok(await getSale(biz.businessId, id));
});
