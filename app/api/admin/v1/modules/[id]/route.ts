import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  isCore: z.boolean().optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.modules.manage");
  const { id } = await ctx.params;
  const data = await body(req, updateSchema);
  const existing = await prisma.module.findUnique({ where: { id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Module not found", 404);
  const mod = await prisma.module.update({ where: { id }, data });
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.module_updated",
    entityType: "module",
    entityId: id,
    oldValues: { isActive: existing.isActive, isCore: existing.isCore },
    newValues: data,
    ...requestMeta(req),
  });
  return ok(mod, "Module updated");
});
