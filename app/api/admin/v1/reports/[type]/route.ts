import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

const TYPES = ["overview", "revenue", "sales", "users", "businesses", "subscriptions", "financial"] as const;
type ReportType = (typeof TYPES)[number];

function since(sp: URLSearchParams) {
  const days = Math.min(Math.max(Number(sp.get("days")) || 30, 1), 365);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return { days, from: d };
}

/** Buckets rows into per-day counts for the range. */
async function dailyCount(
  table: "user" | "business" | "payment" | "sale" | "subscription",
  from: Date,
  sumField?: string,
) {
  const rows = await (prisma[table] as { findMany: (a: unknown) => Promise<{ createdAt: Date; amount?: unknown }[]> }).findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true, ...(sumField ? { [sumField]: true } : {}) },
  });
  const map = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const e = map.get(key) ?? { count: 0, total: 0 };
    e.count += 1;
    if (sumField) e.total += Number((r as Record<string, unknown>)[sumField] ?? 0);
    map.set(key, e);
  }
  return [...map.entries()].sort().map(([date, v]) => ({ date, ...v }));
}

export const GET = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.reports.view");
  const { type } = await ctx.params;
  if (!TYPES.includes(type as ReportType)) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Unknown report type", 404);
  }
  const sp = new URL(req.url).searchParams;
  const { days, from } = since(sp);

  switch (type as ReportType) {
    case "revenue":
    case "sales": {
      const daily = await dailyCount("payment", from, "amount");
      const [sum, count] = await Promise.all([
        prisma.payment.aggregate({ where: { paidAt: { gte: from } }, _sum: { amount: true } }),
        prisma.payment.count({ where: { paidAt: { gte: from } } }),
      ]);
      return ok({ type, days, daily, total: sum._sum.amount ?? 0, count });
    }
    case "users": {
      const daily = await dailyCount("user", from);
      const total = await prisma.user.count();
      return ok({ type, days, daily, total });
    }
    case "businesses": {
      const daily = await dailyCount("business", from);
      const [total, active, byStatus] = await Promise.all([
        prisma.business.count(),
        prisma.business.count({ where: { status: "active" } }),
        prisma.business.groupBy({ by: ["status"], _count: true }),
      ]);
      return ok({
        type, days, daily, total, active,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      });
    }
    case "subscriptions": {
      const daily = await dailyCount("subscription", from);
      const [byStatus, byPackage] = await Promise.all([
        prisma.subscription.groupBy({ by: ["status"], _count: true }),
        prisma.package.findMany({
          where: { isActive: true },
          select: { name: true, _count: { select: { subscriptions: true } } },
        }),
      ]);
      return ok({
        type, days, daily,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        byPackage: byPackage.map((p) => ({ name: p.name, count: p._count.subscriptions })),
      });
    }
    case "financial": {
      const [revenue, expenses, debts] = await Promise.all([
        prisma.payment.aggregate({ where: { paidAt: { gte: from } }, _sum: { amount: true } }),
        prisma.expense.aggregate({ where: { date: { gte: from } }, _sum: { amount: true } }),
        prisma.debt.aggregate({
          where: { status: { in: ["open", "partial", "overdue"] } },
          _sum: { originalAmount: true, paidAmount: true },
        }),
      ]);
      const outstanding =
        Number(debts._sum?.originalAmount ?? 0) - Number(debts._sum?.paidAmount ?? 0);
      return ok({
        type, days,
        revenue: revenue._sum.amount ?? 0,
        expenses: expenses._sum.amount ?? 0,
        outstandingDebt: Math.max(outstanding, 0),
      });
    }
    default: {
      const [users, businesses, subscriptions, revenue] = await Promise.all([
        prisma.user.count(),
        prisma.business.count(),
        prisma.subscription.count({ where: { status: "active" } }),
        prisma.payment.aggregate({ _sum: { amount: true } }),
      ]);
      return ok({
        type, days,
        totals: { users, businesses, subscriptions, revenue: revenue._sum.amount ?? 0 },
      });
    }
  }
});
