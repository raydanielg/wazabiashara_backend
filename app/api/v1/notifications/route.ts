import { handler, ok } from "@/lib/api/response";
import { pagination } from "@/lib/api/validate";
import { requireUser } from "@/lib/context";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const where = {
    userId: user.id,
    ...(sp.get("unread") === "true" ? { readAt: null } : {}),
  };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return ok({ items, total, unread, page: pg.page, per_page: pg.perPage });
});

/** Mark all notifications read. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok(null, "All notifications marked as read");
});
