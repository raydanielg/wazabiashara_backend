import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/client";

/**
 * DB-backed job queue foundation (spec §46). Jobs are durable rows —
 * `dispatch` enqueues, `runDueJobs` executes. Run the worker with
 * `npm run jobs` or hit /api/internal/jobs/run (secret-protected) from cron.
 * Retries use attempts < maxAttempts with backoff; handlers must be
 * idempotent.
 */

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function dispatch(
  type: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; maxAttempts?: number } = {},
) {
  return prisma.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
    },
  });
}

export async function runDueJobs(limit = 25): Promise<{ ran: number; failed: number }> {
  const jobs = await prisma.job.findMany({
    where: { status: "pending", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
  });

  let ran = 0;
  let failed = 0;
  for (const job of jobs) {
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "running" },
    });
    if (claimed.count === 0) continue; // another worker took it

    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler for job type '${job.type}'`);
      await handler(job.payload as Record<string, unknown>);
      await prisma.job.update({ where: { id: job.id }, data: { status: "done" } });
      ran++;
    } catch (e) {
      failed++;
      const attempts = job.attempts + 1;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: attempts >= job.maxAttempts ? "failed" : "pending",
          attempts,
          lastError: String(e),
          runAt: new Date(Date.now() + Math.min(attempts * 60_000, 30 * 60_000)),
        },
      });
    }
  }
  return { ran, failed };
}
