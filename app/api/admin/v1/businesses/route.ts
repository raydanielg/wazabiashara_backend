import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { pagination } from "@/lib/api/validate";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.businesses.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const search = sp.get("search");
  const status = sp.get("status");
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.business.findMany({
      where,
      include: {
        businessType: { select: { name: true } },
        subscription: { include: { package: { select: { slug: true, name: true } } } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.business.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});
