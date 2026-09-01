import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';
import { StockHistory,IStockHistory } from '../models/stockHistory.model';
import { Product } from '../models/product.model';

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
    costOfGoodsSold: number;
    grossProfit: number;             // totalRevenue - costOfGoodsSold
    grossMargin: number;             // grossProfit / totalRevenue * 100
    totalExpenses: number;
    netProfit: number;               // grossProfit - totalExpenses (i.e. revenue - COGS - expenses)
    profitMargin: number;            // netProfit / totalRevenue * 100
    expenseBreakdown: Array<{ name: string; value: number }>;
  };

  cashFlow: {
    beginningBalance: number;
    cashInflows: number;
    cashOutflows: number;
    endingBalance: number;
    burnRate: number;                // avg daily expense in range (gross — unchanged meaning)
    netBurnRate: number;             // avg daily (expense - revenue), based on elapsed days only; 0 if revenue covers spend
    runway: number;                  // days until cash runs out at current NET burn rate; -1 = not burning (revenue covers expenses)
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
    totalCost: number;
    grossProfit: number;
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

  stockHistory: IStockHistory[];

  summary: {
    periodDays: number;
    isProfit: boolean;
    biggestExpenseCategory: string;
    bestPaymentMethod: string;
  };
}

export interface ProductReportData {
  range: ReportRange;

  product: {
    id: string;
    name: string;
    type: string;
    price: number;
    costPrice: number;
    trackStock: boolean;
    stock: number;
  };

  summary: {
    totalUnitsSold: number;
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    grossMargin: number;
    transactionCount: number;
    avgSellingPrice: number;
    avgUnitsPerTransaction: number;
  };

  revenueByDay: Array<{ date: string; revenue: number; unitsSold: number; profit: number }>;

  byPaymentMethod: Array<{ method: string; total: number; count: number; percentage: number }>;

  topCustomers: Array<{
    customerId: string;
    name: string;
    totalSpent: number;
    unitsBought: number;
    transactionCount: number;
    lastPurchaseDate: Date;
  }>;

  growthMetrics: {
    revenueGrowth: number | null;
    unitsSoldGrowth: number | null;
    profitGrowth: number | null;
  };

  stockMovements: IStockHistory[];
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

export function resolveRange(
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
    const now  = new Date();

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

      stockHistory,
    ] = await Promise.all([

      // ── Current period revenue + cost of goods sold ────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, totalCost: { $sum: '$costAmount' }, count: { $sum: 1 } } },
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
            totalCost:  { $sum: '$costAmount' },
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
            totalCost:    1,
            grossProfit:  { $subtract: ['$totalRev', '$totalCost'] },
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

      // ── Revenue + cost by day (for trend chart) ────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
            cost:  { $sum: '$costAmount' },
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

      // ── Previous period revenue + cost ─────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' }, totalCost: { $sum: '$costAmount' } } },
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


      // To this:
      StockHistory.find({ userId, createdAt: { $gte: start, $lte: end } })
        .sort({ createdAt: -1 })
        .populate('productId')
        .select('-__v -createdAt -updatedAt')
        .lean(),
          ]);

    // ── Compute base values ───────────────────────────────────────────────────

    // Revenue and cost of goods sold — accrual figures for P&L, not cash flow
    // (costAmount is a memo for margin math, not a recorded cash transaction;
    // the actual cash outflow only exists if/when that purchase is separately
    // logged as an Expense — see the cashFlow block below, deliberately
    // unchanged, for why COGS isn't subtracted there too).
    const totalRevenue   = revenueResult[0]?.total     ?? 0;
    const costOfGoodsSold = revenueResult[0]?.totalCost ?? 0;
    const grossProfit    = totalRevenue - costOfGoodsSold;
    const grossMargin    = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

    const totalExpenses  = expenseByCategory.reduce((s: number, c: any) => s + c.value, 0);
    const netProfit      = grossProfit - totalExpenses;
    const profitMargin   = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

    const prevRev        = prevRevenue[0]?.total     ?? 0;
    const prevCost        = prevRevenue[0]?.totalCost ?? 0;
    const prevExp         = prevExpenses[0]?.total    ?? 0;
    const prevProfit      = (prevRev - prevCost) - prevExp;
    const prevTxCount     = prevTransactions[0]?.count ?? 0;

