import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireUser } from "@/lib/context";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

const replySchema = z.object({ body: z.string().min(1).max(4000) });

export const POST = handler(async (req, ctx) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  const { body: text } = await body(req, replySchema);
  const ticket = await prisma.supportTicket.findFirst({ where: { id, userId: user.id } });
  if (!ticket) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Ticket not found", 404);
  if (ticket.status === "closed") {
    throw new AppError(ErrorCodes.CONFLICT, "Ticket is closed", 409);
  }
  const [reply] = await prisma.$transaction([
    prisma.supportTicketReply.create({
      data: { ticketId: id, authorId: user.id, body: text },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: {
        lastReplyAt: new Date(),
        ...(ticket.status === "resolved" ? { status: "open" as const } : {}),
      },
    }),
  ]);
  return ok(reply, "Reply added", 201);
});
