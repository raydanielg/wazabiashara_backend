import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { cancelSale } from "@/lib/services/sale";
import { audit, requestMeta } from "@/lib/audit";

export const POST = handler(async (req, ctx) => {
  const { businessId, id } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "sales");
  requirePermission(biz, "sales.delete");
  const sale = await cancelSale(biz.businessId, biz.user.id, id);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "sale.cancelled",
    entityType: "sale",
    entityId: id,
    ...requestMeta(req),
  });
  return ok(sale, "Sale cancelled");
});
