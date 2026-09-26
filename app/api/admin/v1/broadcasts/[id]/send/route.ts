import { handler, ok } from "@/lib/api/response";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const POST = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.broadcasts.manage");
  const { id } = await ctx.params;
  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Broadcast not found", 404);
  if (broadcast.status === "sent") {
    throw new AppError(ErrorCodes.CONFLICT, "Broadcast already sent", 409);
  }

  // Resolve audience → user ids
  const where =
    broadcast.audience === "owners"
      ? { memberships: { some: { role: { isOwner: true } } } }
      : broadcast.audience === "active"
        ? { status: "active" as const }
        : {};
  const users = await prisma.user.findMany({ where, select: { id: true } });

  await prisma.$transaction([
    prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "broadcast",
        title: broadcast.title,
        message: broadcast.body,
      })),
    }),
    prisma.broadcast.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), recipientCount: users.length },
    }),
  ]);
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.broadcast_sent",
    entityType: "broadcast",
    entityId: id,
    newValues: { recipientCount: users.length, audience: broadcast.audience },
    ...requestMeta(req),
  });
  return ok({ recipientCount: users.length }, "Broadcast sent");
});
