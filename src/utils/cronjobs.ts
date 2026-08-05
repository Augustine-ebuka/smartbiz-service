import InvoiceService from './services/invoice.service';

// Every day at midnight
cron.schedule('0 0 * * *', async () => {
  const overdue   = await InvoiceService.markOverdueInvoices();
  const recurring = await InvoiceService.processRecurringInvoices();
  console.log(`[Cron] ${overdue} invoices marked overdue, ${recurring} recurring invoices created`);
});