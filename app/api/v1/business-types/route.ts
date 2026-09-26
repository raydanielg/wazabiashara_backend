import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { prisma } from "@/lib/prisma";

export const GET = handler(async (req) => {
  await requireUser(req);
  const types = await prisma.businessType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, description: true, icon: true },
  });
  return ok(types);
});
