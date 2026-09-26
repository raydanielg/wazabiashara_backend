import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.transactions.view");
  const { id } = await ctx.params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true, slug: true, currency: true } },
      paymentMethod: true,
      sale: {
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!payment) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Transaction not found", 404);
  return ok(payment);
});
