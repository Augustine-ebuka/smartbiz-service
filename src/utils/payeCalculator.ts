// ─── Nigeria PAYE (Pay As You Earn) — progressive tax bands ───────────────────
// Per the Finance Act 2020 methodology used by FIRS:
//   1. Consolidated Relief Allowance (CRA) = max(₦200,000, 1% of gross) + 20% of gross
//   2. Taxable income = gross - CRA - statutory pension/NHF contributions
//   3. Progressive bands applied to taxable income
//
// All inputs/outputs here are ANNUAL figures — callers annualize a per-period
// salary before calling this, then divide the result back down.

const PAYE_BANDS: Array<{ limit: number; rate: number }> = [
  { limit: 300_000,   rate: 0.07 },
  { limit: 300_000,   rate: 0.11 },
  { limit: 500_000,   rate: 0.15 },
  { limit: 500_000,   rate: 0.19 },
  { limit: 1_600_000, rate: 0.21 },
  { limit: Infinity,  rate: 0.24 },
];

/**
 * Computes annual PAYE tax liability.
 * @param annualGrossIncome  gross income for the year, before any deductions
 * @param annualPension      annual pension contribution already deducted (tax-relieved)
 * @param annualNHF          annual NHF contribution already deducted (tax-relieved)
 */
export function calculateAnnualPAYE(
  annualGrossIncome: number,
  annualPension = 0,
  annualNHF = 0
): number {
  if (annualGrossIncome <= 0) return 0;

  const consolidatedReliefAllowance =
    Math.max(200_000, 0.01 * annualGrossIncome) + 0.20 * annualGrossIncome;

  const taxableIncome = annualGrossIncome - consolidatedReliefAllowance - annualPension - annualNHF;
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  let remaining = taxableIncome;

  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break;
    const taxableAtThisBand = Math.min(remaining, band.limit);
    tax += taxableAtThisBand * band.rate;
    remaining -= taxableAtThisBand;
  }

  return Math.round(tax * 100) / 100;
}
