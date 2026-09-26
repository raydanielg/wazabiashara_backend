import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { removeMember } from "@/lib/services/members";
import { audit, requestMeta } from "@/lib/audit";

export const DELETE = handler(async (req, ctx) => {
  const { businessId, membershipId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  requirePermission(biz, "staff.remove");
  const membership = await removeMember(biz.businessId, membershipId);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "staff.removed",
    entityType: "membership",
    entityId: membershipId,
    ...requestMeta(req),
  });
  return ok(membership, "Member removed");
});
