import { handler, ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";

// Public endpoint — packages are marketing/pricing info, no auth required.
export const GET = handler(async () => {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      limits: { select: { key: true, value: true } },
      modules: { include: { module: { select: { key: true, name: true } } } },
    },
  });
  return ok(
    packages.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      currency: p.currency,
      billingPeriod: p.billingPeriod,
      trialDays: p.trialDays,
      limits: Object.fromEntries(p.limits.map((l) => [l.key, l.value])),
      modules: p.modules.map((m) => m.module.key),
    })),
  );
});
