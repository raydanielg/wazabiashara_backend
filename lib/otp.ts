import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import type { OtpPurpose } from "@/generated/client";

/**
 * Centralized OTP service (spec §6). One service for every OTP purpose.
 * Codes are stored SHA-256 hashed with a server-side pepper — never stored
 * or logged in plaintext, never returned in API responses.
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

function pepper() {
  return process.env.OTP_PEPPER ?? process.env.BETTER_AUTH_SECRET ?? "dev-pepper";
}

function hash(code: string) {
  return crypto.createHmac("sha256", pepper()).update(code).digest("hex");
}

function generate(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export interface RequestOtpInput {
  identifier: string; // phone or email
  purpose: OtpPurpose;
  req?: Request;
}

/**
 * Creates an OTP request. Returns the plaintext code ONLY to the caller
 * (delivery channel) — it is never persisted or logged by this service.
 */
export async function requestOtp(input: RequestOtpInput): Promise<{ code: string; expiresAt: Date }> {
  const recent = await prisma.otpRequest.findFirst({
    where: { identifier: input.identifier, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError(ErrorCodes.RATE_LIMITED, "Please wait before requesting another code", 429);
  }

  const code = generate();
  const req = input.req;
  const row = await prisma.otpRequest.create({
    data: {
      identifier: input.identifier,
      purpose: input.purpose,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      maxAttempts: MAX_ATTEMPTS,
      ipAddress: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req?.headers.get("user-agent") ?? undefined,
    },
  });
  await audit({
    action: "otp.requested",
    entityType: "otp_request",
    entityId: row.id,
    newValues: { identifier: input.identifier, purpose: input.purpose },
  });
  return { code, expiresAt: row.expiresAt };
}

export async function verifyOtp(input: {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<void> {
  const row = await prisma.otpRequest.findFirst({
    where: { identifier: input.identifier, purpose: input.purpose, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "No pending code — request a new one", 422);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Code expired — request a new one", 422);
  }
  if (row.attempts >= row.maxAttempts) {
    throw new AppError(ErrorCodes.RATE_LIMITED, "Too many attempts — request a new code", 429);
  }

  const match = crypto.timingSafeEqual(
    Buffer.from(hash(input.code)),
    Buffer.from(row.codeHash),
  );
  if (!match) {
    await prisma.otpRequest.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid code", 422);
  }
  await prisma.otpRequest.update({
    where: { id: row.id },
    data: { verifiedAt: new Date() },
  });
  await audit({
    action: "otp.verified",
    entityType: "otp_request",
    entityId: row.id,
    newValues: { identifier: input.identifier, purpose: input.purpose },
  });
}
