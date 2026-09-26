import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { prisma } from "@/lib/prisma";

export const POST = handler(async (req, ctx) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok(null, "Marked as read");
});
