import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import type { BusinessContext } from "@/lib/context";

/**
 * Central plan/limits engine (spec §14). All plan, module and limit
 * decisions go through here — never scatter `if package == ...` checks.
 */

export interface BusinessPlan {
  subscription: {
    id: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    trialEndsAt: Date | null;
    cancelledAt: Date | null;
  } | null;
  package: {
    id: string;
    slug: string;
    name: string;
    price: unknown;
    currency: string;
    billingPeriod: string;
    trialDays: number;
    graceDays: number;
  } | null;
  /** limit key -> value; null = unlimited */
  limits: Map<string, number | null>;
  /** effective module keys enabled for this business */
  modules: Set<string>;
}

const SUBSCRIPTION_USABLE = new Set(["trialing", "active", "past_due"]);

export function isSubscriptionUsable(status: string | null | undefined): boolean {
  return !!status && SUBSCRIPTION_USABLE.has(status);
}

export async function getPlan(businessId: string): Promise<BusinessPlan> {
  const [subscription, overrides, modules] = await Promise.all([
    prisma.subscription.findUnique({
      where: { businessId },
      include: { package: { include: { limits: true, modules: true } } },
    }),
    prisma.businessModule.findMany({ where: { businessId } }),
    prisma.module.findMany({ where: { isActive: true } }),
  ]);

  const pkgModuleIds = new Set(subscription?.package.modules.map((m) => m.moduleId) ?? []);
  const overrideMap = new Map(overrides.map((o) => [o.moduleId, o.enabled]));
  const usable = isSubscriptionUsable(subscription?.status);

  const enabled = new Set<string>();
  for (const m of modules) {
    if (m.isCore) {
      enabled.add(m.key);
      continue;
    }
    if (!usable) continue; // non-core modules require a usable subscription
    const override = overrideMap.get(m.id);
    if (override === true || (override !== false && pkgModuleIds.has(m.id))) {
      enabled.add(m.key);
    }
  }

  return {
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          trialEndsAt: subscription.trialEndsAt,
          cancelledAt: subscription.cancelledAt,
        }
      : null,
    package: subscription?.package ?? null,
    limits: new Map(
      (subscription?.package.limits ?? []).map((l) => [l.key, l.value]),
    ),
    modules: enabled,
  };
}

/** Resolve a numeric limit. null/undefined = unlimited. */
export function getLimit(plan: BusinessPlan, key: string): number | null {
  const v = plan.limits.get(key);
  return v === undefined ? null : v;
}

export function isModuleEnabled(plan: BusinessPlan, moduleKey: string): boolean {
  return plan.modules.has(moduleKey);
}

/**
 * Assert the business may use a module (module enabled in registry +
 * subscription active where required).
 */
export async function requireModule(
  ctx: BusinessContext,
  moduleKey: string,
): Promise<BusinessPlan> {
  const plan = await getPlan(ctx.businessId);
  if (plan.modules.has(moduleKey)) return plan;
  if (!isSubscriptionUsable(plan.subscription?.status)) {
    throw new AppError(
      ErrorCodes.SUBSCRIPTION_EXPIRED,
      "Subscription is not active",
      403,
    );
  }
  throw new AppError(
    ErrorCodes.MODULE_NOT_AVAILABLE,
    `Module '${moduleKey}' is not available on this plan`,
    403,
  );
}

/**
 * Assert a usage count stays within a plan limit.
 * limit === null → unlimited.
 */
export function assertWithinLimit(
  plan: BusinessPlan,
  key: string,
  current: number,
  message?: string,
): void {
  const limit = getLimit(plan, key);
  if (limit !== null && current >= limit) {
    throw new AppError(
      ErrorCodes.PLAN_LIMIT_REACHED,
      message ?? `Plan limit reached: ${key} (max ${limit})`,
      403,
    );
  }
}

/** How many businesses may this user own? Resolved from their best package. */
export async function canCreateBusiness(userId: string): Promise<void> {
  const owned = await prisma.membership.findMany({
    where: { userId, status: { in: ["active", "invited"] }, role: { isOwner: true } },
    include: { business: { include: { subscription: { include: { package: { include: { limits: true } } } } } } },
  });

  let maxBusinesses: number | null = null;
  for (const m of owned) {
    const v = m.business.subscription?.package.limits.find(
      (l) => l.key === "max_businesses",
    )?.value;
    if (v === null || v === undefined) continue;
    maxBusinesses = maxBusinesses === null ? v : Math.max(maxBusinesses, v);
  }
  if (maxBusinesses === null) {
    const def = await prisma.package.findFirst({
      where: { isDefault: true, isActive: true },
      include: { limits: true },
    });
    maxBusinesses = def?.limits.find((l) => l.key === "max_businesses")?.value ?? 1;
  }

  if (owned.length >= maxBusinesses) {
    throw new AppError(
      ErrorCodes.PLAN_LIMIT_REACHED,
      `You can own at most ${maxBusinesses} business(es) on your current plan`,
      403,
    );
  }
}

/** Assign the default package subscription to a new business. */
export async function assignDefaultSubscription(
  businessId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const db = tx ?? prisma;
  const pkg = await db.package.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (!pkg) return null;

  const trial = pkg.trialDays > 0;
  const trialEndsAt = trial
    ? new Date(Date.now() + pkg.trialDays * 24 * 60 * 60 * 1000)
    : null;

  return db.subscription.create({
    data: {
      businessId,
      packageId: pkg.id,
      status: trial ? "trialing" : "active",
      trialEndsAt,
      endDate:
        pkg.billingPeriod === "lifetime"
          ? null
          : new Date(
              Date.now() +
                (pkg.billingPeriod === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
            ),
    },
  });
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  return flag?.enabled ?? false;
}
