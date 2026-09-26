import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { listUserBusinesses } from "@/lib/services/business";

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const memberships = await listUserBusinesses(user.id);
  return ok({
    user,
    businesses: memberships.map((m) => ({
      membershipId: m.id,
      status: m.status,
      role: {
        id: m.role.id,
        key: m.role.key,
        name: m.role.name,
        isOwner: m.role.isOwner,
        permissions: m.role.permissions.map((p) => p.permission.key),
      },
      business: {
        id: m.business.id,
        name: m.business.name,
        slug: m.business.slug,
        status: m.business.status,
        logo: m.business.logo,
        currency: m.business.currency,
        timezone: m.business.timezone,
        type: m.business.businessType,
      },
    })),
  });
});
