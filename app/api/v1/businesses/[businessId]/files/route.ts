import { handler, ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireBusiness } from "@/lib/context";
import { saveFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { pagination } from "@/lib/api/validate";

export const GET = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  const pg = pagination(new URL(req.url).searchParams);
  const [items, total] = await Promise.all([
    prisma.file.findMany({
      where: { businessId: biz.businessId },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    }),
    prisma.file.count({ where: { businessId: biz.businessId } }),
  ]);
  return ok({ items, total, page: pg.page, per_page: pg.perPage });
});

/** Multipart file upload. Field name: `file`. */
export const POST = handler(async (req, ctx) => {
  const { businessId } = await ctx.params;
  const biz = await requireBusiness(req, businessId);
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) {
    throw AppError.validation({ file: ["No file uploaded"] });
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  const file = await saveFile({
    businessId: biz.businessId,
    uploaderId: biz.user.id,
    name: f.name,
    mime: f.type || "application/octet-stream",
    data: buffer,
  });
  return ok({ id: file.id, name: file.name, mime: file.mime, size: file.size }, "Uploaded", 201);
});
