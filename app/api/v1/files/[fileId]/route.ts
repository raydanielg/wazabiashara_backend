import { handler } from "@/lib/api/response";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { requireBusiness } from "@/lib/context";
import { readFileBuffer } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

/**
 * Download a file. Business files require membership in that business;
 * global files require the uploader.
 */
export const GET = handler(async (req, ctx) => {
  const { fileId } = await ctx.params;
  const meta = await prisma.file.findUnique({ where: { id: fileId } });
  if (!meta) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "File not found", 404);

  if (meta.businessId) {
    await requireBusiness(req, meta.businessId);
  }
  const { file, buffer } = await readFileBuffer(fileId);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
    },
  });
});
