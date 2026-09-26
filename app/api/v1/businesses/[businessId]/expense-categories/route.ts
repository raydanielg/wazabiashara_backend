import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({ name: z.string().min(1).max(120) });

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "expenses");
  requirePermission(biz, "expenses.view");
  const items = await prisma.expenseCategory.findMany({
    where: { businessId: biz.businessId, isActive: true },
    orderBy: { name: "asc" },
  });
  return ok(items);
});

export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "expenses");
  requirePermission(biz, "expenses.create");
  const input = await body(req, createSchema);
  const category = await prisma.expenseCategory.create({
    data: { ...input, businessId: biz.businessId },
  });
  return ok(category, "Category created", 201);
});
