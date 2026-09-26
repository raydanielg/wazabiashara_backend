import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { Prisma } from "@/generated/client";
import { recordStockMovement } from "./catalog";
import { emit } from "@/lib/events";

const Decimal = Prisma.Decimal;

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
}

export interface CreateSaleInput {
  customerId?: string;
  saleType?: "cash" | "credit";
  paymentMethodId?: string;
  discount?: number;
  tax?: number;
  notes?: string;
  items: SaleItemInput[];
  idempotencyKey?: string;
}

/**
 * Create a sale atomically (spec §52):
 * sale -> items -> stock decrement (movement rows) -> payment / debt.
 * Any failure rolls the whole thing back. Idempotent via idempotencyKey.
 */
export async function createSale(
  businessId: string,
  userId: string,
  input: CreateSaleInput,
) {
  if (input.idempotencyKey) {
    const existing = await prisma.sale.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) return existing;
  }
  if (input.saleType === "credit" && !input.customerId) {
    throw AppError.validation({ customerId: ["Credit sales require a customer"] });
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId, status: "active" },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) {
      throw AppError.validation({ items: [`Product ${item.productId} not found`] });
    }
    if (p.stockQuantity.lt(item.quantity)) {
      throw AppError.validation({
        items: [`Insufficient stock for "${p.name}" (have ${p.stockQuantity})`],
      });
    }
  }

  let subtotal = new Decimal(0);
  const itemRows = input.items.map((item) => {
    const p = byId.get(item.productId)!;
    const unitPrice = new Decimal(item.unitPrice ?? p.sellingPrice);
    const discount = new Decimal(item.discount ?? 0);
    const total = unitPrice.sub(discount).mul(item.quantity);
    subtotal = subtotal.add(total);
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      discount,
      total,
    };
  });

  const discount = new Decimal(input.discount ?? 0);
  const tax = new Decimal(input.tax ?? 0);
  const total = subtotal.sub(discount).add(tax);
  if (total.lt(0)) throw AppError.validation({ discount: ["Total cannot be negative"] });

  const receiptNo = `R-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          businessId,
          receiptNo,
          customerId: input.customerId,
          saleType: input.saleType ?? "cash",
          subtotal,
          discount,
          tax,
          total,
          paymentMethodId: input.paymentMethodId,
          soldById: userId,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          items: { create: itemRows },
        },
        include: { items: true },
      });

      for (const row of itemRows) {
        const updated = await recordStockMovement(tx, {
          businessId,
          productId: row.productId,
          type: "sale",
          quantity: new Decimal(row.quantity).neg(),
          reason: `Sale ${receiptNo}`,
          referenceType: "sale",
          referenceId: sale.id,
          createdById: userId,
        });
        if (updated.stockQuantity.lt(0)) {
          throw AppError.validation({
            items: [`Insufficient stock for product ${row.productId}`],
          });
        }
      }

      if ((input.saleType ?? "cash") === "cash") {
        await tx.payment.create({
          data: {
            businessId,
            saleId: sale.id,
            amount: total,
            paymentMethodId: input.paymentMethodId,
          },
        });
      } else {
        await tx.debt.create({
          data: {
            businessId,
            direction: "customer_owes",
            customerId: input.customerId,
            saleId: sale.id,
            originalAmount: total,
            status: "open",
          },
        });
      }
      return sale;
    });

    await emit("sale.created", { businessId, saleId: sale.id, total: String(sale.total) });

    // Low stock check post-commit
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const after = await prisma.product.findMany({
      where: { id: { in: productIds }, lowStockThreshold: { not: null } },
    });
    for (const p of after) {
      if (p.lowStockThreshold !== null && p.stockQuantity.lte(p.lowStockThreshold)) {
        await emit("stock.low", {
          businessId,
          businessName: business?.name ?? "",
          productName: p.name,
          stock: String(p.stockQuantity),
          threshold: String(p.lowStockThreshold),
          message: `${p.name} is at ${p.stockQuantity} (threshold ${p.lowStockThreshold})`,
        });
      }
    }
    return sale;
  } catch (e) {
    if (
      e instanceof Error &&
      "code" in e &&
      (e as { code: string }).code === "P2002" &&
      input.idempotencyKey
    ) {
      const existing = await prisma.sale.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { items: true },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

export function listSales(
  businessId: string,
  opts: { skip: number; take: number; status?: string; from?: string; to?: string; search?: string },
) {
  const where: Prisma.SaleWhereInput = {
    businessId,
    ...(opts.status ? { status: opts.status as Prisma.SaleWhereInput["status"] } : {}),
    ...(opts.from || opts.to
      ? {
          createdAt: {
            ...(opts.from ? { gte: new Date(opts.from) } : {}),
            ...(opts.to ? { lte: new Date(`${opts.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { receiptNo: { contains: opts.search, mode: "insensitive" } },
            { customer: { name: { contains: opts.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  return Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: true, customer: { select: { id: true, name: true } }, paymentMethod: true },
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.sale.count({ where }),
  ]);
}

export async function getSale(businessId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, businessId },
    include: { items: { include: { product: true } }, payments: true, customer: true, debts: true },
  });
  if (!sale) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Sale not found", 404);
  }
  return sale;
}

/** Cancel a sale: restock items + mark cancelled, atomically. */
export async function cancelSale(businessId: string, userId: string, id: string) {
  const sale = await getSale(businessId, id);
  if (sale.status !== "completed") {
    throw AppError.validation({ status: [`Sale is already ${sale.status}`] });
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: { status: "cancelled" },
    });
    for (const item of sale.items) {
      await recordStockMovement(tx, {
        businessId,
        productId: item.productId,
        type: "adjustment",
        quantity: item.quantity,
        reason: `Sale ${sale.receiptNo} cancelled`,
        referenceType: "sale",
        referenceId: sale.id,
        createdById: userId,
      });
    }
    return updated;
  });
}
