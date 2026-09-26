import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/api/errors";
import { Prisma } from "@/generated/client";

/**
 * Reusable report engine (spec §23). All reports are business-scoped,
 * permission-checked upstream and accept standard date ranges.
 * Adding a report = adding a case in `runReport`.
 */

export type ReportType =
  | "sales"
  | "profit"
  | "expenses"
  | "inventory"
  | "customers"
  | "debts"
  | "summary";

export interface ReportRange {
  from: Date;
  to: Date;
}

export function resolveRange(sp: URLSearchParams): ReportRange {
  const range = sp.get("range") ?? "this_month";
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);

  switch (range) {
    case "today":
      return { from: today, to: now };
    case "yesterday": {
      const from = new Date(today);
      from.setDate(from.getDate() - 1);
      return { from, to: today };
    }
    case "this_week": {
      const from = new Date(today);
      from.setDate(from.getDate() - from.getDay());
      return { from, to: now };
    }
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from, to: new Date(now.getFullYear(), now.getMonth(), 1) };
    }
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case "custom": {
      const from = sp.get("from");
      const to = sp.get("to");
      if (!from || !to) {
        throw AppError.validation({ range: ["Custom range requires from and to"] });
      }
      return { from: new Date(from), to: new Date(to) };
    }
    default:
      throw AppError.validation({ range: [`Unknown range '${range}'`] });
  }
}

const D = Prisma.Decimal;

