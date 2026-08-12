
// ─────────────────────────────────────────────────────────────────────────────
// Nigeria Tax Engine
// Nigeria Tax Act (NTA) 2025
// Nigeria Tax Administration Act (NTAA) 2025
//
// Effective from: 1 January 2026
//
// IMPORTANT:
// - This is a tax-estimation engine, not a filing engine.
// - Accounting profit is NOT automatically the same as taxable profit.
// - VAT payable cannot be calculated correctly from gross turnover alone.
// - WHT depends on the nature of the transaction and recipient.
// - Companies require additional information to determine small-company status.
// ─────────────────────────────────────────────────────────────────────────────

import { User, ITaxSettings, DEFAULT_TAX_SETTINGS } from '../models/user.model';
import activityLogService from './activityLogService';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_IN_YEAR = 365;

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL INCOME TAX
// Nigeria Tax Act 2025
//
// Tax bands:
// First ₦800,000                  0%
// Next ₦2,200,000                15%
// Next ₦9,000,000                18%
// Next ₦13,000,000               21%
// Next ₦25,000,000               23%
// Above ₦50,000,000              25%
//
// Note:
// The new regime does not use the old CRA formula.
// ─────────────────────────────────────────────────────────────────────────────

interface TaxBand {
  limit: number; // -1 = unlimited
  rate: number;
  label: string;
}

