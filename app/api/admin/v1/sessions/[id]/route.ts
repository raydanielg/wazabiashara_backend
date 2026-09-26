import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const DELETE = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.users.manage");
  const { id } = await ctx.params;
  await prisma.adminSession.deleteMany({ where: { id } });
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.session_revoked",
    entityType: "admin_session",
    entityId: id,
    ...requestMeta(req),
  });
  return ok(null, "Session revoked");
});
