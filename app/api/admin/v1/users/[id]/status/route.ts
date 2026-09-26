import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const schema = z.object({
  status: z.enum(["active", "suspended", "blocked", "inactive"]),
  reason: z.string().min(3).max(300),
});

export const POST = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.users.manage");
  const { id } = await ctx.params;
  const { status, reason } = await body(req, schema);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "User not found", 404);

  const updated = await prisma.user.update({ where: { id }, data: { status } });
  if (status !== "active") {
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  await audit({
    actorAdminId: admin.admin.id,
    action: `admin.user_${status}`,
    entityType: "user",
    entityId: id,
    oldValues: { status: user.status },
    newValues: { status, reason },
    ...requestMeta(req),
  });
  return ok({ id: updated.id, status: updated.status }, `User ${status}`);
});
