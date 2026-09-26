import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  await requireAdmin(req);
  const modules = await prisma.module.findMany({
    orderBy: [{ isCore: "desc" }, { key: "asc" }],
    include: { _count: { select: { packageModules: true } } },
  });
  return ok(modules);
});
