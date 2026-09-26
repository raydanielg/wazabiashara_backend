import { z } from "zod";
import bcrypt from "bcryptjs";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireAdmin, requireAdminPermission } from "@/lib/admin";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

export const GET = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.users.manage");
  const pg = pagination(new URL(req.url).searchParams);
  const [items, total] = await Promise.all([
    prisma.adminUser.findMany({
      include: {
        role: { select: { key: true, name: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    prisma.adminUser.count(),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  roleKey: z.string().min(1),
});

export const POST = handler(async (req) => {
  const ctx = await requireAdmin(req);
  requireAdminPermission(ctx, "admin.users.manage");
  const { name, email, password, roleKey } = await body(req, inviteSchema);

  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) {
    throw new AppError(ErrorCodes.CONFLICT, "An admin with this email already exists", 409);
  }
  const role = await prisma.adminRole.findUnique({ where: { key: roleKey } });
  if (!role) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Role not found", 404);

  const admin = await prisma.adminUser.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10), roleId: role.id },
    select: { id: true, name: true, email: true, status: true, createdAt: true },
  });
  await audit({
    actorAdminId: ctx.admin.id,
    action: "admin.staff_invited",
    entityType: "admin_user",
    entityId: admin.id,
    newValues: { email, roleKey },
    ...requestMeta(req),
  });
  return ok(admin, "Admin invited", 201);
});
