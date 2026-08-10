import { PayrollRun, IPayrollRun } from '../models/payroll.model';
import { User, IPayrollPreferences, DEFAULT_PAYROLL_PREFERENCES, PayFrequency } from '../models/user.model';
import { Expense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import ApiError from '../utils/ApiError';
import activityLogService from './activityLogService';
import { calculateAnnualPAYE } from '../utils/payeCalculator';

async function getActorInfo(userId: string): Promise<{ actorName: string; actorRole: string }> {
  const actor = await User.findById(userId).select('firstName lastName role');
  return {
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown',
    actorRole: actor?.role ?? 'unknown',
  };
}

// `owner.settings.payrollPreferences` is a Mongoose single-nested subdocument,
// not a plain object — spreading it directly (`{...prefs}`) copies Mongoose's
// internal bookkeeping (`$__`, `_doc`, etc.) instead of just the real fields.
// Always go through .toObject() first.
function toPlainPreferences(prefs: any): Partial<IPayrollPreferences> {
  if (!prefs) return {};
  return typeof prefs.toObject === 'function' ? prefs.toObject() : prefs;
}

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

/**
 * Computes the three statutory deductions for one pay period, given gross pay
 * for that period and the business's current payroll preferences. PAYE is
 * inherently an annual calculation, so gross/pension/NHF are annualized based
 * on payFrequency, then the resulting annual tax is divided back down.
 */
function computeStatutoryDeductions(
  grossPay: number,
  payFrequency: PayFrequency,
  prefs: IPayrollPreferences
): { payeDeduction: number; pensionDeduction: number; nhfDeduction: number } {
  const periodsPerYear = PERIODS_PER_YEAR[payFrequency];

  const pensionDeduction = prefs.pensionEnabled
    ? Math.round(grossPay * (prefs.pensionEmployeeRate / 100) * 100) / 100
    : 0;
  const nhfDeduction = prefs.nhfEnabled
    ? Math.round(grossPay * (prefs.nhfEmployeeRate / 100) * 100) / 100
    : 0;

  let payeDeduction = 0;
  if (prefs.payeEnabled) {
    const annualGross   = grossPay * periodsPerYear;
    const annualPension = pensionDeduction * periodsPerYear;
    const annualNHF     = nhfDeduction * periodsPerYear;
    const annualPAYE    = calculateAnnualPAYE(annualGross, annualPension, annualNHF);
    payeDeduction = Math.round((annualPAYE / periodsPerYear) * 100) / 100;
  }

  return { payeDeduction, pensionDeduction, nhfDeduction };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreatePayrollRunDTO {
  periodLabel: string;
  periodStart: string;
  periodEnd:   string;
  employeeIds?: string[];   // omit to include every staff member with a salary set
}

export interface UpdatePayslipDTO {
  allowances?: number;
  otherDeductions?: number;
}

export interface MarkPayslipPaidDTO {
  paymentReference?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class PayrollService {

  async getPreferences(userId: string): Promise<IPayrollPreferences> {
    const owner = await User.findById(userId).select('settings.payrollPreferences');
    return { ...DEFAULT_PAYROLL_PREFERENCES, ...toPlainPreferences(owner?.settings?.payrollPreferences) };
  }

  async updatePreferences(userId: string, payload: Partial<IPayrollPreferences>, actorId: string): Promise<IPayrollPreferences> {
    const owner = await User.findById(userId);
    if (!owner) throw new Error('User not found.');

    if (!owner.settings) owner.settings = {};
    const merged: IPayrollPreferences = {
      ...DEFAULT_PAYROLL_PREFERENCES,
      ...toPlainPreferences(owner.settings.payrollPreferences),
      ...payload,
    };
    owner.settings.payrollPreferences = merged;
    await owner.save();

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.update_preferences',
      description: 'Payroll preferences updated',
      resourceId: userId,
    });

    return merged;
  }

  /**
   * List staff eligible for payroll (active, has a salary set) — for the
   * "create run" UI to pick from.
   */
  async getEligibleEmployees(userId: string) {
    return User.find({
      ownerId: userId,
      role: 'staff',
      isActive: true,
      'employeeProfile.salary': { $exists: true, $gt: 0 },
    }).select('firstName lastName employeeProfile');
  }

  async createRun(userId: string, actorId: string, payload: CreatePayrollRunDTO): Promise<IPayrollRun> {
    const query: Record<string, any> = {
      ownerId: userId,
      role: 'staff',
      isActive: true,
      'employeeProfile.salary': { $exists: true, $gt: 0 },
    };
    if (payload.employeeIds?.length) query._id = { $in: payload.employeeIds };

    const staffList = await User.find(query).select('firstName lastName employeeProfile');
    if (staffList.length === 0) {
      throw new Error('No staff with payroll info (salary set) found to include in this run. Set a salary on their employee profile first.');
    }

    const prefs = await this.getPreferences(userId);

    const payslips = staffList.map(s => {
      const baseSalary   = s.employeeProfile!.salary!;
      const payFrequency = s.employeeProfile!.payFrequency ?? 'monthly';
      const allowances   = 0;
      const grossPay     = baseSalary + allowances;

      const { payeDeduction, pensionDeduction, nhfDeduction } = computeStatutoryDeductions(grossPay, payFrequency, prefs);
      const otherDeductions = 0;
      const totalDeductions = payeDeduction + pensionDeduction + nhfDeduction + otherDeductions;

      return {
        employeeId:   s._id.toString(),
        employeeName: `${s.firstName} ${s.lastName}`.trim(),
        employeeCode: s.employeeProfile?.employeeCode,
        jobTitle:     s.employeeProfile?.jobTitle,
        bankDetails:  s.employeeProfile?.bankDetails,
        payFrequency,
        baseSalary,
        allowances,
        grossPay,
        payeDeduction,
        pensionDeduction,
        nhfDeduction,
        otherDeductions,
        totalDeductions,
        netPay: grossPay - totalDeductions,
        status: 'pending' as const,
      };
    });

    const run = new PayrollRun({
      userId,
      periodLabel: payload.periodLabel,
      periodStart: new Date(payload.periodStart),
      periodEnd:   new Date(payload.periodEnd),
      payslips,
      totalGross:      payslips.reduce((sum, p) => sum + p.grossPay, 0),
      totalDeductions: payslips.reduce((sum, p) => sum + p.totalDeductions, 0),
      totalNet:        payslips.reduce((sum, p) => sum + p.netPay, 0),
      createdBy: actorId,
    });

    let saved: IPayrollRun;
    try {
      saved = await run.save();
    } catch (error: any) {
      if (error?.name === 'ValidationError') throw new ApiError(400, error.message);
      throw error;
    }

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.create_run',
      description: `Payroll run ${saved.runNumber} created for ${payload.periodLabel} (${payslips.length} employee${payslips.length === 1 ? '' : 's'})`,
      resourceId: saved._id,
      amount: saved.totalNet,
    });

    return saved;
  }

  async getAllRuns(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [runs, total] = await Promise.all([
      PayrollRun.find({ userId }).select('-payslips').sort({ createdAt: -1 }).skip(skip).limit(limit),
      PayrollRun.countDocuments({ userId }),
    ]);
    return { runs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getRunById(userId: string, runId: string): Promise<IPayrollRun> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');
    return run;
  }

  /**
   * Adjust one employee's allowances/deductions within a draft run and
   * recompute both that payslip's and the run's totals.
   */
  async updatePayslip(userId: string, runId: string, payslipId: string, payload: UpdatePayslipDTO, actorId: string): Promise<IPayrollRun> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');
    if (run.status !== 'draft') throw new Error('Only draft payroll runs can be edited.');

    const payslip = (run.payslips as any).id(payslipId);
    if (!payslip) throw new Error('Payslip not found in this run.');

    if (payload.allowances !== undefined) payslip.allowances = payload.allowances;
    if (payload.otherDeductions !== undefined) payslip.otherDeductions = payload.otherDeductions;
    payslip.grossPay = payslip.baseSalary + payslip.allowances;

    // Allowances changing shifts gross income, so statutory deductions are
    // recomputed against the business's CURRENT preferences (still safe to
    // do since edits are only allowed while the run is a draft).
    const prefs = await this.getPreferences(userId);
    const { payeDeduction, pensionDeduction, nhfDeduction } = computeStatutoryDeductions(payslip.grossPay, payslip.payFrequency, prefs);
    payslip.payeDeduction    = payeDeduction;
    payslip.pensionDeduction = pensionDeduction;
    payslip.nhfDeduction      = nhfDeduction;
    payslip.totalDeductions   = payeDeduction + pensionDeduction + nhfDeduction + payslip.otherDeductions;
    payslip.netPay = payslip.grossPay - payslip.totalDeductions;

    run.totalGross      = run.payslips.reduce((sum, p) => sum + p.grossPay, 0);
    run.totalDeductions = run.payslips.reduce((sum, p) => sum + p.totalDeductions, 0);
    run.totalNet         = run.payslips.reduce((sum, p) => sum + p.netPay, 0);

    const saved = await run.save();

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.update_payslip',
      description: `Payslip updated for ${payslip.employeeName} in ${run.runNumber}`,
      resourceId: run._id,
      amount: payslip.netPay,
    });

    return saved;
  }

  async completeRun(userId: string, runId: string, actorId: string): Promise<IPayrollRun> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');
    if (run.status !== 'draft') throw new Error('Only draft payroll runs can be completed.');

    run.status = 'completed';
    run.completedAt = new Date();
    const saved = await run.save();

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.complete_run',
      description: `Payroll run ${saved.runNumber} completed`,
      resourceId: saved._id,
      amount: saved.totalNet,
    });

    return saved;
  }

  async cancelRun(userId: string, runId: string, actorId: string): Promise<IPayrollRun> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');
    if (run.status === 'completed') throw new Error('Cannot cancel a completed payroll run.');
    if (run.payslips.some(p => p.status === 'paid')) throw new Error('Cannot cancel a run that already has paid payslips.');

    run.status = 'cancelled';
    const saved = await run.save();

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.cancel_run',
      description: `Payroll run ${saved.runNumber} cancelled`,
      resourceId: saved._id,
    });

    return saved;
  }

  /**
   * Mark one employee's payslip as paid — and record it as a real business
   * expense (category "Payroll") so it flows into expense reports/summaries
   * like any other spend. This is the moment money actually leaves the
   * business, so the expense date is "now", not the run's period date.
   */
  async markPayslipPaid(userId: string, runId: string, payslipId: string, payload: MarkPayslipPaidDTO, actorId: string): Promise<IPayrollRun> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');

    const payslip = (run.payslips as any).id(payslipId);
    if (!payslip) throw new Error('Payslip not found in this run.');
    if (payslip.status === 'paid') throw new Error('This payslip is already marked as paid.');

    let category = await ExpenseCategory.findOne({
      $or: [
        { userId, name: { $regex: '^payroll$', $options: 'i' } },
        { system: true, name: { $regex: '^payroll$', $options: 'i' } },
      ],
    });
    if (!category) category = await ExpenseCategory.create({ userId, name: 'Payroll' });

    const expense = await Expense.create({
      userId,
      amount: payslip.netPay,
      categoryId: category._id,
      vendor: payslip.employeeName,
      note: `Salary payment — ${run.periodLabel} (${run.runNumber})`,
    });

    payslip.status            = 'paid';
    payslip.paidAt            = new Date();
    payslip.paymentReference  = payload.paymentReference;
    payslip.expenseId         = expense._id.toString();

    const saved = await run.save();

    const { actorName, actorRole } = await getActorInfo(actorId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId,
      actorName,
      actorRole,
      action: 'payroll.mark_paid',
      description: `${payslip.employeeName} paid ₦${payslip.netPay.toLocaleString()} for ${run.periodLabel}`,
      resourceId: run._id,
      amount: payslip.netPay,
    });

    return saved;
  }

  async deleteRun(userId: string, runId: string): Promise<void> {
    const run = await PayrollRun.findOne({ _id: runId, userId });
    if (!run) throw new Error('Payroll run not found.');
    if (run.status === 'completed') throw new Error('Cannot delete a completed payroll run.');
    if (run.payslips.some(p => p.status === 'paid')) throw new Error('Cannot delete a run with paid payslips.');

    await PayrollRun.findByIdAndDelete(runId);
  }

}

export default new PayrollService();
