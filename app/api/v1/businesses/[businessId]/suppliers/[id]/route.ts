import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body, stripNulls } from "@/lib/api/validate";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { suppliers } from "@/lib/services/parties";

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
  await requireModule(biz, "suppliers");
  return { biz, id };
}

export const GET = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "suppliers.view");
  return ok(await suppliers.get(biz.businessId, id));
});

export const PATCH = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "suppliers.update");
  return ok(await suppliers.update(biz.businessId, id, stripNulls(await body(req, updateSchema))));
});

export const DELETE = handler(async (req, ctx) => {
  const { biz, id } = await resolve(req, ctx.params);
  requirePermission(biz, "suppliers.delete");
  return ok(await suppliers.archive(biz.businessId, id), "Supplier archived");
});
