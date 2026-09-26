import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { pagination } from "@/lib/api/validate";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.businesses.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const status = sp.get("status");
  const businessId = sp.get("businessId");
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(businessId ? { businessId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        business: { select: { id: true, name: true } },
        paymentMethod: { select: { name: true } },
        sale: { select: { receiptNo: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.payment.count({ where }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});
