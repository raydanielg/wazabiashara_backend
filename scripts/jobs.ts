/**
 * Background job worker — `npm run jobs`.
 * Polls the `job` table and executes due jobs. For production, run this
 * as a separate process (or trigger /api/internal/jobs/run from cron).
 */
import "dotenv/config";
import { runDueJobs } from "../lib/jobs";
import { registerAllHandlers } from "../lib/jobs/handlers";

const INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);

async function main() {
  registerAllHandlers();
  console.log(`[jobs] worker started (poll ${INTERVAL_MS}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { ran, failed } = await runDueJobs();
      if (ran || failed) console.log(`[jobs] ran=${ran} failed=${failed}`);
    } catch (e) {
      console.error("[jobs] tick error:", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
