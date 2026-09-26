import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { pagination } from "@/lib/api/validate";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.subscriptions.manage");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const status = sp.get("status");
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(sp.get("search")
      ? { business: { name: { contains: sp.get("search")!, mode: "insensitive" as const } } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, status: true } },
        package: { select: { name: true, slug: true, price: true, currency: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.subscription.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});
