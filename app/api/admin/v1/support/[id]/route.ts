import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.support.view");
  const { id } = await ctx.params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      business: { select: { id: true, name: true, slug: true, status: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Ticket not found", 404);
  return ok(ticket);
});

const patchSchema = z.object({
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.support.manage");
  const { id } = await ctx.params;
  const patch = await body(req, patchSchema);
  const existing = await prisma.supportTicket.findUnique({ where: { id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Ticket not found", 404);
  const ticket = await prisma.supportTicket.update({ where: { id }, data: patch });
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.ticket_updated",
    entityType: "support_ticket",
    entityId: id,
    oldValues: { status: existing.status, priority: existing.priority },
    newValues: patch,
    ...requestMeta(req),
  });
  return ok(ticket);
});
