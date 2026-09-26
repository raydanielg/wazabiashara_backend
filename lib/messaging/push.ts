import { prisma } from "@/lib/prisma";

/**
 * Push notification foundation (spec §29). Devices are registered per user;
 * sending goes through a provider abstraction (FCM/APNs wiring via env later).
 */
export async function registerDevice(
  userId: string,
  input: { platform: string; token: string },
) {
  return prisma.pushDevice.upsert({
    where: { token: input.token },
    update: { userId, platform: input.platform, isActive: true, lastActiveAt: new Date() },
    create: { userId, platform: input.platform, token: input.token },
  });
}

export async function sendPush(
  userId: string,
  input: { title: string; message: string; data?: Record<string, unknown> },
) {
  const devices = await prisma.pushDevice.findMany({
    where: { userId, isActive: true },
  });
  if (!devices.length) return { sent: 0 };

  // TODO: wire FCM/APNs. For now mark delivery intent; tokens that error out
  // should be deactivated here once a real provider is connected.
  for (const d of devices) {
    console.log(`[push] -> ${d.platform} ${d.token.slice(0, 12)}… : ${input.title}`);
    await prisma.pushDevice.update({
      where: { id: d.id },
      data: { lastActiveAt: new Date() },
    });
  }
  return { sent: devices.length };
}