    // Cash flow intentionally uses totalExpenses only, not COGS — see note above.
    const beginningBalance = (allTimeIncomeBefore[0]?.total ?? 0) - (allTimeExpensesBefore[0]?.total ?? 0);
    const endingBalance    = beginningBalance + totalRevenue - totalExpenses;

    const avgRevenuePerDay  = Math.round(totalRevenue  / days);
    const avgExpensePerDay  = Math.round(totalExpenses / days);
    const avgTxValue        = transactionCount > 0 ? Math.round(totalRevenue / transactionCount) : 0;

    const burnRate = avgExpensePerDay;

    // Runway must be based on NET burn (expenses minus revenue, not gross
    // expenses) — a business whose revenue covers its spend isn't burning
    // cash at all. It must also be based on how much of the range has
    // actually ELAPSED, not the full range length — for an in-progress
    // period like "this-month" on day 12 of 31, dividing by 31 dilutes the
    // real current pace. For a fully-past range (e.g. "last-month"), elapsed
    // days naturally equals the full range, so behavior there is unchanged.
    const elapsedEnd  = end < now ? end : now;
    const elapsedDays = elapsedEnd > start ? daysBetween(start, elapsedEnd) : 1;
    const netBurnRate = Math.max(0, Math.round((totalExpenses - totalRevenue) / elapsedDays));

    let runway: number;
    if (netBurnRate <= 0) {
      runway = -1;                 // not burning — revenue covers (or exceeds) expenses
    } else if (endingBalance <= 0) {
      runway = 0;                  // already out of cash
    } else {
      runway = Math.floor(endingBalance / netBurnRate);
    }

    // ── Payment method breakdown ───────────────────────────────────────────────

    const byPaymentMethod = incomeByPaymentMethod.map((m: any) => ({
      method:     m._id ?? 'Unknown',
      total:      m.total,
      count:      m.count,
      percentage: totalRevenue > 0 ? Math.round((m.total / totalRevenue) * 1000) / 10 : 0,
    }));

    // ── Day-by-day trend ──────────────────────────────────────────────────────

    const revMap  = new Map(revenueByDay.map((r: any) => [r._id, r.total]));
    const costMap = new Map(revenueByDay.map((r: any) => [r._id, r.cost]));
    const expMap  = new Map(expenseByDay.map((r: any)  => [r._id, r.total]));

