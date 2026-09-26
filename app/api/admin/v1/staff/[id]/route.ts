import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roleKey: z.string().min(1).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.users.manage");
  const { id } = await ctx.params;
  const { roleKey, ...data } = await body(req, updateSchema);

  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Admin not found", 404);

  let roleId: string | undefined;
  if (roleKey) {
    const role = await prisma.adminRole.findUnique({ where: { key: roleKey } });
    if (!role) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Role not found", 404);
    roleId = role.id;
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: { ...data, ...(roleId ? { roleId } : {}) },
    select: { id: true, name: true, email: true, status: true },
  });
  if (data.status === "suspended") {
    await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
  }
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.staff_updated",
    entityType: "admin_user",
    entityId: id,
    oldValues: { status: existing.status },
    newValues: { ...data, roleKey },
    ...requestMeta(req),
  });
  return ok(updated, "Admin updated");
});

export const DELETE = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.users.manage");
  const { id } = await ctx.params;
  if (id === admin.admin.id) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Cannot remove yourself", 400);
  }
  await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
  await prisma.adminUser.delete({ where: { id } });
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.staff_removed",
    entityType: "admin_user",
    entityId: id,
    ...requestMeta(req),
  });
  return ok(null, "Admin removed");
});
