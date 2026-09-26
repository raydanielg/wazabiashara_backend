import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireUser } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const pg = pagination(new URL(req.url).searchParams);
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      include: {
        business: { select: { name: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.supportTicket.count({ where: { userId: user.id } }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  category: z.string().min(1).max(60),
  message: z.string().min(10).max(4000),
  businessId: z.string().optional(),
});

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const { subject, category, message, businessId } = await body(req, createSchema);

  // Verify business ownership when a business is attached
  if (businessId) {
    const member = await prisma.membership.findFirst({
      where: { userId: user.id, businessId },
    });
    if (!member) {
      throw Object.assign(new Error("Not a member of this business"), { status: 403 });
    }
  }

  const [ticket] = await prisma.$transaction([
    prisma.supportTicket.create({
      data: { userId: user.id, businessId, subject, category },
    }),
  ]);
  await prisma.supportTicketReply.create({
    data: { ticketId: ticket.id, authorId: user.id, body: message },
  });
  await audit({
    actorId: user.id,
    action: "support.ticket_created",
    entityType: "support_ticket",
    entityId: ticket.id,
    businessId,
    ...requestMeta(req),
  });
  return ok(ticket, "Ticket created", 201);
});
