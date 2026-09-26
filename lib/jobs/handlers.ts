import { registerJob } from "@/lib/jobs";
import { sendSms } from "@/lib/messaging/sms";
import { sendEmail } from "@/lib/messaging/email";
import { sendPush } from "@/lib/messaging/push";
import { prisma } from "@/lib/prisma";

/**
 * Job handler registry — import this module to wire all handlers.
 * Handlers must be idempotent (retries re-run them).
 */
export function registerAllHandlers() {
  registerJob("sms.send", async (p) => {
    await sendSms({ to: String(p.to), body: String(p.body), businessId: p.businessId as string | undefined });
  });

  registerJob("email.send", async (p) => {
    await sendEmail({
      to: String(p.to),
      subject: String(p.subject),
      body: String(p.body),
      businessId: p.businessId as string | undefined,
    });
  });

  registerJob("push.send", async (p) => {
    await sendPush(String(p.userId), {
      title: String(p.title),
      message: String(p.message),
      data: p.data as Record<string, unknown> | undefined,
    });
  });

  /**
   * Subscription reminder sweep (spec §31). Schedule this via cron —
   * it notifies owners 7/3/1 days before expiry and on expiry.
   */
  registerJob("subscriptions.check", async () => {
    const now = Date.now();
    const windows = [7, 3, 1, 0].map((days) => ({
      days,
      from: new Date(now + days * 86400000),
      to: new Date(now + (days + 1) * 86400000),
    }));
    for (const w of windows) {
      const subs = await prisma.subscription.findMany({
        where: {
          status: { in: ["trialing", "active"] },
          OR: [
            { endDate: { gte: w.from, lt: w.to } },
            { trialEndsAt: { gte: w.from, lt: w.to } },
          ],
        },
        include: { business: true, package: true },
      });
      const { emit } = await import("@/lib/events");
      for (const sub of subs) {
        const expiry = sub.endDate ?? sub.trialEndsAt;
        await emit("subscription.expiring", {
          businessId: sub.businessId,
          businessName: sub.business.name,
          packageName: sub.package.name,
          expiryDate: expiry?.toISOString().slice(0, 10) ?? "",
          daysLeft: w.days,
          message: `${sub.business.name}'s ${sub.package.name} subscription expires in ${w.days} day(s)`,
        });
      }
    }
    // Mark expired
    await prisma.subscription.updateMany({
      where: { status: { in: ["trialing", "active"] }, endDate: { lt: new Date() } },
      data: { status: "expired" },
    });
  });

  registerJob("webhook.deliver", async (p) => {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: String(p.endpointId) },
    });
    if (!endpoint || !endpoint.isActive) return;
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: String(p.event),
        payload: p.payload as object,
      },
    });
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": String(p.event),
        "X-Webhook-Secret": endpoint.secret,
      },
      body: JSON.stringify(p.payload),
    }).catch((e) => {
      throw new Error(`webhook fetch failed: ${e}`);
    });
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? "delivered" : "failed",
        responseCode: res.status,
        attempts: { increment: 1 },
        deliveredAt: res.ok ? new Date() : undefined,
      },
    });
    if (!res.ok) throw new Error(`webhook endpoint returned ${res.status}`);
  });
}
