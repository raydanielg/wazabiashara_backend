/**
 * Internal domain events (spec §47). Lightweight in-process pub/sub —
 * modules emit, listeners react (notifications, audit, webhooks).
 * For cross-process delivery the payload can be dispatched as a job.
 */

export type DomainEvent =
  | "user.registered"
  | "business.created"
  | "sale.created"
  | "sale.cancelled"
  | "stock.low"
  | "subscription.expiring"
  | "subscription.expired"
  | "payment.completed"
  | "payment.failed"
  | "debt.due"
  | "report.generated"
  | "staff.invited";

export interface EventPayload {
  businessId?: string;
  userId?: string;
  [key: string]: unknown;
}

type Listener = (payload: EventPayload) => void | Promise<void>;

const listeners = new Map<DomainEvent, Listener[]>();

export function on(event: DomainEvent, listener: Listener) {
  const arr = listeners.get(event) ?? [];
  arr.push(listener);
  listeners.set(event, arr);
}

export async function emit(event: DomainEvent, payload: EventPayload) {
  for (const listener of listeners.get(event) ?? []) {
    try {
      await listener(payload);
    } catch (e) {
      console.error(`[events] listener failed for ${event}:`, e);
    }
  }
}

/**
 * Default event wiring — registered on module import. Listeners map
 * domain events to notifications for business owners.
 */
import { prisma } from "./prisma";
import { notify } from "./notify";

async function ownerUserIds(businessId: string): Promise<string[]> {
  const owners = await prisma.membership.findMany({
    where: { businessId, status: "active", role: { isOwner: true } },
    select: { userId: true },
  });
  return owners.map((o) => o.userId);
}

on("stock.low", async (p) => {
  if (!p.businessId) return;
  for (const userId of await ownerUserIds(p.businessId)) {
    await notify({
      userId,
      businessId: p.businessId,
      event: "stock.low",
      title: "Low stock alert",
      message: String(p.message ?? "A product is running low"),
      priority: "high",
      channels: ["in_app", "sms"],
      vars: { product_name: String(p.productName ?? ""), stock: String(p.stock ?? ""), business_name: String(p.businessName ?? "") },
    });
  }
});

on("subscription.expiring", async (p) => {
  if (!p.businessId) return;
  for (const userId of await ownerUserIds(p.businessId)) {
    await notify({
      userId,
      businessId: p.businessId,
      event: "subscription.expiring",
      title: "Subscription expiring",
      message: String(p.message ?? "Your subscription is expiring soon"),
      priority: "high",
      channels: ["in_app", "email"],
      vars: {
        business_name: String(p.businessName ?? ""),
        subscription_name: String(p.packageName ?? ""),
        expiry_date: String(p.expiryDate ?? ""),
      },
    });
  }
});
