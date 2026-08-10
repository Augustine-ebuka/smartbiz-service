import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner, requireOwner } from '../middlewares/businessOwnerMiddleware';
import PayrollController from '../controllers/payrollController';

const router = Router();

// Payroll touches salary data — owner only, not saleskeepers.
router.use(authenticateToken, resolveBusinessOwner, requireOwner);

// GET    /api/payroll/preferences                              → statutory deduction settings
// PATCH  /api/payroll/preferences                               → update them (affects future runs only)
// GET    /api/payroll/eligible-employees                       → staff with a salary set
// POST   /api/payroll/runs                                     → create a draft run
// GET    /api/payroll/runs                                     → list runs (paginated)
// GET    /api/payroll/runs/:id                                 → single run with full payslips
// PATCH  /api/payroll/runs/:id/payslips/:payslipId              → adjust allowances/other deductions (draft only)
// PATCH  /api/payroll/runs/:id/complete                        → lock the run
// PATCH  /api/payroll/runs/:id/cancel                          → cancel a draft run
// PATCH  /api/payroll/runs/:id/payslips/:payslipId/mark-paid    → pay one employee, logs an Expense
// DELETE /api/payroll/runs/:id                                 → delete a draft run

router.get   ('/preferences',                         PayrollController.getPreferences);
router.patch ('/preferences',                         PayrollController.updatePreferences);
router.get   ('/eligible-employees',                 PayrollController.getEligibleEmployees);
router.post  ('/runs',                                PayrollController.createRun);
router.get   ('/runs',                                PayrollController.getAllRuns);
router.get   ('/runs/:id',                            PayrollController.getRunById);
router.patch ('/runs/:id/payslips/:payslipId',        PayrollController.updatePayslip);
router.patch ('/runs/:id/complete',                   PayrollController.completeRun);
router.patch ('/runs/:id/cancel',                     PayrollController.cancelRun);
router.patch ('/runs/:id/payslips/:payslipId/mark-paid', PayrollController.markPayslipPaid);
router.delete('/runs/:id',                            PayrollController.deleteRun);

export default router;
