import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/client";

interface AuditEntry {
  /** Business user actor (user.id) */
  actorId?: string | null;
  /** Platform admin actor (adminUser.id) */
  actorAdminId?: string | null;
  businessId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/** Write an audit record. Never throws — audit must not break requests. */
export async function audit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({ data: entry });
  } catch (e) {
    console.error("[audit] failed to write:", e);
  }
}

export function requestMeta(req: Request) {
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}
