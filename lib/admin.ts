import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";

/**
 * Platform admin auth (spec §35). Completely separate from business
 * users — own table, own sessions (hashed tokens), own RBAC.
 */

export const ADMIN_PERMISSIONS = [
  "admin.dashboard.view",
  "admin.users.view", "admin.users.manage",
  "admin.businesses.view", "admin.businesses.manage",
  "admin.packages.manage",
  "admin.modules.manage",
  "admin.subscriptions.manage",
  "admin.settings.manage",
  "admin.audit.view",
  "admin.templates.manage",
  "admin.support.view", "admin.support.manage",
  "admin.broadcasts.manage",
  "admin.transactions.view",
  "admin.reports.view",
  "admin.system.view",
] as const;

export const ADMIN_ROLES: Record<string, { name: string; permissions: string[] }> = {
  super_admin: { name: "Super Admin", permissions: [...ADMIN_PERMISSIONS] },
  support_admin: {
    name: "Support Admin",
    permissions: ["admin.dashboard.view", "admin.users.view", "admin.businesses.view", "admin.audit.view"],
  },
  finance_admin: {
    name: "Finance Admin",
    permissions: ["admin.dashboard.view", "admin.packages.manage", "admin.subscriptions.manage", "admin.businesses.view"],
  },
  ops_admin: {
    name: "Operations Admin",
    permissions: ["admin.dashboard.view", "admin.modules.manage", "admin.settings.manage", "admin.templates.manage"],
  },
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function adminLogin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!admin || admin.status !== "active") {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Invalid credentials", 401);
  }
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, "Invalid credentials", 401);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.adminSession.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  return { token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role.key } };
}

export interface AdminContext {
  admin: { id: string; email: string; name: string };
  role: string;
  permissions: Set<string>;
}

export async function requireAdmin(req: Request): Promise<AdminContext> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Admin authentication required", 401);
  }
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      adminUser: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Session expired", 401);
  }
  const admin = session.adminUser;
  if (admin.status !== "active") {
    throw new AppError(ErrorCodes.FORBIDDEN, `Admin account is ${admin.status}`, 403);
  }
  return {
    admin: { id: admin.id, email: admin.email, name: admin.name },
    role: admin.role.key,
    permissions: new Set(admin.role.permissions.map((p) => p.permission.key)),
  };
}

export function requireAdminPermission(ctx: AdminContext, permission: string) {
  if (!ctx.permissions.has(permission)) {
    throw new AppError(ErrorCodes.FORBIDDEN, `Missing permission: ${permission}`, 403);
  }
}

export async function adminLogout(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
