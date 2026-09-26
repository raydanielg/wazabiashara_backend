import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.businesses.view");
  const { id } = await ctx.params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      businessType: true,
      subscription: { include: { package: { include: { limits: true } } } },
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
          role: { select: { key: true, name: true, isOwner: true } },
        },
      },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { products: true, sales: true, customers: true } },
    },
  });
  if (!business) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Business not found", 404);
  return ok(business);
});
