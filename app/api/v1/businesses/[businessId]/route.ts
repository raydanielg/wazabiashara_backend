import { handler, ok } from "@/lib/api/response";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { requireBusiness } from "@/lib/context";
import { getBusinessDetail } from "@/lib/services/business";

export const GET = handler(async (req, ctx) => {
  const bizCtx = await requireBusiness(req);
  const { businessId } = await ctx.params;
  if (businessId !== bizCtx.businessId) {
    throw new AppError(ErrorCodes.BUSINESS_ACCESS_DENIED, "Business context mismatch", 403);
  }
  const business = await getBusinessDetail(businessId);
  if (!business) {
    throw new AppError(ErrorCodes.BUSINESS_NOT_FOUND, "Business not found", 404);
  }
  return ok({
    ...business,
    membership: {
      role: bizCtx.membership.role.key,
      status: bizCtx.membership.status,
      permissions: bizCtx.membership.role.isOwner
        ? ["*"]
        : [...bizCtx.permissionKeys].sort(),
    },
  });
});
