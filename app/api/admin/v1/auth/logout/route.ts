import { handler, ok } from "@/lib/api/response";
import { adminLogout } from "@/lib/admin";

export const POST = handler(async (req) => {
  await adminLogout(req);
  return ok(null, "Signed out");
});
