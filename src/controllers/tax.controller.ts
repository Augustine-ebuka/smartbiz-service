import { Request, Response, NextFunction } from 'express';
import TaxService, { BusinessStructure } from '../services/tax.service';
import { Income } from '../models/income.model';
import { Expense } from '../models/expense.model';

class TaxController {

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
   * Full smart estimate — pulls from DB, handles both sole trader and company
   *
   * Query params:
   *   startDate          → YYYY-MM-DD (required)
   *   endDate            → YYYY-MM-DD (required)
   *   businessStructure  → 'sole_trader' | 'registered_company' (required)
   */
  async fullEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId            = req.businessOwnerId as string;
      const startDate         = req.query.startDate         as string;
      const endDate           = req.query.endDate           as string;
      const businessStructure = req.query.businessStructure as BusinessStructure;

      // ── Validate ────────────────────────────────────────────────────────────
      if (!startDate || !endDate) {
        res.status(400).json({ success: false, message: 'startDate and endDate are required (YYYY-MM-DD).' });
        return;
      }

      if (!businessStructure || !['sole_trader', 'registered_company'].includes(businessStructure)) {
        res.status(400).json({
          success: false,
          message: 'businessStructure is required. Use "sole_trader" or "registered_company".',
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
