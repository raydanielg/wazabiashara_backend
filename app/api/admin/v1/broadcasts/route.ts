import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.broadcasts.manage");
  const pg = pagination(new URL(req.url).searchParams);
  const [items, total] = await Promise.all([
    prisma.broadcast.findMany({
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.broadcast.count(),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  audience: z.enum(["all", "active", "owners"]).default("all"),
});

export const POST = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.broadcasts.manage");
  const data = await body(req, createSchema);
  const broadcast = await prisma.broadcast.create({
    data: { ...data, createdByAdminId: ctx.admin.id },
  });
  await audit({
    actorAdminId: ctx.admin.id,
    action: "admin.broadcast_created",
    entityType: "broadcast",
    entityId: broadcast.id,
    newValues: data,
    ...requestMeta(req),
  });
  return ok(broadcast, "Broadcast created", 201);
});
