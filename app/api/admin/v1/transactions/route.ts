import { handler, ok } from "@/lib/api/response";
import { pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

/** Platform-wide transaction explorer — sale payments across all businesses. */
export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.transactions.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const q = sp.get("q") ?? sp.get("search");
  const businessId = sp.get("business_id");
  const from = sp.get("from");
  const to = sp.get("to");
  const where = {
    ...(businessId ? { businessId } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" as const } },
            { business: { name: { contains: q, mode: "insensitive" as const } } },
            { sale: { receiptNo: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(from || to
      ? {
          paidAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };
  const [items, total, sum] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, currency: true } },
        paymentMethod: { select: { key: true, name: true } },
        sale: { select: { id: true, receiptNo: true, status: true } },
      },
      orderBy: { paidAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);
  return ok({
    items,
    total,
    sum: sum._sum.amount ?? 0,
    page: pg.page,
    per_page: pg.perPage,
  });
});