export async function runReport(
  businessId: string,
  type: ReportType,
  range: ReportRange,
): Promise<Record<string, unknown>> {
  const inRange = { gte: range.from, lte: range.to };

  switch (type) {
    case "sales": {
      const [agg, byDay, topProducts, byMethod] = await Promise.all([
        prisma.sale.aggregate({
          where: { businessId, status: "completed", createdAt: inRange },
          _count: true,
          _sum: { total: true, discount: true, tax: true },
        }),
        prisma.$queryRaw<{ day: string; total: string; count: bigint }[]>`
          SELECT to_char("createdAt", 'YYYY-MM-DD') AS day,
                 SUM(total)::text AS total, COUNT(*) AS count
          FROM sale
          WHERE "businessId" = ${businessId} AND status = 'completed'
            AND "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
          GROUP BY day ORDER BY day`,
        prisma.saleItem.groupBy({
          by: ["productId"],
          where: { sale: { businessId, status: "completed", createdAt: inRange } },
          _sum: { quantity: true, total: true },
          orderBy: { _sum: { total: "desc" } },
          take: 10,
        }),
        prisma.sale.groupBy({
          by: ["paymentMethodId"],
          where: { businessId, status: "completed", createdAt: inRange },
          _sum: { total: true },
          _count: true,
        }),
      ]);
      const names = new Map(
        (
          await prisma.product.findMany({
            where: { id: { in: topProducts.map((t) => t.productId) } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      return {
        count: agg._count,
        total: agg._sum.total ?? 0,
        discount: agg._sum.discount ?? 0,
        tax: agg._sum.tax ?? 0,
        byDay: byDay.map((r) => ({ day: r.day, total: r.total, count: Number(r.count) })),
        topProducts: topProducts.map((t) => ({
          product: names.get(t.productId) ?? t.productId,
          quantity: t._sum.quantity,
          total: t._sum.total,
        })),
        byPaymentMethod: byMethod,
      };
    }

    case "profit": {
      const sales = await prisma.sale.aggregate({
        where: { businessId, status: "completed", createdAt: inRange },
        _sum: { total: true },
      });
      const cogs = await prisma.saleItem.findMany({
        where: { sale: { businessId, status: "completed", createdAt: inRange } },
        select: { quantity: true, product: { select: { buyingPrice: true } } },
      });
      const expenses = await prisma.expense.aggregate({
        where: { businessId, date: inRange },
        _sum: { amount: true },
      });
      const costOfGoods = cogs.reduce(
        (acc, i) => acc.add(new D(i.quantity).mul(i.product.buyingPrice)),
        new D(0),
      );
      const revenue = new D(sales._sum.total ?? 0);
      const expenseTotal = new D(expenses._sum.amount ?? 0);
      return {
        revenue,
        costOfGoods,
        grossProfit: revenue.sub(costOfGoods),
        expenses: expenseTotal,
        netProfit: revenue.sub(costOfGoods).sub(expenseTotal),
      };
    }

    case "expenses": {
      const [agg, byCategory] = await Promise.all([
        prisma.expense.aggregate({
          where: { businessId, date: inRange },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.expense.groupBy({
          by: ["categoryId"],
          where: { businessId, date: inRange },
          _sum: { amount: true },
          _count: true,
        }),
      ]);
      const cats = new Map(
        (
          await prisma.expenseCategory.findMany({
            where: { id: { in: byCategory.map((c) => c.categoryId ?? "") } },
            select: { id: true, name: true },
          })
        ).map((c) => [c.id, c.name]),
      );
      return {
        total: agg._sum.amount ?? 0,
        count: agg._count,
        byCategory: byCategory.map((c) => ({
          category: cats.get(c.categoryId ?? "") ?? "Uncategorized",
          total: c._sum.amount,
          count: c._count,
        })),
      };
    }

    case "inventory": {
      const products = await prisma.product.findMany({
        where: { businessId, status: "active" },
        select: { id: true, name: true, sku: true, stockQuantity: true, lowStockThreshold: true, unit: true },
        orderBy: { name: "asc" },
      });
      const lowStock = products.filter(
        (p) => p.lowStockThreshold !== null && p.stockQuantity.lte(p.lowStockThreshold),
      );
      const stockValue = products.reduce(
        (acc, p) => acc.add(new D(p.stockQuantity)),
        new D(0),
      );
      return {
        totalProducts: products.length,
        totalUnits: stockValue,
        lowStockCount: lowStock.length,
        lowStock: lowStock.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.stockQuantity,
          threshold: p.lowStockThreshold,
        })),
        products,
      };
    }

    case "customers": {
      const [total, topBySpend] = await Promise.all([
        prisma.customer.count({ where: { businessId, status: "active" } }),
        prisma.sale.groupBy({
          by: ["customerId"],
          where: { businessId, status: "completed", createdAt: inRange, customerId: { not: null } },
          _sum: { total: true },
          _count: true,
          orderBy: { _sum: { total: "desc" } },
          take: 20,
        }),
      ]);
      const names = new Map(
        (
          await prisma.customer.findMany({
            where: { id: { in: topBySpend.map((c) => c.customerId!) } },
            select: { id: true, name: true },
          })
        ).map((c) => [c.id, c.name]),
      );
      return {
        totalCustomers: total,
        topCustomers: topBySpend.map((c) => ({
          customer: names.get(c.customerId!) ?? c.customerId,
          sales: c._count,
          total: c._sum.total,
        })),
      };
    }

    case "debts": {
      const debts = await prisma.debt.findMany({
        where: { businessId, status: { in: ["open", "partial", "overdue"] } },
        include: { customer: { select: { name: true } }, supplier: { select: { name: true } } },
      });
      const owedToUs = debts
        .filter((d) => d.direction === "customer_owes")
        .reduce((a, d) => a.add(new D(d.originalAmount).sub(d.paidAmount)), new D(0));
      const weOwe = debts
        .filter((d) => d.direction === "business_owes")
        .reduce((a, d) => a.add(new D(d.originalAmount).sub(d.paidAmount)), new D(0));
      const now = new Date();
      return {
        owedToUs,
        weOwe,
        overdueCount: debts.filter((d) => d.dueDate && d.dueDate < now).length,
        items: debts.map((d) => ({
          id: d.id,
          direction: d.direction,
          party: d.customer?.name ?? d.supplier?.name ?? "—",
          original: d.originalAmount,
          paid: d.paidAmount,
          remaining: new D(d.originalAmount).sub(d.paidAmount),
          dueDate: d.dueDate,
          status: d.status,
        })),
      };
    }

    case "summary": {
      const [sales, expenses, products, customers, members] = await Promise.all([
        prisma.sale.aggregate({
          where: { businessId, status: "completed", createdAt: inRange },
          _sum: { total: true },
          _count: true,
        }),
        prisma.expense.aggregate({
          where: { businessId, date: inRange },
          _sum: { amount: true },
        }),
        prisma.product.count({ where: { businessId, status: "active" } }),
        prisma.customer.count({ where: { businessId, status: "active" } }),
        prisma.membership.count({ where: { businessId, status: "active" } }),
      ]);
      return {
        salesTotal: sales._sum.total ?? 0,
        salesCount: sales._count,
        expensesTotal: expenses._sum.amount ?? 0,
        productCount: products,
        customerCount: customers,
        memberCount: members,
      };
    }

    default:
      throw AppError.validation({ type: [`Unknown report '${type}'`] });
  }
}

export const REPORT_TYPES: ReportType[] = [
  "sales",
  "profit",
  "expenses",
  "inventory",
  "customers",
  "debts",
  "summary",
];
