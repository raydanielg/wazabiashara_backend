import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, phoneNumber } from "better-auth/plugins";
import { prisma } from "./prisma";
import { sendSms } from "./messaging/sms";

export const auth = betterAuth({
  appName: "Wazabishara",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        await sendSms({
          to: phoneNumber,
          body: `Your Wazabiashara verification code is ${code}. It expires in 10 minutes.`,
        });
      },
      sendPasswordResetOTP: async ({ phoneNumber, code }) => {
        await sendSms({
          to: phoneNumber,
          body: `Your Wazabiashara reset code is ${code}. It expires in 10 minutes.`,
        });
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber) =>
          `${phoneNumber.replace(/[^0-9]/g, "")}@phone.wazabishara.local`,
      },
    }),
    bearer(),
  ],
  trustedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:3000"],
});
