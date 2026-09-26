import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { resolveRange, runReport, type ReportType } from "@/lib/services/reports";
import { generatePdf } from "@/lib/pdf";
import { saveFile } from "@/lib/storage";
import { audit, requestMeta } from "@/lib/audit";

function flatten(data: Record<string, unknown>, prefix = ""): [string, string][] {
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(data)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      rows.push([key, JSON.stringify(v)]);
    } else if (v !== null && typeof v === "object") {
      rows.push(...flatten(v as Record<string, unknown>, key));
    } else {
      rows.push([key, String(v)]);
    }
  }
  return rows;
}

export const GET = handler(async (req, ctx) => {
  const { businessId, type } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "reports");
  requirePermission(biz, "reports.export");

  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "pdf";
  const range = resolveRange(sp);
  const data = await runReport(biz.businessId, type as ReportType, range);
  const flat = flatten(data);

  const stamp = new Date().toISOString().slice(0, 10);
  let buffer: Buffer;
  let mime: string;
  let name: string;

  if (format === "csv") {
    const csv = ["key,value", ...flat.map(([k, v]) => `"${k}","${v.replaceAll('"', '""')}"`)].join("\n");
    buffer = Buffer.from(csv, "utf8");
    mime = "text/csv";
    name = `${type}-report-${stamp}.csv`;
  } else {
    buffer = await generatePdf({
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
      subtitle: `${range.from.toISOString().slice(0, 10)} → ${range.to.toISOString().slice(0, 10)}`,
      columns: ["Key", "Value"],
      rows: flat.map(([k, v]) => [k, v.length > 60 ? v.slice(0, 60) + "…" : v]),
    });
    mime = "application/pdf";
    name = `${type}-report-${stamp}.pdf`;
  }

  const file = await saveFile({
    businessId: biz.businessId,
    uploaderId: biz.user.id,
    name,
    mime,
    data: buffer,
  });
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "report.exported",
    entityType: "file",
    entityId: file.id,
    newValues: { type, format },
    ...requestMeta(req),
  });
  return ok({ file: { id: file.id, name: file.name, mime: file.mime, size: file.size } });
});
