import { prisma } from "@/lib/prisma";

/**
 * Email abstraction (spec §28). Active provider via env EMAIL_PROVIDER.
 * "smtp" provider sends via a generic SMTP/transactional HTTP relay —
 * configure with SMTP_URL (e.g. smtp://user:pass@host:port or a webhook URL).
 */
export interface EmailProvider {
  key: string;
  send(input: { to: string; subject: string; body: string }): Promise<{ ref?: string }>;
}

const consoleEmail: EmailProvider = {
  key: "console",
  send: async ({ to, subject }) => {
    console.log(`[email:console] to=${to} subject="${subject}"`);
    return { ref: `dev-${Date.now()}` };
  },
};

/** Generic HTTP relay provider — POSTs the message to EMAIL_RELAY_URL. */
const relay: EmailProvider = {
  key: "relay",
  send: async ({ to, subject, body }) => {
    const url = process.env.EMAIL_RELAY_URL;
    if (!url) throw new Error("EMAIL_RELAY_URL not configured");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EMAIL_RELAY_KEY
          ? { Authorization: `Bearer ${process.env.EMAIL_RELAY_KEY}` }
          : {}),
      },
      body: JSON.stringify({ to, subject, body }),
    });
    if (!res.ok) throw new Error(`Email relay failed: ${res.status}`);
    return {};
  },
};

const PROVIDERS: Record<string, EmailProvider> = {
  console: consoleEmail,
  relay,
};

export function activeEmailProvider(): EmailProvider {
  return PROVIDERS[process.env.EMAIL_PROVIDER ?? "console"] ?? consoleEmail;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
  businessId?: string;
}) {
  const provider = activeEmailProvider();
  const msg = await prisma.emailMessage.create({
    data: { ...input, provider: provider.key, status: "queued" },
  });
  try {
    const { ref } = await provider.send(input);
    return await prisma.emailMessage.update({
      where: { id: msg.id },
      data: { status: "sent", providerRef: ref, sentAt: new Date() },
    });
  } catch (e) {
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: { status: "failed", error: String(e) },
    });
    throw e;
  }
}
