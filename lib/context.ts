import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import type { Membership, Role, RolePermission, Permission } from "@/generated/client";

export interface AuthContext {
  user: { id: string; email: string; name: string; status: string };
  sessionToken: string;
}

export interface BusinessContext extends AuthContext {
  businessId: string;
  membership: Membership & { role: Role & { permissions: (RolePermission & { permission: Permission })[] } };
  permissionKeys: Set<string>;
}

/** Authenticate the request via better-auth session (cookie or bearer). */
export async function requireUser(req: Request): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required", 401);
  }
  const status = (session.user as { status?: string }).status ?? "active";
  if (status !== "active") {
    throw new AppError(ErrorCodes.FORBIDDEN, `Account is ${status}`, 403);
  }
  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name, status },
    sessionToken: session.session.token,
  };
}

const BUSINESS_HEADER = "x-business-id";

/**
 * Resolve the tenant context. The business id may come from the URL path
 * (explicit param) or the X-Business-Id header — but it is NEVER trusted:
 * it is always validated against the user's membership in the database.
 */
export async function requireBusiness(
  req: Request,
  businessIdParam?: string,
): Promise<BusinessContext> {
  const auth = await requireUser(req);
  const businessId = businessIdParam ?? req.headers.get(BUSINESS_HEADER);
  if (!businessId) {
    throw new AppError(ErrorCodes.BUSINESS_NOT_FOUND, "X-Business-Id header is required", 400);
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: auth.user.id, businessId } },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!membership || membership.status === "removed") {
    throw new AppError(ErrorCodes.BUSINESS_ACCESS_DENIED, "You do not have access to this business", 403);
  }
  if (membership.status !== "active") {
    throw new AppError(ErrorCodes.BUSINESS_ACCESS_DENIED, `Membership is ${membership.status}`, 403);
  }
  return {
    ...auth,
    businessId,
    membership,
    permissionKeys: new Set(membership.role.permissions.map((p) => p.permission.key)),
  };
}
