import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { verifyOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "better-auth/crypto";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { audit } from "@/lib/audit";

const schema = z.object({
  identifier: z.string().min(3),
  code: z.string().length(6),
  password: z.string().min(8).max(128),
});

export const POST = handler(async (req) => {
  const { identifier, code, password } = await body(req, schema);
  const isEmail = identifier.includes("@");

  const user = await prisma.user.findFirst({
    where: isEmail ? { email: identifier } : { phoneNumber: identifier },
  });
  if (!user) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid request", 422);
  }

  await verifyOtp({ identifier, purpose: "password_reset", code });

  const passwordHash = await hashPassword(password);
  await prisma.account.updateMany({
    where: { userId: user.id, providerId: "credential" },
    data: { password: passwordHash },
  });
  // revoke all sessions after a password reset
  await prisma.session.deleteMany({ where: { userId: user.id } });

  await audit({
    actorId: user.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: user.id,
  });
  return ok(null, "Password updated — please sign in again");
});
