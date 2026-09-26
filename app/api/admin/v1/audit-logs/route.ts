import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { pagination } from "@/lib/api/validate";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.audit.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const where = {
    ...(sp.get("businessId") ? { businessId: sp.get("businessId") } : {}),
    ...(sp.get("action") ? { action: { contains: sp.get("action")! } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } }, actorAdmin: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});
