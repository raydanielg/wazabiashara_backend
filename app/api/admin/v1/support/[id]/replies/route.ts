import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const replySchema = z.object({ body: z.string().min(1).max(4000) });

export const POST = handler(async (req, ctx) => {
  const admin = await requireAdmin(req);
  requireAdminPermission(admin, "admin.support.manage");
  const { id } = await ctx.params;
  const { body: text } = await body(req, replySchema);
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Ticket not found", 404);

  const [reply] = await prisma.$transaction([
    prisma.supportTicketReply.create({
      data: { ticketId: id, authorId: admin.admin.id, isAdmin: true, body: text },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: {
        lastReplyAt: new Date(),
        ...(ticket.status === "open" ? { status: "in_progress" as const } : {}),
      },
    }),
    // Notify the user their ticket was answered
    prisma.notification.create({
      data: {
        userId: ticket.userId,
        businessId: ticket.businessId,
        type: "support",
        title: "Support replied",
        message: `Re: ${ticket.subject}`,
      },
    }),
  ]);
  await audit({
    actorAdminId: admin.admin.id,
    action: "admin.ticket_replied",
    entityType: "support_ticket",
    entityId: id,
    ...requestMeta(req),
  });
  return ok(reply, "Reply sent", 201);
});
