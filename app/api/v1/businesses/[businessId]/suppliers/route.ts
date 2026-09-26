import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, pagination } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule, assertWithinLimit } from "@/lib/plan";
import { suppliers } from "@/lib/services/parties";
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
  await requireModule(biz, "suppliers");
  requirePermission(biz, "suppliers.view");
  const sp = new URL(req.url).searchParams;
  const pg = pagination(sp);
  const [items, total] = await suppliers.list(biz.businessId, {
    search: sp.get("search") ?? undefined,
    skip: pg.skip,
    take: pg.take,
  });
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  const plan = await requireModule(biz, "suppliers");
  requirePermission(biz, "suppliers.create");
  const input = await body(req, partySchema);
  const count = await prisma.supplier.count({
    where: { businessId: biz.businessId, status: "active" },
  });
  assertWithinLimit(plan, "max_suppliers", count);
  return ok(await suppliers.create(biz.businessId, input), "Supplier created", 201);
});
