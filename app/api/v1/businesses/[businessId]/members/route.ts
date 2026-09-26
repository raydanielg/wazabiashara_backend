import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { getPlan, assertWithinLimit } from "@/lib/plan";
import { inviteMember, listMembers } from "@/lib/services/members";
import { prisma } from "@/lib/prisma";
import { audit, requestMeta } from "@/lib/audit";

const inviteSchema = z.object({
  email: z.string().email(),
  roleId: z.string().min(1),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  requirePermission(biz, "staff.view");
  return ok(await listMembers(biz.businessId));
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  requirePermission(biz, "staff.invite");
  const input = await body(req, inviteSchema);

  const plan = await getPlan(biz.businessId);
  const count = await prisma.membership.count({
    where: { businessId: biz.businessId, status: { in: ["active", "invited"] } },
  });
  assertWithinLimit(plan, "max_users", count);

  const membership = await inviteMember(biz.businessId, biz.user.id, input);
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "staff.invited",
    entityType: "membership",
    entityId: membership.id,
    newValues: { email: input.email, roleId: input.roleId },
    ...requestMeta(req),
  });
  return ok(membership, "Invitation created", 201);
});
