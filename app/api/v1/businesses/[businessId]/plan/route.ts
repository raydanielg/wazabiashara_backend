import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { getPlan, isSubscriptionUsable } from "@/lib/plan";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req, ctx) => {
  const bizCtx = await requireBusiness(req);
  const { businessId } = await ctx.params;
  if (businessId !== bizCtx.businessId) {
    throw new AppError(ErrorCodes.BUSINESS_ACCESS_DENIED, "Business context mismatch", 403);
  }
  const plan = await getPlan(businessId);
  return ok({
    subscription: plan.subscription,
    package: plan.package,
    limits: Object.fromEntries(plan.limits),
    modules: [...plan.modules].sort(),
    usable: isSubscriptionUsable(plan.subscription?.status),
  });
});

const changeSchema = z.object({ packageId: z.string().min(1) });

/** Switch subscription package (upgrade/downgrade). Requires business.update. */
export const POST = handler(async (req, ctx) => {
  const bizCtx = await requireBusiness(req);
  const { businessId } = await ctx.params;
  if (businessId !== bizCtx.businessId) {
    throw new AppError(ErrorCodes.BUSINESS_ACCESS_DENIED, "Business context mismatch", 403);
  }
  requirePermission(bizCtx, "business.update");

  const { packageId } = await body(req, changeSchema);
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.isActive) {
    throw AppError.validation({ packageId: ["Invalid or inactive package"] });
  }

  const previous = await prisma.subscription.findUnique({ where: { businessId } });
  const trial = pkg.trialDays > 0 && !previous;
  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      packageId: pkg.id,
      status: "active",
      startDate: new Date(),
      endDate:
        pkg.billingPeriod === "lifetime"
          ? null
          : new Date(
              Date.now() +
                (pkg.billingPeriod === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
            ),
      cancelledAt: null,
    },
    create: {
      businessId,
      packageId: pkg.id,
      status: trial ? "trialing" : "active",
      trialEndsAt: trial
        ? new Date(Date.now() + pkg.trialDays * 86400000)
        : null,
    },
    include: { package: true },
  });

  await audit({
    actorId: bizCtx.user.id,
    businessId,
    action: "subscription.changed",
    entityType: "subscription",
    entityId: subscription.id,
    oldValues: previous ? { packageId: previous.packageId, status: previous.status } : undefined,
    newValues: { packageId: pkg.id, status: subscription.status },
    ...requestMeta(req),
  });

  return ok(subscription, "Subscription updated");
});
