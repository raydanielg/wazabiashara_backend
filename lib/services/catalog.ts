import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import type { MovementType, Prisma } from "@/generated/client";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Record a stock movement AND update product quantity — atomically. */
export async function recordStockMovement(
  tx: Tx,
  input: {
    businessId: string;
    productId: string;
    type: MovementType;
    quantity: Prisma.Decimal | number; // signed
    reason?: string;
    referenceType?: string;
    referenceId?: string;
    createdById?: string;
  },
) {
  await tx.inventoryMovement.create({ data: input });
  return tx.product.update({
    where: { id: input.productId },
    data: { stockQuantity: { increment: input.quantity } },
  });
}

export function listProducts(
  businessId: string,
  opts: { search?: string; stock?: string; skip: number; take: number },
) {
  const where: Prisma.ProductWhereInput = {
    businessId,
    status: "active",
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: "insensitive" } },
            { sku: { contains: opts.search, mode: "insensitive" } },
            { barcode: { contains: opts.search } },
          ],
        }
      : {}),
    ...(opts.stock === "low"
      ? { stockQuantity: { gt: 0, lte: prisma.product.fields.lowStockThreshold } }
      : {}),
    ...(opts.stock === "out" ? { stockQuantity: { lte: 0 } } : {}),
  };
  return Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.product.count({ where }),
  ]);
}

export async function getProduct(businessId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, businessId },
    include: { category: true },
  });
  if (!product) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Product not found", 404);
  }
  return product;
}

export interface ProductInput {
  name: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  buyingPrice?: number;
  sellingPrice?: number;
  unit?: string;
  image?: string;
  lowStockThreshold?: number;
  openingStock?: number;
}

export async function createProduct(
  businessId: string,
  userId: string,
  input: ProductInput,
) {
  if (input.categoryId) {
    const cat = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, businessId },
    });
    if (!cat) throw AppError.validation({ categoryId: ["Invalid category"] });
  }
  const { openingStock, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...data, businessId } });
    if (openingStock && openingStock > 0) {
      await recordStockMovement(tx, {
        businessId,
        productId: product.id,
        type: "addition",
        quantity: openingStock,
        reason: "Opening stock",
        createdById: userId,
      });
    }
    return tx.product.findUniqueOrThrow({ where: { id: product.id } });
  });
}

export async function updateProduct(
  businessId: string,
  id: string,
  input: Partial<ProductInput>,
) {
  await getProduct(businessId, id);
  const { openingStock: _ignored, ...data } = input;
  return prisma.product.update({ where: { id }, data });
}

/** Soft-delete: products have stock/financial history — never hard delete. */
export async function archiveProduct(businessId: string, id: string) {
  await getProduct(businessId, id);
  return prisma.product.update({ where: { id }, data: { status: "inactive" } });
}

export async function adjustStock(
  businessId: string,
  userId: string,
  input: { productId: string; quantity: number; reason: string },
) {
  const product = await getProduct(businessId, input.productId);
  return prisma.$transaction(async (tx) => {
    const updated = await recordStockMovement(tx, {
      businessId,
      productId: product.id,
      type: "adjustment",
      quantity: input.quantity,
      reason: input.reason,
      createdById: userId,
    });
    if (updated.stockQuantity.lt(0)) {
      throw AppError.validation({
        quantity: [`Insufficient stock (have ${product.stockQuantity})`],
      });
    }
    return updated;
  });
}
