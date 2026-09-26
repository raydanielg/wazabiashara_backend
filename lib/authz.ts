import { AppError, ErrorCodes } from "@/lib/api/errors";
import type { BusinessContext } from "@/lib/context";

/** Owner role bypasses permission checks — full access to their business. */
export function hasPermission(ctx: BusinessContext, permission: string): boolean {
  if (ctx.membership.role.isOwner) return true;
  return ctx.permissionKeys.has(permission);
}

export function requirePermission(ctx: BusinessContext, permission: string): void {
  if (!hasPermission(ctx, permission)) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      `Missing permission: ${permission}`,
      403,
    );
  }
}
