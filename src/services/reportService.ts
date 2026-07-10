import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRangeKey = 'this-month' | 'last-month' | 'this-year' | 'custom';

export interface ReportRange {
  key: DateRangeKey;
  startDate: string;   // ISO date string "YYYY-MM-DD"
  endDate: string;
}

export interface ReportsData {
  range: ReportRange;
  profitAndLoss: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    expenseBreakdown: Array<{ name: string; value: number }>;
  };
  cashFlow: {
    beginningBalance: number;   // all income − all expenses BEFORE the range start
    cashInflows: number;        // income within range
    cashOutflows: number;       // expenses within range
    endingBalance: number;      // beginningBalance + inflows − outflows
  };
  expenseReport: {
    totalExpense: number;
    categories: Array<{ name: string; value: number; percentage: number }>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function utcDate(y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min, s, ms));
}

function resolveRange(
  key: DateRangeKey,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: ReportRange } {
  const now = new Date();
  const y   = now.getUTCFullYear();
  const m   = now.getUTCMonth();

  let start: Date;
  let end: Date;

  switch (key) {
    case 'this-month':
      start = utcDate(y, m, 1);
      end   = utcDate(y, m + 1, 0, 23, 59, 59, 999);
      break;

    case 'last-month':
      start = utcDate(y, m - 1, 1);
      end   = utcDate(y, m, 0, 23, 59, 59, 999);
      break;

    case 'this-year':
      start = utcDate(y, 0, 1);
      end   = utcDate(y, 11, 31, 23, 59, 59, 999);
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
      if (start > end) {
        throw new Error('startDate must be before endDate.');
      }
      break;

    default:
      throw new Error(`Invalid range key: "${key}". Use this-month | last-month | this-year | custom.`);
  }

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  return {
    start,
    end,
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
    const { start, end, label } = resolveRange(rangeKey, customStart, customEnd);

    const [
      revenueResult,
      expenseByCategory,
      allTimeIncomeBefore,
      allTimeExpensesBefore,
    ] = await Promise.all([

      // ── Total revenue in range ─────────────────────────────────────────────
      Income.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── Expenses grouped by category in range ─────────────────────────────
      Expense.aggregate([
        { $match: { userId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   '$categoryId',
            total: { $sum: '$amount' },
          },
        },
        {
          $lookup: {
            from:         'expensecategories',
            localField:   '_id',
            foreignField: '_id',
            as:           'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name:  { $ifNull: ['$category.name', 'Uncategorized'] },
            value: '$total',
          },
        },
        { $sort: { value: -1 } },
      ]),

      // ── Beginning balance: all income BEFORE range start ──────────────────
      Income.aggregate([
        { $match: { userId, date: { $lt: start } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // ── Beginning balance: all expenses BEFORE range start ────────────────
      Expense.aggregate([
        { $match: { userId, date: { $lt: start } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    // ── Compute values ────────────────────────────────────────────────────────

    const totalRevenue   = revenueResult[0]?.total ?? 0;
    const totalExpenses  = expenseByCategory.reduce((sum: number, c: any) => sum + c.value, 0);
    const netProfit      = totalRevenue - totalExpenses;

    const beginningBalance = (allTimeIncomeBefore[0]?.total ?? 0) - (allTimeExpensesBefore[0]?.total ?? 0);
    const endingBalance    = beginningBalance + totalRevenue - totalExpenses;

    // ── Expense breakdown with percentages ────────────────────────────────────

    const categoriesWithPct = expenseByCategory.map((c: any) => ({
      name:       c.name,
      value:      c.value,
      percentage: totalExpenses > 0
        ? Math.round((c.value / totalExpenses) * 1000) / 10   // 1 decimal e.g. 94.9
        : 0,
    }));

    return {
      range: label,

      profitAndLoss: {
        totalRevenue,
        totalExpenses,
        netProfit,
        expenseBreakdown: expenseByCategory.map((c: any) => ({
          name:  c.name,
          value: c.value,
        })),
      },

      cashFlow: {
        beginningBalance,
        cashInflows:  totalRevenue,
        cashOutflows: totalExpenses,
        endingBalance,
      },

      expenseReport: {
        totalExpense: totalExpenses,
        categories:   categoriesWithPct,
      },
    };
  }

}

export default new ReportsService();