import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireUser } from "@/lib/context";
import { createBusiness, listUserBusinesses } from "@/lib/services/business";
import { audit, requestMeta } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  businessTypeId: z.string().min(1),
  description: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  country: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  district: z.string().max(60).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
});

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const memberships = await listUserBusinesses(user.id);
  return ok(
    memberships.map((m) => ({
      id: m.business.id,
      name: m.business.name,
      slug: m.business.slug,
      status: m.business.status,
      logo: m.business.logo,
      type: m.business.businessType.name,
      role: m.role.key,
    })),
  );
});

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const input = await body(req, createSchema);
  const business = await createBusiness(user.id, input);
  await audit({
    actorId: user.id,
    businessId: business.id,
    action: "business.created",
    entityType: "business",
    entityId: business.id,
    newValues: { name: business.name },
    ...requestMeta(req),
  });
  return ok(business, "Business created", 201);
});
