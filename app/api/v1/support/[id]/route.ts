import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req, ctx) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: {
      business: { select: { name: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Ticket not found", 404);
  return ok(ticket);
});
