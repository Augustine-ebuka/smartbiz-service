// ─── Plan definitions ─────────────────────────────────────────────────────────
// Single source of truth — change limits here and they apply everywhere

export type PlanId = 'free' | 'monthly' | 'yearly';

export interface PlanLimits {
  aiQueriesPerDay:      number;    // -1 = unlimited
  incomePerMonth:       number;    // -1 = unlimited
  expensePerMonth:      number;    // -1 = unlimited
  customers:            number;    // -1 = unlimited (total, not per month)
  products:             number;    // -1 = unlimited (total)
  saleskeeperInvites:   number;    // -1 = unlimited
  bulkImport:           boolean;
  fullReports:          boolean;
}

export interface Plan {
  id:          PlanId;
  name:        string;
  priceKobo:   number;             // in kobo (Monnify/Paystack uses kobo) — 0 for free
  durationDays: number;            // 0 for free (no expiry)
  limits:      PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id:           'free',
    name:         'Free',
    priceKobo:    0,
    durationDays: 0,
    limits: {
      aiQueriesPerDay:    3,
      incomePerMonth:     50,
      expensePerMonth:    50,
      customers:          20,
      products:           10,
      saleskeeperInvites: 1,
      bulkImport:         false,
      fullReports:        false,
    },
  },

  monthly: {
    id:           'monthly',
    name:         'Pro Monthly',
    priceKobo:    500000,           // ₦5,000 in kobo
    durationDays: 30,
    limits: {
      aiQueriesPerDay:    15,
      incomePerMonth:     -1,
      expensePerMonth:    -1,
      customers:          -1,
      products:           -1,
      saleskeeperInvites: 5,
      bulkImport:         true,
      fullReports:        true,
    },
  },

  yearly: {
    id:           'yearly',
    name:         'Pro Yearly',
    priceKobo:    5000000,          // ₦50,000 in kobo
    durationDays: 365,
    limits: {
      aiQueriesPerDay:    15,
      incomePerMonth:     -1,
      expensePerMonth:    -1,
      customers:          -1,
      products:           -1,
      saleskeeperInvites: -1,
      bulkImport:         true,
      fullReports:        true,
    },
  },
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}