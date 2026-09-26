import { handler, ok } from "@/lib/api/response";
import { pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

/**
 * System logs — background jobs + failed message deliveries (real data only).
 */
export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.system.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const status = sp.get("status");
  const where = status ? { status: status as never } : {};

  const [jobs, total, byStatus, failedSms, failedEmail] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.job.count({ where }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
    prisma.smsMessage.count({ where: { status: "failed" } }),
    prisma.emailMessage.count({ where: { status: "failed" } }),
  ]);

  const items = jobs.map((j) => ({
    id: j.id,
    kind: "job" as const,
    name: j.type,
    severity:
      j.status === "failed" ? ("error" as const) : j.attempts > 1 ? ("warn" as const) : ("info" as const),
    detail: j.lastError,
    status: j.status,
    attempts: j.attempts,
    at: j.createdAt,
    runAt: j.runAt,
  }));

  return ok({
    items,
    total,
    summary: {
      jobs: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      failedSms,
      failedEmail,
    },
    page: pg.page,
    per_page: pg.perPage,
  });
});
