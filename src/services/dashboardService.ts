import mongoose from 'mongoose';
import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';
import { Customer } from '../models/customer.model';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import ApiError from '../utils/ApiError';

// ─── Helpers (all boundaries in UTC to match MongoDB storage) ────────────────

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function utcStartOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function utcEndOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function utcDaysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return utcStartOfDay(d);
}

const CUSTOM_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DashboardPeriod = 'today' | 'yesterday' | 'custom' | 'month' | 'year';

export interface DashboardPeriodOptions {
  date?: string;   // "YYYY-MM-DD" — required when period=custom
  month?: number;  // 1-12 — required when period=month
  year?: number;   // e.g. 2026 — required when period=month or period=year
}

interface SelectedRange {
  start: Date;
  end: Date;
  label: string; // "2026-09-16" (day) | "2026-09" (month) | "2026" (year)
}

function isValidYear(year: unknown): year is number {
  return typeof year === 'number' && Number.isInteger(year) && year >= 2000 && year <= 9999;
}

// Resolves the date range a KPI quick-view should reflect. Only the
// range-scoped KPIs (salesToday, expensesToday, incomeCountToday,
// expenseCountToday, orderStatusBreakdown) move with this — profitThisMonth
// and all-time figures always reflect the real present, and last7Days always
// shows the trailing 7 real days, regardless of what's selected here.
function resolveSelectedRange(period: DashboardPeriod, options: DashboardPeriodOptions = {}): SelectedRange {
  switch (period) {
    case 'yesterday': {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      const start = utcStartOfDay(d);
      return { start, end: utcEndOfDay(d), label: start.toISOString().split('T')[0] };
    }
    case 'custom': {
      if (!options.date || !CUSTOM_DATE_PATTERN.test(options.date)) {
        throw new ApiError(400, 'A valid "date" query param (YYYY-MM-DD) is required when period=custom.');
      }
      const [year, month, day] = options.date.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== month - 1) {
        throw new ApiError(400, 'Invalid "date" query param — must be a real calendar date (YYYY-MM-DD).');
      }
      const start = utcStartOfDay(d);
      return { start, end: utcEndOfDay(d), label: start.toISOString().split('T')[0] };
    }
    case 'month': {
      if (!isValidYear(options.year) || !Number.isInteger(options.month) || (options.month as number) < 1 || (options.month as number) > 12) {
        throw new ApiError(400, 'Valid "year" and "month" (1-12) query params are required when period=month.');
      }
      const start = new Date(Date.UTC(options.year, options.month! - 1, 1, 0, 0, 0, 0));
      const end   = new Date(Date.UTC(options.year, options.month!, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this one
      const label = `${options.year}-${String(options.month).padStart(2, '0')}`;
      return { start, end, label };
    }
    case 'year': {
      if (!isValidYear(options.year)) {
        throw new ApiError(400, 'A valid "year" query param (e.g. 2026) is required when period=year.');
      }
      const start = new Date(Date.UTC(options.year, 0, 1, 0, 0, 0, 0));
      const end   = new Date(Date.UTC(options.year, 11, 31, 23, 59, 59, 999));
      return { start, end, label: String(options.year) };
    }
    case 'today':
    default: {
      const now = new Date();
      const start = utcStartOfDay(now);
      return { start, end: utcEndOfDay(now), label: start.toISOString().split('T')[0] };
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayPoint {
  date: string;
  income: number;
  expense: number;
  profit: number;
}

export interface RecentActivityItem {
  _id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: Date;
  createdAt: Date;
}

export interface DashboardData {
  period: DashboardPeriod;
  // "2026-06-21" for today/yesterday/custom, "2026-06" for month, "2026" for
  // year — the range salesToday/expensesToday/etc. below actually reflect.
  selectedDate: string;
  kpis: {
    salesToday: number;    // despite the name, reflects the selected range (day/month/year)
    expensesToday: number; // ditto
    profitThisMonth: number;        // true net profit: revenue - cost of goods sold - expenses
    grossProfitThisMonth: number;   // revenue - cost of goods sold (before operating expenses)
    costOfGoodsThisMonth: number;
    cashBalance: number;
    totalCustomers: number;
    totalStaff: number;
    totalIncomeCount: number;
    totalExpenseCount: number;
    incomeCountToday: number;
    expenseCountToday: number;
  };
  last7Days: DayPoint[];
  recentActivity: RecentActivityItem[];
  // Storefront order counts by status, scoped to the same selected range as
  // the KPIs above — feeds the orders pie chart.
  orderStatusBreakdown: {
    completed: number;
    pending: number;
    cancelled: number;
    failed: number;
  };
}

const RECENT_ACTIVITY_LIMIT = 6;

// ─── Service ──────────────────────────────────────────────────────────────────

class DashboardService {

  async getDashboard(
    userId: string,
    period: DashboardPeriod = 'today',
    periodOptions: DashboardPeriodOptions = {},
  ): Promise<DashboardData> {
    const now                    = new Date();
    const { start: rangeStart, end: rangeEnd, label: rangeLabel } = resolveSelectedRange(period, periodOptions);
    const monthStart             = utcStartOfMonth(now);
    const monthEnd               = utcEndOfMonth(now);
    const week7Start             = utcDaysAgo(6);
    // last7Days always shows the real trailing 7 days, independent of the
    // selected period — its end boundary is real "now", not rangeEnd.
    const last7DaysEnd           = utcEndOfDay(now);

    const [
      salesToday,
      expensesToday,
      incomeThisMonth,
      expensesThisMonth,
      allTimeIncome,
      allTimeExpenses,
      last7DaysIncome,
      last7DaysExpenses,
      recentIncome,
      recentExpenses,
      totalCustomers,
      totalStaff,
      orderStatusCounts,
    ] = await Promise.all([

      Income.aggregate([
        { $match: { userId, date: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Income.aggregate([
        { $match: { userId, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' }, totalCost: { $sum: '$costAmount' } } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Income.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Expense.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Income.aggregate([
        { $match: { userId, date: { $gte: week7Start, $lte: last7DaysEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
            totalCost: { $sum: '$costAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: week7Start, $lte: last7DaysEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Income.find({ userId })
        .populate('productId', 'name')
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),

      Expense.find({ userId })
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),

      // ── Total customers for this business ─────────────────────────────────
      Customer.countDocuments({ userId }),

      // ── Total staff (saleskeepers) invited by this owner ──────────────────
      User.countDocuments({ ownerId: userId, role: 'staff', isActive: true }),

      // ── Storefront order counts by status, for the selected range ─────────
      Transaction.aggregate([
        {
          $match: {
            user_id:   new mongoose.Types.ObjectId(userId),
            type:      'purchase',
            purpose:   'catalog',
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    // ── Build KPIs ────────────────────────────────────────────────────────────

    const revenueThisMonth = incomeThisMonth[0]?.total     ?? 0;
    const costThisMonth    = incomeThisMonth[0]?.totalCost ?? 0;
    const expensesMonth    = expensesThisMonth[0]?.total   ?? 0;

    const kpis = {
      salesToday:      salesToday[0]?.total      ?? 0,
      expensesToday:   expensesToday[0]?.total   ?? 0,
      // True net profit — revenue minus cost of goods sold minus operating
      // expenses. (Previously this omitted cost of goods entirely.)
      profitThisMonth:      revenueThisMonth - costThisMonth - expensesMonth,
      grossProfitThisMonth: revenueThisMonth - costThisMonth,
      costOfGoodsThisMonth: costThisMonth,
      cashBalance:     (allTimeIncome[0]?.total    ?? 0) - (allTimeExpenses[0]?.total   ?? 0),
      totalCustomers,
      totalStaff,
      totalIncomeCount:  allTimeIncome[0]?.count  ?? 0,
      totalExpenseCount: allTimeExpenses[0]?.count ?? 0,
      incomeCountToday:  salesToday[0]?.count      ?? 0,
      expenseCountToday: expensesToday[0]?.count   ?? 0,
    };

    // ── Build 7-day chart data ────────────────────────────────────────────────

    const incomeMap  = new Map(last7DaysIncome.map((r: any)   => [r._id, r.total]));
    const costMap    = new Map(last7DaysIncome.map((r: any)   => [r._id, r.totalCost]));
    const expenseMap = new Map(last7DaysExpenses.map((r: any) => [r._id, r.total]));

    const last7Days: DayPoint[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(week7Start);
      d.setUTCDate(d.getUTCDate() + i);
      const key   = d.toISOString().split('T')[0];                         // "2026-06-21"
      const label = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); // "Sat"
      const income  = incomeMap.get(key)  ?? 0;
      const cost    = costMap.get(key)    ?? 0;
      const expense = expenseMap.get(key) ?? 0;
      return {
        date:    label,
        income,
        expense,
        // True net profit, same definition as kpis.profitThisMonth: revenue
        // minus cost of goods sold minus operating expenses.
        profit:  income - cost - expense,
      };
    });

    // ── Build order status breakdown (for the selected range) ──────────────────

    const orderStatusMap = new Map(orderStatusCounts.map((r: any) => [r._id, r.count]));
    const orderStatusBreakdown = {
      completed: orderStatusMap.get('successful') ?? 0,
      pending:   orderStatusMap.get('pending')    ?? 0,
      cancelled: orderStatusMap.get('cancelled')  ?? 0,
      failed:    orderStatusMap.get('failed')     ?? 0,
    };

    // ── Build recent activity feed ────────────────────────────────────────────

    const incomeActivity: RecentActivityItem[] = recentIncome.map((r: any) => ({
      _id:         r._id.toString(),
      type:        'income' as const,
      amount:      r.amount,
      description: r.productId?.name ?? r.customerId?.name ?? 'Custom income',
      date:        r.date,
      createdAt:   r.createdAt,
    }));

    const expenseActivity: RecentActivityItem[] = recentExpenses.map((r: any) => ({
      _id:         r._id.toString(),
      type:        'expense' as const,
      amount:      r.amount,
      description: r.vendor ?? r.categoryId?.name ?? 'Uncategorised expense',
      date:        r.date,
      createdAt:   r.createdAt,
    }));

    const recentActivity = [...incomeActivity, ...expenseActivity]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    return {
      period,
      selectedDate: rangeLabel,
      kpis,
      last7Days,
      recentActivity,
      orderStatusBreakdown,
    };
  }

}

export default new DashboardService();