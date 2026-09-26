import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";

export function listMembers(businessId: string) {
  return prisma.membership.findMany({
    where: { businessId, status: { not: "removed" } },
    include: {
      user: { select: { id: true, name: true, email: true, phoneNumber: true, image: true } },
      role: { select: { id: true, key: true, name: true, isOwner: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Invite a user to the business by email. Status = invited. */
export async function inviteMember(
  businessId: string,
  inviterId: string,
  input: { email: string; roleId: string },
) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw AppError.validation({ email: ["No user with this email exists"] });
  }
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, businessId },
  });
  if (!role) throw AppError.validation({ roleId: ["Invalid role"] });
  if (role.isOwner) {
    throw AppError.validation({ roleId: ["Cannot invite as owner"] });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId } },
  });
  if (existing && existing.status !== "removed") {
    throw new AppError(ErrorCodes.CONFLICT, "User is already a member", 409);
  }

  if (existing) {
    return prisma.membership.update({
      where: { id: existing.id },
      data: { roleId: role.id, status: "invited", invitedById: inviterId, invitedAt: new Date() },
    });
  }
  return prisma.membership.create({
    data: {
      userId: user.id,
      businessId,
      roleId: role.id,
      status: "invited",
      invitedById: inviterId,
    },
  });
}

export async function removeMember(
  businessId: string,
  membershipId: string,
) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, businessId },
    include: { role: true },
  });
  if (!membership || membership.status === "removed") {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Membership not found", 404);
  }
  if (membership.role.isOwner) {
    throw AppError.validation({ membership: ["Cannot remove the owner"] });
  }
  return prisma.membership.update({
    where: { id: membershipId },
    data: { status: "removed" },
  });
}

/** Accept an invitation — the invited user activates their membership. */
export async function acceptInvite(userId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, userId },
  });
  if (!membership) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Invitation not found", 404);
  }
  if (membership.status !== "invited") {
    throw AppError.validation({ status: [`Membership is ${membership.status}`] });
  }
  return prisma.membership.update({
    where: { id: membershipId },
    data: { status: "active", acceptedAt: new Date() },
  });
}
