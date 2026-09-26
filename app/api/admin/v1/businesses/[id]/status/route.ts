import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const schema = z.object({
  status: z.enum(["active", "suspended", "inactive"]),
  reason: z.string().min(3).max(300),
});

export const POST = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.businesses.manage");
  const { id } = await ctx.params;
  const { status, reason } = await body(req, schema);

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Business not found", 404);

  const updated = await prisma.business.update({ where: { id }, data: { status } });
  await audit({
    actorAdminId: admin.admin.id,
    businessId: id,
    action: `admin.business_${status}`,
    entityType: "business",
    entityId: id,
    oldValues: { status: business.status },
    newValues: { status, reason },
    ...requestMeta(req),
  });
  return ok({ id: updated.id, status: updated.status }, `Business ${status}`);
});
