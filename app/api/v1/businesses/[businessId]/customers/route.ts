import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule, getPlan, assertWithinLimit } from "@/lib/plan";
import { customers } from "@/lib/services/parties";
import { prisma } from "@/lib/prisma";

const partySchema = z.object({
  name: z.string().min(1).max(160),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "customers");
  requirePermission(biz, "customers.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const [items, total] = await customers.list(biz.businessId, {
    search: sp.get("search") ?? undefined,
    skip: pg.skip,
    take: pg.take,
  });
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  const plan = await requireModule(biz, "customers");
  requirePermission(biz, "customers.create");
  const input = await body(req, partySchema);
  const count = await prisma.customer.count({
    where: { businessId: biz.businessId, status: "active" },
  });
  assertWithinLimit(plan, "max_customers", count);
  return ok(await customers.create(biz.businessId, input), "Customer created", 201);
});
