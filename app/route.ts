import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  let db = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {}

  return Response.json({
    service: "wazabiashara-api",
    version: "1.0.0",
    status: db === "up" ? "ok" : "degraded",
    database: { status: db, latency_ms: db === "up" ? Date.now() - t0 : null },
    uptime_seconds: Math.floor(process.uptime()),
    docs: "/docs",
    health: "/api/health",
    timestamp: new Date().toISOString(),
  }, { status: db === "up" ? 200 : 503 });
}