    const revenueByDayArr: Array<{ date: string; revenue: number; expenses: number; profit: number }> = [];
    for (let i = 0; i < days; i++) {
      const d   = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key  = d.toISOString().split('T')[0];
      const rev  = revMap.get(key)  ?? 0;
      const cost = costMap.get(key) ?? 0;
      const exp  = expMap.get(key)  ?? 0;
      revenueByDayArr.push({ date: key, revenue: rev, expenses: exp, profit: rev - cost - exp });
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
        costOfGoodsSold,
        grossProfit,
        grossMargin,
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
        netBurnRate,
        runway,   // -1 = not burning, 0 = already out of cash
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

      stockHistory, 

      summary: {
        periodDays:             days,
        isProfit:               netProfit >= 0,
        biggestExpenseCategory,
        bestPaymentMethod,
      },
    };
  }

  async getProductReport(
    userId: string,
    productId: string,
    rangeKey: DateRangeKey,
    customStart?: string,
    customEnd?: string
  ): Promise<ProductReportData> {
    const product = await Product.findOne({ _id: productId, userId }).lean();
    if (!product) {
      throw new Error('Product not found.');
    }

    const { start, end, prevStart, prevEnd, label } = resolveRange(rangeKey, customStart, customEnd);
    const days = daysBetween(start, end);

    const [
      revenueResult,
      byPaymentMethodResult,
      revenueByDayResult,
      topCustomersResult,
      prevRevenueResult,
      stockMovements,
    ] = await Promise.all([

      // ── Totals for this product in range ───────────────────────────────────
      Income.aggregate([
        { $match: { userId, productId: product._id, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalCost:    { $sum: '$costAmount' },
            unitsSold:    { $sum: '$unit' },
            count:        { $sum: 1 },
          },
        },
      ]),

      // ── Payment method breakdown for this product ───────────────────────────
      Income.aggregate([
        { $match: { userId, productId: product._id, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      // ── Revenue/units by day for this product ───────────────────────────────
      Income.aggregate([
        { $match: { userId, productId: product._id, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
            cost:  { $sum: '$costAmount' },
            units: { $sum: '$unit' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // ── Top 5 customers of this product ──────────────────────────────────────
      Income.aggregate([
        { $match: { userId, productId: product._id, date: { $gte: start, $lte: end }, customerId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id:          '$customerId',
            totalSpent:   { $sum: '$amount' },
            unitsBought:  { $sum: '$unit' },
            txCount:      { $sum: 1 },
            lastPurchase: { $max: '$date' },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'customers', localField: '_id',
            foreignField: '_id', as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            customerId:       '$_id',
            name:             { $ifNull: ['$customer.name', 'Unknown Customer'] },
            totalSpent:       1,
            unitsBought:      1,
            transactionCount: '$txCount',
            lastPurchaseDate: '$lastPurchase',
          },
        },
      ]),

      // ── Previous period totals (for growth) ─────────────────────────────────
      Income.aggregate([
        { $match: { userId, productId: product._id, date: { $gte: prevStart, $lte: prevEnd } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalCost:    { $sum: '$costAmount' },
            unitsSold:    { $sum: '$unit' },
          },
        },
      ]),

      // ── Stock movements for this product in range ───────────────────────────
      StockHistory.find({ userId, productId: String(product._id), createdAt: { $gte: start, $lte: end } })
        .sort({ createdAt: -1 })
        .select('-__v')
        .lean(),
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue ?? 0;
    const totalCost    = revenueResult[0]?.totalCost    ?? 0;
    const unitsSold    = revenueResult[0]?.unitsSold    ?? 0;
    const txCount      = revenueResult[0]?.count         ?? 0;
    const grossProfit  = totalRevenue - totalCost;
    const grossMargin  = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

    const prevRevenue  = prevRevenueResult[0]?.totalRevenue ?? 0;
    const prevCost     = prevRevenueResult[0]?.totalCost    ?? 0;
    const prevUnits    = prevRevenueResult[0]?.unitsSold    ?? 0;
    const prevProfit   = prevRevenue - prevCost;

    const byPaymentMethod = byPaymentMethodResult.map((m: any) => ({
      method:     m._id ?? 'Unknown',
      total:      m.total,
      count:      m.count,
      percentage: totalRevenue > 0 ? Math.round((m.total / totalRevenue) * 1000) / 10 : 0,
    }));

    const revMap   = new Map(revenueByDayResult.map((r: any) => [r._id, r.total]));
    const costMap  = new Map(revenueByDayResult.map((r: any) => [r._id, r.cost]));
    const unitsMap = new Map(revenueByDayResult.map((r: any) => [r._id, r.units]));

    const revenueByDay: Array<{ date: string; revenue: number; unitsSold: number; profit: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key   = d.toISOString().split('T')[0];
      const rev   = revMap.get(key)   ?? 0;
      const cost  = costMap.get(key)  ?? 0;
      const units = unitsMap.get(key) ?? 0;
      revenueByDay.push({ date: key, revenue: rev, unitsSold: units, profit: rev - cost });
    }

    return {
      range: label,

      product: {
        id:         String(product._id),
        name:       product.name,
        type:       product.type,
        price:      product.price,
        costPrice:  product.costPrice ?? 0,
        trackStock: product.trackStock,
        stock:      product.stock,
      },

      summary: {
        totalUnitsSold: unitsSold,
        totalRevenue,
        totalCost,
        grossProfit,
        grossMargin,
        transactionCount: txCount,
        avgSellingPrice: txCount > 0 ? Math.round((totalRevenue / txCount) * 100) / 100 : 0,
        avgUnitsPerTransaction: txCount > 0 ? Math.round((unitsSold / txCount) * 100) / 100 : 0,
      },

      revenueByDay,

      byPaymentMethod,

      topCustomers: topCustomersResult,

      growthMetrics: {
        revenueGrowth:   growthRate(totalRevenue, prevRevenue),
        unitsSoldGrowth: growthRate(unitsSold,     prevUnits),
        profitGrowth:    growthRate(grossProfit,   prevProfit),
      },

      stockMovements,
    };
  }

}

export default new ReportsService();