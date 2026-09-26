import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.users.view");
  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, firstName: true, lastName: true, email: true,
      phoneNumber: true, status: true, emailVerified: true,
      phoneNumberVerified: true, createdAt: true, updatedAt: true,
      memberships: {
        include: {
          business: { select: { id: true, name: true, slug: true, status: true } },
          role: { select: { key: true, name: true } },
        },
      },
      sessions: { select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "User not found", 404);
  return ok(user);
});
