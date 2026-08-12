import { Request, Response, NextFunction } from 'express';
import TaxService, { BusinessStructure } from '../services/tax.service';
import { Income } from '../models/income.model';
import { Expense } from '../models/expense.model';
import { ITaxSettings } from '../models/user.model';

class TaxController {

  /**
   * GET /api/tax/settings
   * The business's persisted tax profile.
   */
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;
      const settings = await TaxService.getSettings(userId);
      res.status(200).json({ success: true, message: 'Tax settings fetched.', data: settings });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/tax/settings
   * Body: any subset of { businessStructure, vatRegistered, fixedAssets, isProfessionalService, reliefs }
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const actorId = req.userId as string;
      const { businessStructure, vatRegistered, fixedAssets, isProfessionalService, reliefs } = req.body;

      if (businessStructure !== undefined && !['individual', 'sole_trader', 'registered_company'].includes(businessStructure)) {
        res.status(400).json({
          success: false,
          message: 'businessStructure must be "individual", "sole_trader", or "registered_company".',
        });
        return;
      }

      // Only include fields actually sent — omitted keys must NOT overwrite
      // previously-saved values with undefined.
      const payload: Partial<ITaxSettings> = {};
      if (businessStructure !== undefined)     payload.businessStructure     = businessStructure;
      if (vatRegistered !== undefined)          payload.vatRegistered         = vatRegistered;
      if (fixedAssets !== undefined)            payload.fixedAssets          = fixedAssets;
      if (isProfessionalService !== undefined)  payload.isProfessionalService = isProfessionalService;
      if (reliefs !== undefined)                payload.reliefs              = reliefs;

      const settings = await TaxService.updateSettings(userId, payload, actorId);
      res.status(200).json({ success: true, message: 'Tax settings updated.', data: settings });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/tax/estimate?grossIncome=5000000
   * Quick manual PAYE estimate — no auth needed
   */
  async estimateManual(req: Request, res: Response, next: NextFunction) {
    try {
      const grossIncome = parseFloat(req.query.grossIncome as string);

      if (!grossIncome || isNaN(grossIncome) || grossIncome < 0) {
        res.status(400).json({ success: false, message: 'grossIncome is required and must be a positive number.' });
        return;
      }

      const estimate = TaxService.estimateManual(grossIncome);
      res.status(200).json({ success: true, message: 'PAYE estimate computed.', data: estimate });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/tax/full-estimate
   * Full smart estimate — pulls from DB, handles both sole trader and company.
   * Business structure, VAT registration, company details, and reliefs are
   * read from the business's saved tax settings (PATCH /api/tax/settings) —
   * no need to resupply them on every call. A query param still overrides the
   * saved value for one-off "what if" estimates.
   *
   * Query params:
   *   startDate          → YYYY-MM-DD (required)
   *   endDate            → YYYY-MM-DD (required)
   *   businessStructure  → 'individual' | 'sole_trader' | 'registered_company' (optional — overrides saved settings)
   */
  async fullEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId    = req.businessOwnerId as string;
      const startDate = req.query.startDate as string;
      const endDate   = req.query.endDate   as string;

      // ── Validate ────────────────────────────────────────────────────────────
      if (!startDate || !endDate) {
        res.status(400).json({ success: false, message: 'startDate and endDate are required (YYYY-MM-DD).' });
        return;
      }

      const settings = await TaxService.getSettings(userId);
      const businessStructure = (req.query.businessStructure as BusinessStructure) || settings.businessStructure;

      if (!['individual', 'sole_trader', 'registered_company'].includes(businessStructure)) {
        res.status(400).json({
          success: false,
          message: 'businessStructure must be "individual", "sole_trader", or "registered_company" — set it via PATCH /api/tax/settings, or pass it as a query param to override for this request.',
        });
        return;
      }

      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end   = new Date(`${endDate}T23:59:59.999Z`);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
        return;
      }

      if (start > end) {
        res.status(400).json({ success: false, message: 'startDate must be before endDate.' });
        return;
      }

      // ── Fetch data from DB ──────────────────────────────────────────────────
      const [incomeResult, expenseResult] = await Promise.all([
        Income.aggregate([
          { $match: { userId, date: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Expense.aggregate([
          { $match: { userId, date: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const totalIncome   = incomeResult[0]?.total  ?? 0;
      const totalExpenses = expenseResult[0]?.total ?? 0;
      const periodDays    = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

      // ── Compute estimate ────────────────────────────────────────────────────
      const estimate = TaxService.computeFullEstimate({
        businessStructure,
        totalIncome,
        totalExpenses,
        periodDays,
        startDate,
        endDate,
        individualReliefs: settings.reliefs,
        company: {
          fixedAssets: settings.fixedAssets,
          isProfessionalService: settings.isProfessionalService,
        },
        vat: {
          isVATRegistered: settings.vatRegistered,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Full tax estimate computed.',
        data:    estimate,
      });
    } catch (error) { next(error); }
  }

}

export default new TaxController();
