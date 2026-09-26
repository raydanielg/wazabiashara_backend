import { handler, ok } from "@/lib/api/response";
import { pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.support.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const q = sp.get("q") ?? sp.get("search");
  const status = sp.get("status");
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" as const } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [items, total, open, waiting] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.supportTicket.count({ where: { status: "waiting" } }),
  ]);
  return ok({ items, total, open, waiting, page: pg.page, per_page: pg.perPage });
});
