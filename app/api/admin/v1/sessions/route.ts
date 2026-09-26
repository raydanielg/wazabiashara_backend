import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { pagination } from "@/lib/api/validate";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.audit.view");
  const pg = pagination(new URL(req.url).searchParams);
  const where = { expiresAt: { gt: new Date() } };
  const [items, total] = await Promise.all([
    prisma.adminSession.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        adminUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.adminSession.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});
