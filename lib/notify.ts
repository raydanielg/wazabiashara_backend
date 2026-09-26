import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/templates";
import { dispatch } from "@/lib/jobs";
import type { NotificationChannel, NotificationPriority } from "@/generated/client";

/**
 * Central notification engine (spec §26). One entry point — `notify` —
 * writes the in-app notification and enqueues channel deliveries as jobs.
 * Templates are DB-driven with {{vars}}; user preferences respected.
 */

export interface NotifyInput {
  userId: string;
  businessId?: string;
  event: string; // e.g. "stock.low", "debt.due"
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  channels?: NotificationChannel[]; // default: in_app only
  vars?: Record<string, string | number>; // template vars for sms/email
  smsTo?: string; // phone override
  emailTo?: string; // email override
}

async function channelEnabled(
  userId: string,
  event: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_channel_event: { userId, channel, event } },
  });
  return pref?.enabled ?? true;
}

async function applyTemplate(
  key: string,
  channel: NotificationChannel,
  vars: Record<string, string | number>,
): Promise<{ subject?: string; body: string } | null> {
  const tpl = await prisma.notificationTemplate.findUnique({
    where: { key_channel: { key, channel } },
  });
  if (!tpl || !tpl.isActive) return null;
  return {
    subject: tpl.subject ? renderTemplate(tpl.subject, vars) : undefined,
    body: renderTemplate(tpl.body, vars),
  };
}

export async function notify(input: NotifyInput) {
  // In-app notification is always written (notification center, spec §30)
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      businessId: input.businessId,
      type: input.event,
      title: input.title,
      message: input.message,
      priority: input.priority ?? "normal",
      actionUrl: input.actionUrl,
    },
  });

  const vars = { ...input.vars, title: input.title, message: input.message };

  for (const channel of input.channels ?? []) {
    if (!(await channelEnabled(input.userId, input.event, channel))) continue;

    const rendered = await applyTemplate(input.event, channel, vars);
    const body = rendered?.body ?? input.message;
    const subject = rendered?.subject ?? input.title;

    if (channel === "sms") {
      const user = input.smsTo
        ? null
        : await prisma.user.findUnique({ where: { id: input.userId } });
      const to = input.smsTo ?? user?.phoneNumber;
      if (!to) continue;
      await dispatch("sms.send", { to, body, businessId: input.businessId });
    } else if (channel === "email") {
      const user = input.emailTo
        ? null
        : await prisma.user.findUnique({ where: { id: input.userId } });
      const to = input.emailTo ?? user?.email;
      if (!to) continue;
      await dispatch("email.send", { to, subject, body, businessId: input.businessId });
    } else if (channel === "push") {
      await dispatch("push.send", {
        userId: input.userId,
        title: input.title,
        message: body,
        data: { event: input.event, actionUrl: input.actionUrl },
      });
    }
  }
  return notification;
}
