import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const packageSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(300).optional(),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  billingPeriod: z.enum(["monthly", "yearly", "lifetime"]).optional(),
  trialDays: z.number().int().nonnegative().optional(),
  graceDays: z.number().int().nonnegative().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  limits: z.record(z.string(), z.number().nullable()).optional(),
  modules: z.array(z.string()).optional(),
});

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  const packages = await prisma.package.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      limits: true,
      modules: { include: { module: { select: { key: true } } } },
      _count: { select: { subscriptions: true } },
    },
  });
  return ok(packages.map((p) => ({ ...p, modules: p.modules.map((m) => m.module.key) })));
});

export const POST = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.packages.manage");
  const { limits, modules, ...data } = await body(req, packageSchema);

  const pkg = await prisma.package.create({ data });
  if (limits) {
    await prisma.packageLimit.createMany({
      data: Object.entries(limits).map(([key, value]) => ({ packageId: pkg.id, key, value })),
    });
  }
  if (modules?.length) {
    const rows = await prisma.module.findMany({ where: { key: { in: modules } } });
    await prisma.packageModule.createMany({
      data: rows.map((m) => ({ packageId: pkg.id, moduleId: m.id })),
    });
  }
  await audit({
    actorAdminId: ctx.admin.id,
    action: "admin.package_created",
    entityType: "package",
    entityId: pkg.id,
    newValues: { slug: pkg.slug },
    ...requestMeta(req),
  });
  return ok(pkg, "Package created", 201);
});
