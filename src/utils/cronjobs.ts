import cron from 'node-cron';
import InvoiceService from '../services/invoice.service';

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
  });
}
