import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRangeKey = 'this-month' | 'last-month' | 'this-year' | 'custom';

export interface ReportRange {
  key: DateRangeKey;
  startDate: string;
  endDate: string;
}

export interface ReportsData {
  range: ReportRange;

  profitAndLoss: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;            // netProfit / totalRevenue * 100
    expenseBreakdown: Array<{ name: string; value: number }>;
  };

  cashFlow: {
    beginningBalance: number;
    cashInflows: number;
    cashOutflows: number;
    endingBalance: number;
    burnRate: number;                // avg daily expense in range
    runway: number;                  // days until cash runs out at current burn rate
  };

  expenseReport: {
    totalExpense: number;
    avgExpensePerDay: number;
    categories: Array<{ name: string; value: number; percentage: number }>;
  };

  revenueInsights: {
    totalRevenue: number;
    avgRevenuePerDay: number;
    avgTransactionValue: number;
    totalTransactions: number;
    byPaymentMethod: Array<{ method: string; total: number; count: number; percentage: number }>;
    revenueByDay: Array<{ date: string; revenue: number; expenses: number; profit: number }>;
  };

  topProducts: Array<{
    productId: string;
    name: string;
    totalRevenue: number;
    unitsSold: number;
    transactionCount: number;
    avgSellingPrice: number;
  }>;

  topCustomers: Array<{
    customerId: string;
    name: string;
    totalSpent: number;
    transactionCount: number;
    avgTransactionValue: number;
    lastPurchaseDate: Date;
  }>;

  growthMetrics: {
    revenueGrowth: number | null;       // % change vs previous period
    expenseGrowth: number | null;       // % change vs previous period
    profitGrowth: number | null;        // % change vs previous period
    transactionGrowth: number | null;   // % change vs previous period
  };

  summary: {
    periodDays: number;
    isProfit: boolean;
    biggestExpenseCategory: string;
    bestPaymentMethod: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utcDate(y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min, s, ms));
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function growthRate(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function resolveRange(
  key: DateRangeKey,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: ReportRange; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const y   = now.getUTCFullYear();
  const m   = now.getUTCMonth();

  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (key) {
    case 'this-month':
      start     = utcDate(y, m, 1);
      end       = utcDate(y, m + 1, 0, 23, 59, 59, 999);
      prevStart = utcDate(y, m - 1, 1);
      prevEnd   = utcDate(y, m, 0, 23, 59, 59, 999);
      break;

    case 'last-month':
      start     = utcDate(y, m - 1, 1);
      end       = utcDate(y, m, 0, 23, 59, 59, 999);
      prevStart = utcDate(y, m - 2, 1);
      prevEnd   = utcDate(y, m - 1, 0, 23, 59, 59, 999);
      break;

    case 'this-year':
      start     = utcDate(y, 0, 1);
      end       = utcDate(y, 11, 31, 23, 59, 59, 999);
      prevStart = utcDate(y - 1, 0, 1);
      prevEnd   = utcDate(y - 1, 11, 31, 23, 59, 59, 999);
      break;

    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error('startDate and endDate are required for custom range.');
      }
      start = new Date(`${customStart}T00:00:00.000Z`);
      end   = new Date(`${customEnd}T23:59:59.999Z`);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
      }
      if (start > end) throw new Error('startDate must be before endDate.');
      // Previous period = same duration before start
      const duration  = end.getTime() - start.getTime();
      prevEnd         = new Date(start.getTime() - 1);
      prevStart       = new Date(prevEnd.getTime() - duration);
      break;

    default:
      throw new Error(`Invalid range key: "${key}".`);
  }

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  return {
    start,
    end,
    prevStart,
    prevEnd,
    label: { key, startDate: fmt(start), endDate: fmt(end) },
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ReportsService {

  async getReports(
    userId: string,
    rangeKey: DateRangeKey,
    customStart?: string,
    customEnd?: string
  ): Promise<ReportsData> {
    const { start, end, prevStart, prevEnd, label } = resolveRange(rangeKey, customStart, customEnd);
    const days = daysBetween(start, end);

    const [
      // Current period
      revenueResult,
      expenseByCategory,
      incomeByPaymentMethod,
      topProductsResult,
      topCustomersResult,
      revenueByDay,
      expenseByDay,

      // Previous period (for growth metrics)
      prevRevenue,
      prevExpenses,
      prevTransactions,

      // All-time before range (for cash flow beginning balance)
      allTimeIncomeBefore,
      allTimeExpensesBefore,

      // Total transaction count current period
      transactionCount,
    ] = await Promise.all([

      // ── Current period revenue ─────────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      // ── Expenses by category ───────────────────────────────────────────────
      Expense.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
        {
          $lookup: {
            from: 'expensecategories', localField: '_id',
            foreignField: '_id', as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { name: { $ifNull: ['$category.name', 'Uncategorized'] }, value: '$total' } },
        { $sort: { value: -1 } },
      ]),

      // ── Revenue by payment method ──────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   '$paymentMethod',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // ── Top 3 products by revenue ──────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end }, productId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id:        '$productId',
            totalRev:   { $sum: '$amount' },
            unitsSold:  { $sum: '$unit' },
            txCount:    { $sum: 1 },
            avgPrice:   { $avg: '$amount' },
          },
        },
        { $sort: { totalRev: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: 'products', localField: '_id',
            foreignField: '_id', as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId:    '$_id',
            name:         { $ifNull: ['$product.name', 'Unknown Product'] },
            totalRevenue: '$totalRev',
            unitsSold:    1,
            transactionCount: '$txCount',
            avgSellingPrice:  { $round: ['$avgPrice', 2] },
          },
        },
      ]),

      // ── Top 3 customers by spend ───────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end }, customerId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id:             '$customerId',
            totalSpent:      { $sum: '$amount' },
            txCount:         { $sum: 1 },
            avgTx:           { $avg: '$amount' },
            lastPurchase:    { $max: '$date' },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: 'customers', localField: '_id',
            foreignField: '_id', as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            customerId:          '$_id',
            name:                { $ifNull: ['$customer.name', 'Unknown Customer'] },
            totalSpent:          1,
            transactionCount:    '$txCount',
            avgTransactionValue: { $round: ['$avgTx', 2] },
            lastPurchaseDate:    '$lastPurchase',
          },
        },
      ]),

      // ── Revenue by day (for trend chart) ──────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // ── Expenses by day ────────────────────────────────────────────────────
      Expense.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // ── Previous period revenue ────────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── Previous period expenses ───────────────────────────────────────────
      Expense.aggregate([
        { $match: { userId, date: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── Previous period transaction count ──────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),

      // ── All-time income before range ───────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $lt: start } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── All-time expenses before range ─────────────────────────────────────
      Expense.aggregate([
        { $match: { userId, date: { $lt: start } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── Total income transactions current period ───────────────────────────
      Income.countDocuments({ userId, date: { $gte: start, $lte: end } }),
    ]);

    // ── Compute base values ───────────────────────────────────────────────────

    const totalRevenue   = revenueResult[0]?.total    ?? 0;
    const totalExpenses  = expenseByCategory.reduce((s: number, c: any) => s + c.value, 0);
    const netProfit      = totalRevenue - totalExpenses;
    const profitMargin   = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

    const prevRev        = prevRevenue[0]?.total    ?? 0;
    const prevExp        = prevExpenses[0]?.total   ?? 0;
    const prevProfit     = prevRev - prevExp;
    const prevTxCount    = prevTransactions[0]?.count ?? 0;

    const beginningBalance = (allTimeIncomeBefore[0]?.total ?? 0) - (allTimeExpensesBefore[0]?.total ?? 0);
    const endingBalance    = beginningBalance + totalRevenue - totalExpenses;

    const avgRevenuePerDay  = Math.round(totalRevenue  / days);
    const avgExpensePerDay  = Math.round(totalExpenses / days);
    const avgTxValue        = transactionCount > 0 ? Math.round(totalRevenue / transactionCount) : 0;

    const burnRate = avgExpensePerDay;
    const runway   = burnRate > 0 ? Math.floor(endingBalance / burnRate) : Infinity;

    // ── Payment method breakdown ───────────────────────────────────────────────

    const byPaymentMethod = incomeByPaymentMethod.map((m: any) => ({
      method:     m._id ?? 'Unknown',
      total:      m.total,
      count:      m.count,
      percentage: totalRevenue > 0 ? Math.round((m.total / totalRevenue) * 1000) / 10 : 0,
    }));

    // ── Day-by-day trend ──────────────────────────────────────────────────────

    const revMap = new Map(revenueByDay.map((r: any) => [r._id, r.total]));
    const expMap = new Map(expenseByDay.map((r: any)  => [r._id, r.total]));

    const revenueByDayArr: Array<{ date: string; revenue: number; expenses: number; profit: number }> = [];
    for (let i = 0; i < days; i++) {
      const d   = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      const rev = revMap.get(key) ?? 0;
      const exp = expMap.get(key) ?? 0;
      revenueByDayArr.push({ date: key, revenue: rev, expenses: exp, profit: rev - exp });
    }

    // ── Expense categories with percentages ───────────────────────────────────

    const categoriesWithPct = expenseByCategory.map((c: any) => ({
      name:       c.name,
      value:      c.value,
      percentage: totalExpenses > 0 ? Math.round((c.value / totalExpenses) * 1000) / 10 : 0,
    }));

    // ── Summary helpers ───────────────────────────────────────────────────────

    const biggestExpenseCategory = expenseByCategory.length > 0
      ? expenseByCategory[0].name
      : 'None';

    const bestPaymentMethod = incomeByPaymentMethod.length > 0
      ? incomeByPaymentMethod[0]._id ?? 'Unknown'
      : 'None';

    return {
      range: label,

      profitAndLoss: {
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        expenseBreakdown: expenseByCategory.map((c: any) => ({ name: c.name, value: c.value })),
      },

      cashFlow: {
        beginningBalance,
        cashInflows:  totalRevenue,
        cashOutflows: totalExpenses,
        endingBalance,
        burnRate,
        runway: runway === Infinity ? -1 : runway,   // -1 means no burn (infinite runway)
      },

      expenseReport: {
        totalExpense:    totalExpenses,
        avgExpensePerDay,
        categories:      categoriesWithPct,
      },

      revenueInsights: {
        totalRevenue,
        avgRevenuePerDay,
        avgTransactionValue: avgTxValue,
        totalTransactions:   transactionCount,
        byPaymentMethod,
        revenueByDay:        revenueByDayArr,
      },

      topProducts: topProductsResult,

      topCustomers: topCustomersResult,

      growthMetrics: {
        revenueGrowth:     growthRate(totalRevenue,  prevRev),
        expenseGrowth:     growthRate(totalExpenses,  prevExp),
        profitGrowth:      growthRate(netProfit,      prevProfit),
        transactionGrowth: growthRate(transactionCount, prevTxCount),
      },

      summary: {
        periodDays:             days,
        isProfit:               netProfit >= 0,
        biggestExpenseCategory,
        bestPaymentMethod,
      },
    };
  }

}

export default new ReportsService();