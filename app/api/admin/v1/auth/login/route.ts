import { z } from "zod";
import { handler, ok } from "@/lib/api/response";
import { body } from "@/lib/api/validate";
import { adminLogin } from "@/lib/admin";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler(async (req) => {
  const { email, password } = await body(req, schema);
  const result = await adminLogin(email, password);
  return ok(result, "Admin signed in");
});
