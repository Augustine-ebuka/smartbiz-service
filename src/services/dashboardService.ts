import { Expense } from '../models/expense.model';
import { Income } from '../models/income.model';

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayPoint {
  date: string;
  income: number;
  expense: number;
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
  kpis: {
    salesToday: number;
    expensesToday: number;
    profitThisMonth: number;
    cashBalance: number;
  };
  last7Days: DayPoint[];
  recentActivity: RecentActivityItem[];
}

const RECENT_ACTIVITY_LIMIT = 6;

// ─── Service ──────────────────────────────────────────────────────────────────

class DashboardService {

  async getDashboard(userId: string): Promise<DashboardData> {
    const now        = new Date();
    const todayStart = utcStartOfDay(now);
    const todayEnd   = utcEndOfDay(now);
    const monthStart = utcStartOfMonth(now);
    const monthEnd   = utcEndOfMonth(now);
    const week7Start = utcDaysAgo(6);

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
    ] = await Promise.all([

      Income.aggregate([
        { $match: { userId, date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Income.aggregate([
        { $match: { userId, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Income.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Expense.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Income.aggregate([
        { $match: { userId, date: { $gte: week7Start, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Expense.aggregate([
        { $match: { userId, date: { $gte: week7Start, $lte: todayEnd } } },
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
    ]);

    // ── Build KPIs ────────────────────────────────────────────────────────────

    const kpis = {
      salesToday:      salesToday[0]?.total      ?? 0,
      expensesToday:   expensesToday[0]?.total   ?? 0,
      profitThisMonth: (incomeThisMonth[0]?.total  ?? 0) - (expensesThisMonth[0]?.total ?? 0),
      cashBalance:     (allTimeIncome[0]?.total    ?? 0) - (allTimeExpenses[0]?.total   ?? 0),
    };

    // ── Build 7-day chart data ────────────────────────────────────────────────

    const incomeMap  = new Map(last7DaysIncome.map((r: any)   => [r._id, r.total]));
    const expenseMap = new Map(last7DaysExpenses.map((r: any) => [r._id, r.total]));

    const last7Days: DayPoint[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(week7Start);
      d.setUTCDate(d.getUTCDate() + i);
      const key   = d.toISOString().split('T')[0];                         // "2026-06-21"
      const label = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); // "Sat"
      return {
        date:    label,
        income:  incomeMap.get(key)  ?? 0,
        expense: expenseMap.get(key) ?? 0,
      };
    });

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
      description: r.categoryId?.name ?? 'Uncategorised expense',
      date:        r.date,
      createdAt:   r.createdAt,
    }));

    const recentActivity = [...incomeActivity, ...expenseActivity]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    return { kpis, last7Days, recentActivity };
  }

}

export default new DashboardService();