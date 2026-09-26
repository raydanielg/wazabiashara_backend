import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
});

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "products");
  requirePermission(biz, "products.view");
  const items = await prisma.productCategory.findMany({
    where: { businessId: biz.businessId, isActive: true },
    orderBy: { name: "asc" },
  });
  return ok(items);
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "products");
  requirePermission(biz, "products.create");
  const input = await body(req, createSchema);
  const category = await prisma.productCategory.create({
    data: { ...input, businessId: biz.businessId },
  });
  return ok(category, "Category created", 201);
});
