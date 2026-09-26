import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { resolveRange, runReport, type ReportType } from "@/lib/services/reports";

export const GET = handler(async (req, ctx) => {
  const { businessId, type } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "reports");
  requirePermission(biz, "reports.view");
  const sp = new URL(req.url).searchParams;
  const range = resolveRange(sp);
  const data = await runReport(biz.businessId, type as ReportType, range);
  return ok({ type, range, data });
});
