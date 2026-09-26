import { handler, ok } from "@/lib/api/response";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: ctx.admin.id },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return ok({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    role: admin.role.key,
    roleName: admin.role.name,
    permissions: admin.role.permissions.map((p) => p.permission.key),
  });
});
