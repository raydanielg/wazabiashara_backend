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
  price: z.number().nonnegative().optional(),
  billingPeriod: z.enum(["monthly", "yearly", "lifetime"]).optional(),
  trialDays: z.number().int().nonnegative().optional(),
  graceDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  limits: z.record(z.string(), z.number().nullable()).optional(),
  modules: z.array(z.string()).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.packages.manage");
  const { id } = await ctx.params;
  const { limits, modules, ...data } = await body(req, updateSchema);

  const existing = await prisma.package.findUnique({ where: { id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Package not found", 404);

  const pkg = await prisma.package.update({ where: { id }, data });
  if (limits) {
    for (const [key, value] of Object.entries(limits)) {
      await prisma.packageLimit.upsert({
        where: { packageId_key: { packageId: id, key } },
        update: { value },
        create: { packageId: id, key, value },
      });
    }
  }
  if (modules) {
    await prisma.packageModule.deleteMany({ where: { packageId: id } });
    const rows = await prisma.module.findMany({ where: { key: { in: modules } } });
    await prisma.packageModule.createMany({
      data: rows.map((m) => ({ packageId: id, moduleId: m.id })),
    });
  }
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.package_updated",
    entityType: "package",
    entityId: id,
    newValues: data,
    ...requestMeta(req),
  });
  return ok(pkg, "Package updated");
});
