import cron from 'node-cron';
import InvoiceService from '../services/invoice.service';
import notificationService from '../services/notificationService';

export function initCronJobs() {
  // Every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      const overdue   = await InvoiceService.markOverdueInvoices();
      const recurring = await InvoiceService.processRecurringInvoices();
      console.log(`[Cron] ${overdue} invoices marked overdue, ${recurring} recurring invoices created`);
    } catch (error) {
      console.error('[Cron] Invoice maintenance job failed:', error);
    }

    // Runs after markOverdueInvoices() above, so invoices are already
    // correctly flagged 'overdue' before this checks due dates.
    try {
      const result = await notificationService.generateDueDateNotifications();
      console.log(`[Cron] Due-date notifications: checked ${result.debtsChecked} debts + ${result.invoicesChecked} invoices, created ${result.created}`);
    } catch (error) {
      console.error('[Cron] Due-date notification job failed:', error);
    }
  });
}
