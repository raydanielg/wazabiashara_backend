import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { assignDefaultSubscription, canCreateBusiness } from "@/lib/plan";
import type { Prisma } from "@/generated/client";

export interface CreateBusinessInput {
  name: string;
  businessTypeId: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  region?: string;
  district?: string;
  currency?: string;
  timezone?: string;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Create a business with its default roles, role permissions and the
 * creator's owner membership — all in one transaction.
 */
export async function createBusiness(userId: string, input: CreateBusinessInput) {
  await canCreateBusiness(userId);

  const type = await prisma.businessType.findUnique({ where: { id: input.businessTypeId } });
  if (!type || !type.isActive) {
    throw AppError.validation({ businessTypeId: ["Invalid or inactive business type"] });
  }

  const baseSlug = slugify(input.name) || "business";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { ...input, slug, createdById: userId },
    });

    const permissionRows = await tx.permission.findMany();
    const idByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

    const roleIdByKey = new Map<string, string>();
    for (const [key, tpl] of Object.entries(DEFAULT_ROLES)) {
      const role = await tx.role.create({
        data: {
          businessId: business.id,
          key,
          name: tpl.name,
          isSystem: true,
          isOwner: tpl.isOwner ?? false,
        },
      });
      roleIdByKey.set(key, role.id);
      const links = tpl.permissions
        .map((p) => idByKey.get(p))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ roleId: role.id, permissionId }));
      if (links.length) await tx.rolePermission.createMany({ data: links });
    }

    const ownerRoleId = roleIdByKey.get("owner")!;
    await tx.membership.create({
      data: {
        userId,
        businessId: business.id,
        roleId: ownerRoleId,
        status: "active",
        invitedById: userId,
        acceptedAt: new Date(),
      },
    });

    await assignDefaultSubscription(business.id, tx);

    return business;
  });
}

export function listUserBusinesses(userId: string) {
  return prisma.membership.findMany({
    where: { userId, status: { not: "removed" } },
    include: {
      business: { include: { businessType: true } },
      role: { include: { permissions: { include: { permission: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function getBusinessDetail(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: { businessType: true },
  });
}

export type BusinessWithTx = Prisma.BusinessGetPayload<{ include: { businessType: true } }>;
