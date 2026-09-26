import { handler, ok } from "@/lib/api/response";
import { requireBusiness } from "@/lib/context";
import { requirePermission } from "@/lib/authz";
import { requireModule } from "@/lib/plan";
import { getSale } from "@/lib/services/sale";
import { generatePdf } from "@/lib/pdf";
import { saveFile } from "@/lib/storage";
import { audit, requestMeta } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const fmt = (n: unknown) => Number(n ?? 0).toLocaleString("en-US");

/**
 * GET /api/v1/businesses/:businessId/sales/:id/receipt
 * Generates a PDF receipt, stores it as a file, returns file metadata.
 * Download via GET /api/v1/files/:fileId (authorized).
 */
export const GET = handler(async (req, ctx) => {
  const { businessId, id } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  await requireModule(biz, "sales");
  requirePermission(biz, "sales.view");

  const sale = await getSale(biz.businessId, id);
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: biz.businessId },
    select: { name: true, currency: true },
  });
  const cur = business.currency;

  const buffer = await generatePdf({
    title: business.name,
    subtitle: `Receipt ${sale.receiptNo} — ${new Date(sale.createdAt).toLocaleString("en-GB")}`,
    lines: [
      sale.customer ? `Customer: ${sale.customer.name}` : "Customer: Walk-in",
      `Status: ${sale.status}`,
      "",
    ],
    columns: ["Item", "Qty", "Price", "Total"],
    rows: [
      ...sale.items.map((i) => [
        i.product.name,
        String(Number(i.quantity)),
        `${cur} ${fmt(i.unitPrice)}`,
        `${cur} ${fmt(Number(i.unitPrice) * Number(i.quantity))}`,
      ]),
      ["", "", "TOTAL", `${cur} ${fmt(sale.total)}`],
      ...(Number(sale.discount ?? 0) > 0
        ? [["", "", "Discount", `${cur} ${fmt(sale.discount)}`]]
        : []),
    ],
  });

  const file = await saveFile({
    businessId: biz.businessId,
    uploaderId: biz.user.id,
    name: `receipt-${sale.receiptNo}.pdf`,
    mime: "application/pdf",
    data: buffer,
  });
  await audit({
    actorId: biz.user.id,
    businessId: biz.businessId,
    action: "sale.receipt_exported",
    entityType: "file",
    entityId: file.id,
    ...requestMeta(req),
  });
  return ok({ file: { id: file.id, name: file.name, mime: file.mime, size: file.size } });
});
