import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { requestOtp } from "@/lib/otp";
import { dispatch } from "@/lib/jobs";
import { registerAllHandlers } from "@/lib/jobs/handlers";
import { prisma } from "@/lib/prisma";

registerAllHandlers();

const schema = z.object({
  identifier: z.string().min(3), // email or phone
});

/** Always returns success — never reveals whether an account exists. */
export const POST = handler(async (req) => {
  const { identifier } = await body(req, schema);
  const isEmail = identifier.includes("@");
  const user = await prisma.user.findFirst({
    where: isEmail ? { email: identifier } : { phoneNumber: identifier },
  });

  if (user) {
    const { code } = await requestOtp({
      identifier,
      purpose: "password_reset",
      req,
    });
    const bodyText = `Your Wazabiashara password reset code is ${code}. It expires in 5 minutes.`;
    if (isEmail) {
      await dispatch("email.send", {
        to: identifier,
        subject: "Password reset code",
        body: bodyText,
      });
    } else {
      await dispatch("sms.send", { to: identifier, body: bodyText });
    }
  }
  return ok(null, "If the account exists, a reset code has been sent");
});
