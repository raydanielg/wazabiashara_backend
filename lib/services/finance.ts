import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { Prisma } from "@/generated/client";

const Decimal = Prisma.Decimal;

// ---------- Expenses ----------

export function listExpenses(
  businessId: string,
  opts: { skip: number; take: number },
) {
  return Promise.all([
    prisma.expense.findMany({
      where: { businessId },
      include: { category: true, paymentMethod: true },
      orderBy: { date: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.expense.count({ where: { businessId } }),
  ]);
}

export interface ExpenseInput {
  categoryId?: string;
  amount: number;
  description?: string;
  paymentMethodId?: string;
  date?: string;
  attachment?: string;
}

export async function createExpense(
  businessId: string,
  userId: string,
  input: ExpenseInput,
) {
  if (input.categoryId) {
    const cat = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, businessId },
    });
    if (!cat) throw AppError.validation({ categoryId: ["Invalid category"] });
  }
  return prisma.expense.create({
    data: {
      ...input,
      date: input.date ? new Date(input.date) : undefined,
      businessId,
      createdById: userId,
    },
  });
}

// ---------- Debts ----------

export function listDebts(
  businessId: string,
  opts: { skip: number; take: number; direction?: string },
) {
  const where: Prisma.DebtWhereInput = {
    businessId,
    ...(opts.direction
      ? { direction: opts.direction as Prisma.DebtWhereInput["direction"] }
      : {}),
  };
  return Promise.all([
    prisma.debt.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        supplier: { select: { id: true, name: true, phone: true } },
        sale: { select: { id: true, receiptNo: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.debt.count({ where }),
  ]);
}

export interface DebtInput {
  direction: "customer_owes" | "business_owes";
  customerId?: string;
  supplierId?: string;
  amount: number;
  dueDate?: string;
  notes?: string;
}

export async function createDebt(businessId: string, input: DebtInput) {
  if (input.direction === "customer_owes") {
    if (!input.customerId) {
      throw AppError.validation({ customerId: ["Customer debts require a customer"] });
    }
    const c = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!c) throw AppError.validation({ customerId: ["Invalid customer"] });
  } else {
    if (!input.supplierId) {
      throw AppError.validation({ supplierId: ["Supplier debts require a supplier"] });
    }
    const s = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId } });
    if (!s) throw AppError.validation({ supplierId: ["Invalid supplier"] });
  }
  return prisma.debt.create({
    data: {
      businessId,
      direction: input.direction,
      customerId: input.customerId,
      supplierId: input.supplierId,
      originalAmount: input.amount,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      notes: input.notes,
      status: "open",
    },
  });
}

export async function getDebt(businessId: string, id: string) {
  const debt = await prisma.debt.findFirst({
    where: { id, businessId },
    include: { payments: { include: { paymentMethod: true } }, customer: true, supplier: true },
  });
  if (!debt) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Debt not found", 404);
  }
  return debt;
}

/** Record a debt payment and recompute status — atomically. */
export async function payDebt(
  businessId: string,
  userId: string,
  debtId: string,
  input: { amount: number; paymentMethodId?: string; note?: string },
) {
  const debt = await getDebt(businessId, debtId);
  if (debt.status === "paid" || debt.status === "cancelled") {
    throw AppError.validation({ status: [`Debt is ${debt.status}`] });
  }
  const amount = new Decimal(input.amount);
  const remaining = debt.originalAmount.sub(debt.paidAmount);
  if (amount.lte(0)) throw AppError.validation({ amount: ["Amount must be positive"] });
  if (amount.gt(remaining)) {
    throw AppError.validation({ amount: [`Amount exceeds remaining balance (${remaining})`] });
  }

  return prisma.$transaction(async (tx) => {
    await tx.debtPayment.create({
      data: {
        debtId: debt.id,
        amount,
        paymentMethodId: input.paymentMethodId,
        note: input.note,
        createdById: userId,
      },
    });
    const paidAmount = debt.paidAmount.add(amount);
    const status = paidAmount.gte(debt.originalAmount) ? "paid" : "partial";
    return tx.debt.update({ where: { id: debt.id }, data: { paidAmount, status } });
  });
}