const INDIVIDUAL_TAX_BANDS: TaxBand[] = [
  {
    limit: 800_000,
    rate: 0,
    label: "First ₦800,000",
  },
  {
    limit: 2_200_000,
    rate: 15,
    label: "Next ₦2,200,000",
  },
  {
    limit: 9_000_000,
    rate: 18,
    label: "Next ₦9,000,000",
  },
  {
    limit: 13_000_000,
    rate: 21,
    label: "Next ₦13,000,000",
  },
  {
    limit: 25_000_000,
    rate: 23,
    label: "Next ₦25,000,000",
  },
  {
    limit: -1,
    rate: 25,
    label: "Above ₦50,000,000",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY TAX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small company threshold under the new regime.
 *
 * NOTE:
 * Turnover alone is NOT sufficient to determine small-company status.
 * Other statutory conditions must also be satisfied.
 */
const SMALL_COMPANY_TURNOVER_THRESHOLD = 50_000_000;

const SMALL_COMPANY_CIT_RATE = 0;
const OTHER_COMPANY_CIT_RATE = 0.30;

// Development Levy
const DEVELOPMENT_LEVY_RATE = 0.04;

// ─────────────────────────────────────────────────────────────────────────────
// VAT
// ─────────────────────────────────────────────────────────────────────────────

// Exported so other services (e.g. incomeService, when computing vatAmount on
// a sale) reuse this exact constant instead of duplicating "7.5%" elsewhere —
// a future rate change then only needs updating in this one place.
export const VAT_RATE = 0.075;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BusinessStructure =
  | "individual"
  | "sole_trader"
  | "registered_company";

export interface TaxBandBreakdown {
  label: string;
  rate: number;
  taxableAmount: number;
  taxDue: number;
}

export interface IndividualReliefs {
  pensionContribution?: number;
  nhfContribution?: number;
  lifeAssurancePremium?: number;
  otherAllowableReliefs?: number;
}

export interface PAYEResult {
  type: "paye";
  grossIncome: number;
  allowableReliefs: number;
  taxableIncome: number;
  totalTaxDue: number;
  effectiveRate: number;
  monthlyTaxDue: number;
  breakdown: TaxBandBreakdown[];
}

export interface CompanyTaxInputs {
  annualTurnover: number;
  accountingProfit: number;

  /**
   * Fixed assets used for determining small-company eligibility.
   */
  fixedAssets?: number;

  /**
   * Professional service companies do not automatically qualify
   * merely because turnover is below the small-company threshold.
   */
  isProfessionalService?: boolean;

  /**
   * Tax-adjusted profit supplied by caller.
   *
   * If omitted, accountingProfit is used as an estimate.
   *
   * A proper tax computation should perform:
   *
   * Accounting profit
   * + disallowable expenses
   * - allowable deductions
   * +/- tax adjustments
   * = assessable/taxable profit
   */
  taxableProfit?: number;
}

export interface CITResult {
  type: "cit";

  annualTurnover: number;

  accountingProfit: number;

  taxableProfit: number;

  isSmallCompany: boolean;

  smallCompanyReason?: string;

  citRate: number;

  citDue: number;

  developmentLevyRate: number;

  developmentLevyDue: number;

  totalCompanyTaxDue: number;

  effectiveRate: number;

  monthlyProvision: number;
}

export interface VATResult {
  isVATRegistered: boolean;

  annualTurnover: number;

  vatRate: number;

  taxableSales: number;

  outputVAT: number;

  inputVAT: number;

  vatPayable: number;

  note: string;
}

export interface WHTTransaction {
  transaction: string;

  grossAmount: number;

  rate: number;

  whtAmount: number;
}

export interface WHTResult {
  applies: boolean;

  totalWHT: number;

  transactions: WHTTransaction[];

  note: string;
}

export interface FullTaxEstimate {
  businessStructure: BusinessStructure;

  isRegistered: boolean;

  period: {
    startDate: string;

    endDate: string;

    days: number;

    annualised: boolean;
  };

  businessSummary: {
    totalIncome: number;

    totalExpenses: number;

    netProfit: number;

    annualisedIncome: number;

    annualisedProfit: number;
  };

  incomeTax: PAYEResult | CITResult;

  vat: VATResult;

  wht: WHTResult;

  otherTaxes: Array<{
    name: string;

    description: string;

    amount?: number;
  }>;

  totalEstimatedTax: number;

  monthlyProvision: number;

  summary: string;

  disclaimer: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function roundMoney(value: number): number {
  return Math.round(value);
}

function fmt(value: number): string {
  return `₦${roundMoney(value).toLocaleString("en-NG")}`;
}

function positive(value: number | undefined | null): number {
  return Math.max(0, Number(value ?? 0));
}

function annualise(
  amount: number,
  periodDays: number,
): number {
  if (periodDays <= 0) {
    return amount;
  }

  if (periodDays === DAYS_IN_YEAR) {
    return amount;
  }

  return (amount / periodDays) * DAYS_IN_YEAR;
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL RELIEFS
// ─────────────────────────────────────────────────────────────────────────────

function computeIndividualReliefs(
  reliefs: IndividualReliefs = {},
): number {
  return (
    positive(reliefs.pensionContribution) +
    positive(reliefs.nhfContribution) +
    positive(reliefs.lifeAssurancePremium) +
    positive(reliefs.otherAllowableReliefs)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL TAX BANDS
// ─────────────────────────────────────────────────────────────────────────────

function applyIndividualTaxBands(
  taxableIncome: number,
): {
  total: number;
  breakdown: TaxBandBreakdown[];
} {
  let remaining = Math.max(0, taxableIncome);

  let total = 0;

  const breakdown: TaxBandBreakdown[] = [];

  for (const band of INDIVIDUAL_TAX_BANDS) {
    if (remaining <= 0) {
      break;
    }

    const taxableAmount =
      band.limit === -1
        ? remaining
        : Math.min(remaining, band.limit);

    const taxDue =
      (taxableAmount * band.rate) / 100;

    breakdown.push({
      label: band.label,

      rate: band.rate,

      taxableAmount: roundMoney(taxableAmount),

      taxDue: roundMoney(taxDue),
    });

    total += taxDue;

    remaining -= taxableAmount;
  }

  return {
    total: roundMoney(total),

    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL / PAYE
// ─────────────────────────────────────────────────────────────────────────────

function computePAYE(
  annualGrossIncome: number,
  reliefs: IndividualReliefs = {},
): PAYEResult {
  const grossIncome = Math.max(0, annualGrossIncome);

  const allowableReliefs =
    computeIndividualReliefs(reliefs);

  const taxableIncome = Math.max(
    0,
    grossIncome - allowableReliefs,
  );

  const {
    total: totalTaxDue,
    breakdown,
  } = applyIndividualTaxBands(taxableIncome);

  return {
    type: "paye",

    grossIncome: roundMoney(grossIncome),

    allowableReliefs: roundMoney(allowableReliefs),

    taxableIncome: roundMoney(taxableIncome),

    totalTaxDue,

    effectiveRate:
      grossIncome > 0
        ? roundMoney(
            (totalTaxDue / grossIncome) * 10000,
          ) / 100
        : 0,

    monthlyTaxDue:
      roundMoney(totalTaxDue / 12),

    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPANY TEST
// ─────────────────────────────────────────────────────────────────────────────

function determineSmallCompanyStatus(
  inputs: CompanyTaxInputs,
): {
  isSmallCompany: boolean;
  reason?: string;
} {
  const turnover = positive(inputs.annualTurnover);

  const fixedAssets = positive(inputs.fixedAssets);

  const professionalService =
    Boolean(inputs.isProfessionalService);

  if (
    turnover >
    SMALL_COMPANY_TURNOVER_THRESHOLD
  ) {
    return {
      isSmallCompany: false,

      reason:
        "Turnover exceeds the ₦50,000,000 small-company threshold.",
    };
  }

  if (professionalService) {
    return {
      isSmallCompany: false,

      reason:
        "Professional-service businesses require separate treatment and should not be classified as small companies solely from turnover.",
    };
  }

  if (fixedAssets > 250_000_000) {
    return {
      isSmallCompany: false,

      reason:
        "Fixed assets exceed the statutory small-company limit.",
    };
  }

  return {
    isSmallCompany: true,

    reason:
      "The company satisfies the supplied small-company conditions.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY TAX
// ─────────────────────────────────────────────────────────────────────────────

function computeCIT(
  inputs: CompanyTaxInputs,
): CITResult {
  const annualTurnover =
    positive(inputs.annualTurnover);

  const accountingProfit =
    Math.max(0, inputs.accountingProfit);

  /**
   * Prefer a tax-adjusted profit when the caller has calculated one.
   *
   * This is important because accounting profit is not automatically
   * the same as taxable profit.
   */
  const taxableProfit =
    inputs.taxableProfit !== undefined
      ? Math.max(0, inputs.taxableProfit)
      : accountingProfit;

  const {
    isSmallCompany,
    reason,
  } = determineSmallCompanyStatus(inputs);

  const citRate = isSmallCompany
    ? SMALL_COMPANY_CIT_RATE
    : OTHER_COMPANY_CIT_RATE;

  const citDue =
    taxableProfit * citRate;

  /**
   * Development levy is calculated on assessable profit
   * for companies to which the levy applies.
   *
   * Small companies are excluded.
   */
  const developmentLevyDue =
    isSmallCompany
      ? 0
      : taxableProfit *
        DEVELOPMENT_LEVY_RATE;

  const totalCompanyTaxDue =
    citDue + developmentLevyDue;

  return {
    type: "cit",

    annualTurnover:
      roundMoney(annualTurnover),

    accountingProfit:
      roundMoney(accountingProfit),

    taxableProfit:
      roundMoney(taxableProfit),

    isSmallCompany,

    smallCompanyReason: reason,

    citRate: citRate * 100,

    citDue:
      roundMoney(citDue),

    developmentLevyRate:
      DEVELOPMENT_LEVY_RATE * 100,

    developmentLevyDue:
      roundMoney(developmentLevyDue),

    totalCompanyTaxDue:
      roundMoney(totalCompanyTaxDue),

    effectiveRate:
      taxableProfit > 0
        ? roundMoney(
            (totalCompanyTaxDue /
              taxableProfit) *
              10000,
          ) / 100
        : 0,

    monthlyProvision:
      roundMoney(
        totalCompanyTaxDue / 12,
      ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VAT
// ─────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// Do NOT calculate VAT simply as:
// turnover × 7.5%
//
// Proper VAT payable is approximately:
//
// Output VAT
// - allowable input VAT
// = VAT payable
//
// The caller therefore supplies taxable sales and input VAT.
//
// ─────────────────────────────────────────────────────────────────────────────

function computeVAT(params: {
  annualTurnover: number;

  taxableSales?: number;

  inputVAT?: number;

  isVATRegistered?: boolean;
}): VATResult {
  const annualTurnover =
    positive(params.annualTurnover);

  /**
   * Registration status should ideally come from the taxpayer's
   * actual registration/status rather than being inferred blindly.
   */
  const isVATRegistered =
    params.isVATRegistered ??
    annualTurnover > 0;

  if (!isVATRegistered) {
    return {
      isVATRegistered: false,

      annualTurnover:
        roundMoney(annualTurnover),

      vatRate:
        VAT_RATE * 100,

      taxableSales: 0,

      outputVAT: 0,

      inputVAT: 0,

      vatPayable: 0,

      note:
        "VAT is not included in this estimate because the taxpayer is marked as not VAT registered.",
    };
  }

  const taxableSales =
    positive(
      params.taxableSales ??
        annualTurnover,
    );

  const inputVAT =
    positive(params.inputVAT);

  const outputVAT =
    taxableSales * VAT_RATE;

  const vatPayable =
    Math.max(
      0,
      outputVAT - inputVAT,
    );

  return {
    isVATRegistered: true,

    annualTurnover:
      roundMoney(annualTurnover),

    vatRate:
      VAT_RATE * 100,

    taxableSales:
      roundMoney(taxableSales),

    outputVAT:
      roundMoney(outputVAT),

    inputVAT:
      roundMoney(inputVAT),

    vatPayable:
      roundMoney(vatPayable),

    note:
      "VAT payable is calculated as output VAT less allowable input VAT. Exempt and zero-rated supplies must be handled separately.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHT
// ─────────────────────────────────────────────────────────────────────────────
//
// WHT is transaction-specific.
// It should NOT simply be:
// "registered company => WHT applies".
//
// The caller supplies the applicable transaction rate.
// ─────────────────────────────────────────────────────────────────────────────

function computeWHT(
  transactions: Array<{
    transaction: string;

    grossAmount: number;

    rate: number;
  }> = [],
): WHTResult {
  const calculatedTransactions =
    transactions.map(
      (transaction) => {
        const grossAmount =
          positive(transaction.grossAmount);

        const rate =
          Math.max(
            0,
            transaction.rate,
          );

        const whtAmount =
          grossAmount *
          (rate / 100);

        return {
          transaction:
            transaction.transaction,

          grossAmount:
            roundMoney(grossAmount),

          rate,

          whtAmount:
            roundMoney(whtAmount),
        };
      },
    );

  const totalWHT =
    calculatedTransactions.reduce(
      (sum, transaction) =>
        sum + transaction.whtAmount,
      0,
    );

  return {
    applies:
      calculatedTransactions.length > 0,

    totalWHT:
      roundMoney(totalWHT),

    transactions:
      calculatedTransactions,

    note:
      "WHT is transaction-specific. The applicable rate should be selected from the NTA 2025 rules for the particular payment and recipient.",
  };
}

// ─── Settings helper ────────────────────────────────────────────────────────
// owner.settings.taxSettings is a Mongoose single-nested subdocument, not a
// plain object — spreading it directly copies Mongoose's internal bookkeeping
// ($__, _doc, etc.) instead of just the real fields. Always go through
// .toObject() first (same bug class fixed in payrollService's preferences).
function toPlainTaxSettings(value: any): Partial<ITaxSettings> {
  if (!value) return {};
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

class TaxService {

  // ─── Settings ────────────────────────────────────────────────────────────
  // The business's persistent tax profile — set once, then reused by
  // computeFullEstimate() below instead of requiring every caller to
  // resupply businessStructure/VAT registration/company details each time.

  async getSettings(userId: string): Promise<ITaxSettings> {
    const owner = await User.findById(userId).select('settings.taxSettings');
    return { ...DEFAULT_TAX_SETTINGS, ...toPlainTaxSettings(owner?.settings?.taxSettings) };
  }

  async updateSettings(userId: string, payload: Partial<ITaxSettings>, actorId: string): Promise<ITaxSettings> {
    const owner = await User.findById(userId);
    if (!owner) throw new Error('User not found.');

    if (!owner.settings) owner.settings = {};
    const merged: ITaxSettings = {
      ...DEFAULT_TAX_SETTINGS,
      ...toPlainTaxSettings(owner.settings.taxSettings),
      ...payload,
    };
    owner.settings.taxSettings = merged;
    await owner.save();

    const actor = await User.findById(actorId).select('firstName lastName role');
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown',
      actorRole: actor?.role ?? 'unknown',
      action: 'tax.update_settings',
      description: 'Tax settings updated',
      resourceId: userId,
    });

    return merged;
  }

  /**
   * Calculate individual PAYE.
   *
   * Example:
   *
   * taxService.estimateIndividual({
   *   grossIncome: 6_000_000,
   *   reliefs: {
   *     pensionContribution: 300_000
   *   }
   * })
   */
  estimateIndividual(params: {
    grossIncome: number;

    reliefs?: IndividualReliefs;
  }): PAYEResult {
    return computePAYE(
      params.grossIncome,
      params.reliefs,
    );
  }

  /**
   * Calculate company tax.
   */
  estimateCompany(
    params: CompanyTaxInputs,
  ): CITResult {
    return computeCIT(params);
  }

  /**
   * Calculate VAT.
   */
  estimateVAT(params: {
    annualTurnover: number;

    taxableSales?: number;

    inputVAT?: number;

    isVATRegistered?: boolean;
  }): VATResult {
    return computeVAT(params);
  }

  /**
   * Calculate WHT from supplied transactions.
   */
  estimateWHT(
    transactions: Array<{
      transaction: string;

      grossAmount: number;

      rate: number;
    }>,
  ): WHTResult {
    return computeWHT(transactions);
  }

  /**
   * Full tax estimate.
   *
   * NOTE:
   * This method intentionally requires additional inputs for VAT,
   * WHT and company classification rather than guessing them.
   */
  computeFullEstimate(params: {
    businessStructure: BusinessStructure;

    totalIncome: number;

    totalExpenses: number;

    periodDays: number;

    startDate: string;

    endDate: string;

    individualReliefs?: IndividualReliefs;

    company?: {
      fixedAssets?: number;

      isProfessionalService?: boolean;

      taxableProfit?: number;
    };

    vat?: {
      taxableSales?: number;

      inputVAT?: number;

      isVATRegistered?: boolean;
    };

    whtTransactions?: Array<{
      transaction: string;

      grossAmount: number;

      rate: number;
    }>;
  }): FullTaxEstimate {
    const {
      businessStructure,
      totalIncome,
      totalExpenses,
      periodDays,
      startDate,
      endDate,
      individualReliefs,
      company,
      vat: vatInput,
      whtTransactions = [],
    } = params;

    const income =
      Math.max(0, totalIncome);

    const expenses =
      Math.max(0, totalExpenses);

    const netProfit =
      Math.max(
        0,
        income - expenses,
      );

    const annualisedIncome =
      annualise(
        income,
        periodDays,
      );

    const annualisedProfit =
      annualise(
        netProfit,
        periodDays,
      );

    const annualised =
      periodDays !== DAYS_IN_YEAR;

    const isCompany =
      businessStructure ===
      "registered_company";

    // ────────────────────────────────────────────────────────────────────────
    // Income tax
    // ────────────────────────────────────────────────────────────────────────

    let incomeTax:
      | PAYEResult
      | CITResult;

    if (isCompany) {
      incomeTax = computeCIT({
        annualTurnover:
          annualisedIncome,

        accountingProfit:
          annualisedProfit,

        fixedAssets:
          company?.fixedAssets,

        isProfessionalService:
          company?.isProfessionalService,

        taxableProfit:
          company?.taxableProfit,
      });
    } else {
      incomeTax = computePAYE(
        annualisedIncome,
        individualReliefs,
      );
    }

    // ────────────────────────────────────────────────────────────────────────
    // VAT
    // ────────────────────────────────────────────────────────────────────────

    const computevat = computeVAT({
      annualTurnover:
        annualisedIncome,

      taxableSales:
        vatInput?.taxableSales,

      inputVAT:
        vatInput?.inputVAT,

      isVATRegistered:
        vatInput?.isVATRegistered,
    });

    // ────────────────────────────────────────────────────────────────────────
    // WHT
    // ────────────────────────────────────────────────────────────────────────

    const wht =
      computeWHT(
        whtTransactions,
      );

    // ────────────────────────────────────────────────────────────────────────
    // Other taxes
    // ────────────────────────────────────────────────────────────────────────

    const otherTaxes:
      FullTaxEstimate["otherTaxes"] = [];

    // ────────────────────────────────────────────────────────────────────────
    // Total
    // ────────────────────────────────────────────────────────────────────────
    //
    // WHT is intentionally NOT added to total tax liability here.
    //
    // Why?
    //
    // WHT is generally withholding/collection at source and may represent
    // tax withheld from a payment rather than an additional tax burden.
    //
    // Similarly VAT is presented separately because its treatment depends
    // on whether it is collected from customers and the relevant input VAT.
    //
    // ────────────────────────────────────────────────────────────────────────

    const incomeTaxDue =
      isCompany
        ? (incomeTax as CITResult)
            .totalCompanyTaxDue
        : (incomeTax as PAYEResult)
            .totalTaxDue;

    const vatDue =
      computevat.vatPayable;

    const totalEstimatedTax =
      incomeTaxDue + vatDue;

    const monthlyProvision =
      roundMoney(
        totalEstimatedTax / 12,
      );

    // ────────────────────────────────────────────────────────────────────────
    // Summary
    // ────────────────────────────────────────────────────────────────────────

    let summary: string;

    if (isCompany) {
      const companyTax =
        incomeTax as CITResult;

      if (companyTax.isSmallCompany) {
        summary =
          `The company is estimated to qualify as a small company under the supplied information. ` +
          `Estimated CIT is ${fmt(companyTax.citDue)} and development levy is ${fmt(companyTax.developmentLevyDue)}. ` +
          `Estimated VAT payable is ${fmt(computevat.vatPayable)}.`;
      } else {
        summary =
          `The company is estimated to be subject to ${companyTax.citRate}% CIT plus applicable development levy. ` +
          `Estimated company tax is ${fmt(companyTax.totalCompanyTaxDue)}. ` +
          `Estimated VAT payable is ${fmt(computevat.vatPayable)}.`;
      }
    } else {
      const paye =
        incomeTax as PAYEResult;

      summary =
        `Estimated annual individual income tax is ${fmt(paye.totalTaxDue)} ` +
        `on taxable income of ${fmt(paye.taxableIncome)}.`;
    }

    return {
      businessStructure,

      isRegistered: isCompany,

      period: {
        startDate,

        endDate,

        days: periodDays,

        annualised,
      },

      businessSummary: {
        totalIncome:
          roundMoney(income),

        totalExpenses:
          roundMoney(expenses),

        netProfit:
          roundMoney(netProfit),

        annualisedIncome:
          roundMoney(annualisedIncome),

        annualisedProfit:
          roundMoney(annualisedProfit),
      },

      incomeTax,

      vat: computevat,

      wht,

      otherTaxes,

      totalEstimatedTax:
        roundMoney(totalEstimatedTax),

      monthlyProvision,

      summary,

      disclaimer:
        "This calculator implements the Nigeria Tax Act 2025 and Nigeria Tax Administration Act 2025 at an estimation level. Taxable profit, allowable deductions, VAT exemptions/zero-rating, WHT transaction classifications, capital allowances, reliefs and other statutory adjustments may require additional taxpayer-specific information. It should not be treated as a substitute for a tax filing or professional tax advice.",
    };
  }

  /**
   * Backwards-compatible manual PAYE estimate.
   *
   * IMPORTANT:
   * This now uses the NTA 2025 individual tax bands.
   */
  estimateManual(
    grossIncome: number,
    reliefs: IndividualReliefs = {},
  ): PAYEResult {
    return computePAYE(
      grossIncome,
      reliefs,
    );
  }
}

export default new TaxService();
