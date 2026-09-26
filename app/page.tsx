import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dbOk = false;
  let latency = 0;
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    latency = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  return (
    <div className="wrap">
      <style>{`
        .wrap { font-family: var(--font-geist-sans), system-ui, sans-serif;
          background: #0c0d0e; color: #f5f5f4; min-height: 100vh;
          display: flex; align-items: center; justify-content: center; }
        .card { width: min(420px, 90vw); padding: 44px 36px; text-align: center;
          border: 1px solid #262729; border-radius: 20px; background: #141517; }
        .logo { width: 64px; height: 64px; border-radius: 18px; margin: 0 auto 18px;
          background: #fdc700; display: flex; align-items: center; justify-content: center;
          font-size: 30px; font-weight: 800; color: #733e0a; }
        .card h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
        .sub { color: #a1a1aa; font-size: 13px; margin-top: 6px; }
        .status { display: inline-flex; align-items: center; gap: 8px; margin: 26px 0 4px;
          padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 600;
          background: ${dbOk ? "#052e16" : "#450a0a"};
          color: ${dbOk ? "#4ade80" : "#f87171"};
          border: 1px solid ${dbOk ? "#166534" : "#991b1b"}; }
        .dot { width: 8px; height: 8px; border-radius: 50%;
          background: ${dbOk ? "#4ade80" : "#f87171"}; }
        .meta { margin-top: 22px; font-size: 12px; color: #71717a; line-height: 1.9; }
        .meta b { color: #d4d4d8; font-weight: 600; }
        .card a { display: inline-block; margin-top: 22px; padding: 11px 22px;
          border-radius: 10px; background: #fdc700; color: #733e0a; font-size: 13px;
          font-weight: 700; text-decoration: none; }
        .card a:hover { background: #e6b400; }
        .card a.ghost { margin-left: 10px; background: transparent; color: #a1a1aa;
          border: 1px solid #3f3f46; }
      `}</style>
      <div className="card">
        <div className="logo">W</div>
        <h1>Wazabiashara API</h1>
        <p className="sub">Multi-tenant business management platform</p>

        <div className="status">
          <span className="dot" />
          {dbOk ? "Operational" : "Degraded"}
        </div>

        <div className="meta">
          <div>API version — <b>v1</b></div>
          <div>Database — <b>{dbOk ? `connected · ${latency}ms` : "unreachable"}</b></div>
          <div>Uptime — <b>{Math.floor(process.uptime() / 60)} min</b></div>
        </div>

        <a href="/docs">API Docs</a>
        <a href="/api/health" className="ghost">Health</a>
      </div>
    </div>
  );
}
