import { handler, ok } from "@/lib/api/response";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { runDueJobs } from "@/lib/jobs";
import { registerAllHandlers } from "@/lib/jobs/handlers";

registerAllHandlers();

/**
 * Cron-triggerable job runner. Protected by INTERNAL_JOBS_SECRET —
 * call with `Authorization: Bearer <secret>` from a scheduler.
 */
export const POST = handler(async (req) => {
  const secret = process.env.INTERNAL_JOBS_SECRET;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || token !== secret) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Forbidden", 403);
  }
  const result = await runDueJobs();
  return ok(result);
});
