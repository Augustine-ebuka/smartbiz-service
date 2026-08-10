import { Request, Response, NextFunction } from 'express';
import PayrollService from '../services/payrollService';

class PayrollController {

  /** GET /api/payroll/preferences */
  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const prefs = await PayrollService.getPreferences(userId);
      res.status(200).json({ success: true, message: 'Payroll preferences fetched.', data: prefs });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/payroll/preferences
   * Body: any subset of { payeEnabled, pensionEnabled, pensionEmployeeRate, nhfEnabled, nhfEmployeeRate }
   * Only affects payroll runs created/edited after this change — completed runs keep their original numbers.
   */
  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const prefs = await PayrollService.updatePreferences(userId, req.body ?? {}, req.userId as string);
      res.status(200).json({ success: true, message: 'Payroll preferences updated.', data: prefs });
    } catch (error) { next(error); }
  }

  /** GET /api/payroll/eligible-employees */
  async getEligibleEmployees(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const employees = await PayrollService.getEligibleEmployees(userId);
      res.status(200).json({ success: true, message: 'Eligible employees fetched.', data: employees });
    } catch (error) { next(error); }
  }

  /** POST /api/payroll/runs — Body: { periodLabel, periodStart, periodEnd, employeeIds? } */
  async createRun(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const { periodLabel, periodStart, periodEnd } = req.body ?? {};
      if (!periodLabel || !periodStart || !periodEnd) {
        res.status(400).json({ success: false, message: 'periodLabel, periodStart and periodEnd are required.' });
        return;
      }
      const run = await PayrollService.createRun(userId, req.userId as string, req.body);
      res.status(201).json({ success: true, message: `Payroll run ${run.runNumber} created.`, data: run });
    } catch (error) { next(error); }
  }

  /** GET /api/payroll/runs */
  async getAllRuns(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await PayrollService.getAllRuns(userId, page, limit);
      res.status(200).json({ success: true, message: 'Payroll runs fetched.', data: result });
    } catch (error) { next(error); }
  }

  /** GET /api/payroll/runs/:id */
  async getRunById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const run = await PayrollService.getRunById(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Payroll run fetched.', data: run });
    } catch (error) { next(error); }
  }

  /** PATCH /api/payroll/runs/:id/payslips/:payslipId — Body: { allowances?, otherDeductions? } */
  async updatePayslip(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const run = await PayrollService.updatePayslip(userId, req.params.id, req.params.payslipId, req.body ?? {}, req.userId as string);
      res.status(200).json({ success: true, message: 'Payslip updated.', data: run });
    } catch (error) { next(error); }
  }

  /** PATCH /api/payroll/runs/:id/complete */
  async completeRun(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const run = await PayrollService.completeRun(userId, req.params.id, req.userId as string);
      res.status(200).json({ success: true, message: `Payroll run ${run.runNumber} completed.`, data: run });
    } catch (error) { next(error); }
  }

  /** PATCH /api/payroll/runs/:id/cancel */
  async cancelRun(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const run = await PayrollService.cancelRun(userId, req.params.id, req.userId as string);
      res.status(200).json({ success: true, message: `Payroll run ${run.runNumber} cancelled.`, data: run });
    } catch (error) { next(error); }
  }

  /** PATCH /api/payroll/runs/:id/payslips/:payslipId/mark-paid — Body: { paymentReference? } */
  async markPayslipPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const run = await PayrollService.markPayslipPaid(userId, req.params.id, req.params.payslipId, req.body ?? {}, req.userId as string);
      res.status(200).json({ success: true, message: 'Payslip marked as paid.', data: run });
    } catch (error) { next(error); }
  }

  /** DELETE /api/payroll/runs/:id */
  async deleteRun(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      await PayrollService.deleteRun(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Payroll run deleted.' });
    } catch (error) { next(error); }
  }

}

export default new PayrollController();
