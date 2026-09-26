import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  await requireUser(req);
  const methods = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, name: true },
  });
  return ok(methods);
});
