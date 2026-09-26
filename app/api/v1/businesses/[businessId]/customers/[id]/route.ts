import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, stripNulls } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { customers } from "@/lib/services/parties";

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

async function resolve(req: Request, params: Promise<Record<string, string>>) {
  const { businessId, id } = await params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "customers");
  return { biz, id };
}

export const GET = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "customers.view");
  return ok(await customers.get(biz.businessId, id));
});

export const PATCH = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "customers.update");
  return ok(await customers.update(biz.businessId, id, stripNulls(await body(req, updateSchema))));
});

export const DELETE = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "customers.delete");
  return ok(await customers.archive(biz.businessId, id), "Customer archived");
});
