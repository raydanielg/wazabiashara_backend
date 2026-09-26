import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.dashboard.view");

  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Number(sp.get("days")) || 30);
  const since = new Date(Date.now() - days * 86400000);

  const [
    totalUsers, newUsers, totalBusinesses, newBusinesses, activeBusinesses,
    trialSubs, activeSubs, expiredSubs, failedJobs, smsSent, emailsSent,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.business.count(),
    prisma.business.count({ where: { createdAt: { gte: since } } }),
    prisma.business.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "trialing" } }),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "expired" } }),
    prisma.job.count({ where: { status: "failed" } }),
    prisma.smsMessage.count({ where: { status: "sent", createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { status: "sent", createdAt: { gte: since } } }),
  ]);

  return ok({
    periodDays: days,
    users: { total: totalUsers, new: newUsers },
    businesses: { total: totalBusinesses, new: newBusinesses, active: activeBusinesses },
    subscriptions: { trialing: trialSubs, active: activeSubs, expired: expiredSubs },
    system: { failedJobs, smsSent, emailsSent },
  });
});
