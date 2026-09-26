import { prisma } from "@/lib/prisma";

/**
 * SMS provider abstraction (spec §27). Providers implement SmsProvider;
 * the active one is selected by env SMS_PROVIDER. Secrets never leave
 * the server.
 */
export interface SmsProvider {
  key: string;
  send(input: { to: string; body: string }): Promise<{ ref?: string }>;
}

/** Dev provider: logs the message instead of sending. */
const consoleSms: SmsProvider = {
  key: "console",
  send: async ({ to, body }) => {
    console.log(`[sms:console] to=${to} body="${body}"`);
    return { ref: `dev-${Date.now()}` };
  },
};

/** Africa's Talking provider skeleton — fill with real credentials via env. */
const africasTalking: SmsProvider = {
  key: "africastalking",
  send: async ({ to, body }) => {
    const apiKey = process.env.AT_API_KEY;
    const username = process.env.AT_USERNAME;
    const senderId = process.env.AT_SENDER_ID;
    if (!apiKey || !username) throw new Error("Africa's Talking not configured");
    const res = await fetch(
      "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: {
          apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username,
          to,
          message: body,
          ...(senderId ? { from: senderId } : {}),
        }),
      },
    );
    if (!res.ok) throw new Error(`AT send failed: ${res.status}`);
    const data = (await res.json()) as {
      SMSMessageData?: { Recipients?: { messageId?: string; status: string }[] };
    };
    return { ref: data.SMSMessageData?.Recipients?.[0]?.messageId };
  },
};

const PROVIDERS: Record<string, SmsProvider> = {
  console: consoleSms,
  africastalking: africasTalking,
};

export function activeSmsProvider(): SmsProvider {
  return PROVIDERS[process.env.SMS_PROVIDER ?? "console"] ?? consoleSms;
}

/**
 * Send an SMS — records every message in sms_message for auditability,
 * delivery status and retry handling (spec §27).
 */
export async function sendSms(input: { to: string; body: string; businessId?: string }) {
  const provider = activeSmsProvider();
  const msg = await prisma.smsMessage.create({
    data: {
      to: input.to,
      body: input.body,
      businessId: input.businessId,
      provider: provider.key,
      status: "queued",
    },
  });
  try {
    const { ref } = await provider.send({ to: input.to, body: input.body });
    return await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { status: "sent", providerRef: ref, sentAt: new Date() },
    });
  } catch (e) {
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { status: "failed", error: String(e) },
    });
    throw e;
  }
}
