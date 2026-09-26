import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.settings.manage");
  const settings = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  // never expose secret values to the API
  return ok(
    settings.map((s) => ({
      key: s.key,
      value: s.isSecret ? "••••••••" : s.value,
      isSecret: s.isSecret,
      updatedAt: s.updatedAt,
    })),
  );
});

const schema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1).max(120),
      value: z.unknown(),
      isSecret: z.boolean().optional(),
    }),
  ),
});

export const PUT = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.settings.manage");
  const { settings } = await body(req, schema);

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value as object, isSecret: s.isSecret ?? false, updatedById: ctx.admin.id },
      create: { key: s.key, value: s.value as object, isSecret: s.isSecret ?? false, updatedById: ctx.admin.id },
    });
  }
  await audit({
    actorAdminId: ctx.admin.id,
    action: "admin.settings_updated",
    newValues: { keys: settings.map((s) => s.key) },
    ...requestMeta(req),
  });
  return ok(null, "Settings updated");
});
