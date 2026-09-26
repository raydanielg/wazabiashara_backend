import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";

/**
 * Centralized file storage (spec §33). One abstraction — local disk for
 * dev; swap `saveBuffer` internals for S3/GCS in production without
 * touching callers. Uploads are validated for type and size.
 */

const ROOT = path.join(process.cwd(), ".storage");
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function saveFile(input: {
  businessId?: string;
  uploaderId?: string;
  name: string;
  mime: string;
  data: Buffer;
}) {
  if (!ALLOWED_MIME.has(input.mime)) {
    throw AppError.validation({ file: [`File type ${input.mime} is not allowed`] });
  }
  if (input.data.byteLength > MAX_BYTES) {
    throw AppError.validation({ file: ["File exceeds 10MB limit"] });
  }
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const rel = path.join(input.businessId ?? "_global", `${crypto.randomUUID()}-${safeName}`);
  const abs = path.join(ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.data);

  return prisma.file.create({
    data: {
      businessId: input.businessId,
      uploaderId: input.uploaderId,
      name: input.name,
      mime: input.mime,
      size: input.data.byteLength,
      path: rel,
    },
  });
}

export async function readFileBuffer(fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "File not found", 404);
  const abs = path.join(ROOT, file.path);
  // path traversal guard
  if (!abs.startsWith(ROOT)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Invalid file path", 403);
  }
  return { file, buffer: await readFile(abs) };
}
