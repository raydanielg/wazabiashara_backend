import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";

interface PartyInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface ListOpts {
  search?: string;
  skip: number;
  take: number;
}

function buildWhere(businessId: string, search?: string) {
  return {
    businessId,
    status: "active" as const,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };
}

function notFound(entity: string): never {
  throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, `${entity} not found`, 404);
}

export const customers = {
  list: (businessId: string, opts: ListOpts) => {
    const where = buildWhere(businessId, opts.search);
    return Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: opts.skip,
        take: opts.take,
      }),
      prisma.customer.count({ where }),
    ]);
  },
  get: async (businessId: string, id: string) => {
    const row = await prisma.customer.findFirst({ where: { id, businessId } });
    if (!row) notFound("Customer");
    return row;
  },
  create: (businessId: string, input: PartyInput) =>
    prisma.customer.create({ data: { ...input, businessId } }),
  update: async (businessId: string, id: string, input: Partial<PartyInput>) => {
    await customers.get(businessId, id);
    return prisma.customer.update({ where: { id }, data: input });
  },
  archive: async (businessId: string, id: string) => {
    await customers.get(businessId, id);
    return prisma.customer.update({ where: { id }, data: { status: "inactive" } });
  },
};

export const suppliers = {
  list: (businessId: string, opts: ListOpts) => {
    const where = buildWhere(businessId, opts.search);
    return Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: opts.skip,
        take: opts.take,
      }),
      prisma.supplier.count({ where }),
    ]);
  },
  get: async (businessId: string, id: string) => {
    const row = await prisma.supplier.findFirst({ where: { id, businessId } });
    if (!row) notFound("Supplier");
    return row;
  },
  create: (businessId: string, input: PartyInput) =>
    prisma.supplier.create({ data: { ...input, businessId } }),
  update: async (businessId: string, id: string, input: Partial<PartyInput>) => {
    await suppliers.get(businessId, id);
    return prisma.supplier.update({ where: { id }, data: input });
  },
  archive: async (businessId: string, id: string) => {
    await suppliers.get(businessId, id);
    return prisma.supplier.update({ where: { id }, data: { status: "inactive" } });
  },
};
