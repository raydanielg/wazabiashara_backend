import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requireUser } from "@/lib/context";
import { registerDevice } from "@/lib/messaging/push";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  platform: z.enum(["android", "ios", "web"]),
  token: z.string().min(8).max(512),
});

export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const devices = await prisma.pushDevice.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, platform: true, lastActiveAt: true, createdAt: true },
  });
  return ok(devices);
});

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const input = await body(req, schema);
  const device = await registerDevice(user.id, input);
  return ok({ id: device.id, platform: device.platform }, "Device registered", 201);
});
