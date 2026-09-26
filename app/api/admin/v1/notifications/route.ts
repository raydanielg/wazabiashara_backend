import { handler, ok } from "@/lib/api/response";
import { pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

/** Recent platform notifications (admin observability). */
export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.system.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const type = sp.get("type");
  const where = type ? { type } : {};
  const [items, total, byType] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.groupBy({ by: ["type"], _count: true }),
  ]);
  return ok({
    items,
    total,
    byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    page: pg.page,
    per_page: pg.perPage,
  });
});
