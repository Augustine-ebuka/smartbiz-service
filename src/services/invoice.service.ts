import { Invoice, IInvoice, ILineItem, InvoiceStatus, DiscountType, RecurringInterval } from '../models/invoice.model';
import ApiError from '../utils/ApiError';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface LineItemDTO {
  description: string;
  quantity:    number;
  unitPrice:   number;
  productId?:  string;
}

export interface CreateInvoiceDTO {
  sourceTransactionId?: string;
  customerId?:      string;
  customerName:     string;
  customerEmail?:   string;
  customerPhone?:   string;
  customerAddress?: string;
  issueDate?:       string;
  dueDate:          string;
  lineItems:        LineItemDTO[];
  taxPercent?:      number;
  discountType?:    DiscountType;
  discountValue?:   number;
  currency?:        string;
  notes?:           string;
  status?:          'draft' | 'sent';
  recurring?: {
    enabled:   boolean;
    interval:  RecurringInterval;
    endDate?:  string;
  };
}

export type UpdateInvoiceDTO = Partial<CreateInvoiceDTO>;

export interface InvoiceFilterDTO {
  status?:     InvoiceStatus;
  customerId?: string;
  startDate?:  string;
  endDate?:    string;
  search?:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTotals(
  lineItems:     LineItemDTO[],
  taxPercent:    number,
  discountType:  DiscountType,
  discountValue: number
) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = Math.round((subtotal * taxPercent) / 100 * 100) / 100;

  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = Math.round((subtotal * discountValue) / 100 * 100) / 100;
  } else {
    discountAmount = discountValue;
  }

  const total = Math.max(0, subtotal + taxAmount - discountAmount);

  return { subtotal, taxAmount, discountAmount, total };
}

function nextRecurringDate(interval: RecurringInterval, from: Date): Date {
  const d = new Date(from);
  switch (interval) {
    case 'weekly':    d.setDate(d.getDate() + 7);      break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);    break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);    break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class InvoiceService {

  async create(userId: string, payload: CreateInvoiceDTO): Promise<IInvoice> {
    if (!payload.lineItems || payload.lineItems.length === 0) {
      throw new Error('At least one line item is required.');
    }

    const taxPercent    = payload.taxPercent    ?? 0;
    const discountType  = payload.discountType  ?? 'NGN';
    const discountValue = payload.discountValue ?? 0;

    const { subtotal, taxAmount, discountAmount, total } = computeTotals(
      payload.lineItems, taxPercent, discountType, discountValue
    );

    const lineItems: ILineItem[] = payload.lineItems.map(item => ({
      description: item.description,
      quantity:    item.quantity,
      unitPrice:   item.unitPrice,
      amount:      item.quantity * item.unitPrice,
      productId:   item.productId,
    }));

    const issueDate = payload.issueDate ? new Date(payload.issueDate) : new Date();

    // Build recurring config if enabled
    let recurring;
    if (payload.recurring?.enabled) {
      recurring = {
        enabled:       true,
        interval:      payload.recurring.interval,
        nextIssueDate: nextRecurringDate(payload.recurring.interval, issueDate),
        endDate:       payload.recurring.endDate ? new Date(payload.recurring.endDate) : undefined,
        occurrences:   0,
      };
    }

    const invoice = new Invoice({
      userId,
      sourceTransactionId: payload.sourceTransactionId,
      customerId:      payload.customerId,
      customerName:    payload.customerName,
      customerEmail:   payload.customerEmail,
      customerPhone:   payload.customerPhone,
      customerAddress: payload.customerAddress,
      issueDate,
      dueDate:         new Date(payload.dueDate),
      lineItems,
      subtotal,
      taxPercent,
      taxAmount,
      discountType,
      discountValue,
      discountAmount,
      total,
      currency:        payload.currency ?? 'NGN',
      notes:           payload.notes,
      status:          payload.status ?? 'draft',
      recurring,
    });

    try {
      return await invoice.save();
    } catch (error: any) {
      if (error?.name === 'ValidationError') {
        throw new ApiError(400, error.message);
      }
      throw error;
    }
  }

  async getAll(
    userId: string,
    filters: InvoiceFilterDTO = {},
    page  = 1,
    limit = 20
  ): Promise<{ invoices: any[]; total: number; page: number; totalPages: number }> {
    const query: Record<string, any> = { userId };

    if (filters.status)     query.status     = filters.status;
    if (filters.customerId) query.customerId = filters.customerId;

    if (filters.search) {
      query.$or = [
        { customerName:  { $regex: filters.search, $options: 'i' } },
        { invoiceNumber: { $regex: filters.search, $options: 'i' } },
        { customerEmail: { $regex: filters.search, $options: 'i' } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      query.issueDate = {};
      if (filters.startDate) query.issueDate.$gte = new Date(filters.startDate);
      if (filters.endDate)   query.issueDate.$lte = new Date(`${filters.endDate}T23:59:59.999Z`);
    }

    const skip  = (page - 1) * limit;
    const total = await Invoice.countDocuments(query);

    // itemCount is computed here (via $size) so the list view can show "3 items"
    // without ever pulling the full lineItems array over the wire — full line
    // items are still only available via getById() for the detail view.
    const invoices = await Invoice.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $addFields: { itemCount: { $size: { $ifNull: ['$lineItems', []] } } } },
      { $project: { lineItems: 0 } },
    ]);

    return { invoices, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getById(userId: string, invoiceId: string): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');
    return invoice;
  }

  async update(userId: string, invoiceId: string, payload: UpdateInvoiceDTO): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');

    if (invoice.status === 'paid') {
      throw new Error('Cannot edit a paid invoice.');
    }
    if (invoice.status === 'cancelled') {
      throw new Error('Cannot edit a cancelled invoice.');
    }

    // Recompute totals if line items or tax/discount changed
    const lineItems     = payload.lineItems     ?? invoice.lineItems;
    const taxPercent    = payload.taxPercent    ?? invoice.taxPercent;
    const discountType  = payload.discountType  ?? invoice.discountType;
    const discountValue = payload.discountValue ?? invoice.discountValue;

    const { subtotal, taxAmount, discountAmount, total } = computeTotals(
      lineItems.map(i => ({
        description: (i as any).description,
        quantity:    (i as any).quantity,
        unitPrice:   (i as any).unitPrice,
        productId:   (i as any).productId,
      })),
      taxPercent,
      discountType,
      discountValue
    );

    const computedLineItems = lineItems.map((item: any) => ({
      ...item,
      amount: item.quantity * item.unitPrice,
    }));

    let updated;
    try {
      updated = await Invoice.findByIdAndUpdate(
        invoiceId,
        {
          $set: {
            ...(payload.customerName    && { customerName:    payload.customerName }),
            ...(payload.customerEmail   && { customerEmail:   payload.customerEmail }),
            ...(payload.customerPhone   && { customerPhone:   payload.customerPhone }),
            ...(payload.customerAddress && { customerAddress: payload.customerAddress }),
            ...(payload.dueDate         && { dueDate:         new Date(payload.dueDate) }),
            ...(payload.issueDate       && { issueDate:       new Date(payload.issueDate) }),
            ...(payload.notes           !== undefined && { notes: payload.notes }),
            ...(payload.status          && { status: payload.status }),
            ...(payload.currency        && { currency: payload.currency }),
            lineItems: computedLineItems,
            subtotal,
            taxPercent,
            taxAmount,
            discountType,
            discountValue,
            discountAmount,
            total,
          },
        },
        { new: true, runValidators: true }
      );
    } catch (error: any) {
      if (error?.name === 'ValidationError') {
        throw new ApiError(400, error.message);
      }
      throw error;
    }

    if (!updated) throw new Error('Invoice not found.');
    return updated;
  }

  async markAsPaid(userId: string, invoiceId: string): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'paid') throw new Error('Invoice is already marked as paid.');

    invoice.status = 'paid';
    invoice.paidAt = new Date();
    return invoice.save();
  }

  async markAsSent(userId: string, invoiceId: string): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status !== 'draft') throw new Error('Only draft invoices can be marked as sent.');

    invoice.status = 'sent';
    return invoice.save();
  }

  async cancel(userId: string, invoiceId: string): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'paid') throw new Error('Cannot cancel a paid invoice.');

    invoice.status = 'cancelled';
    return invoice.save();
  }

  async delete(userId: string, invoiceId: string): Promise<void> {
    const invoice = await Invoice.findOne({ _id: invoiceId, userId });
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'paid') throw new Error('Cannot delete a paid invoice.');

    await Invoice.findByIdAndDelete(invoiceId);
  }

  /**
   * Mark overdue invoices — run this on a cron job daily
   * Finds all sent invoices past their due date and marks them overdue
   */
  async markOverdueInvoices(): Promise<number> {
    const result = await Invoice.updateMany(
      {
        status:  'sent',
        dueDate: { $lt: new Date() },
      },
      { $set: { status: 'overdue' } }
    );
    return result.modifiedCount;
  }

  /**
   * Process recurring invoices — run this on a cron job daily
   * Finds invoices due to recur today and creates new copies
   */
  async processRecurringInvoices(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const recurringInvoices = await Invoice.find({
      'recurring.enabled':       true,
      'recurring.nextIssueDate': { $lte: today },
      status:                    { $ne: 'cancelled' },
    });

    let processed = 0;

    for (const invoice of recurringInvoices) {
      const recurring = invoice.recurring!;

      // Stop if endDate passed
      if (recurring.endDate && recurring.endDate < today) {
        await Invoice.findByIdAndUpdate(invoice._id, {
          $set: { 'recurring.enabled': false },
        });
        continue;
      }

      // Create new invoice as a copy
      const newInvoice = new Invoice({
        userId:          invoice.userId,
        customerId:      invoice.customerId,
        customerName:    invoice.customerName,
        customerEmail:   invoice.customerEmail,
        customerPhone:   invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        issueDate:       today,
        dueDate:         new Date(today.getTime() + (invoice.dueDate.getTime() - invoice.issueDate.getTime())),
        lineItems:       invoice.lineItems,
        subtotal:        invoice.subtotal,
        taxPercent:      invoice.taxPercent,
        taxAmount:       invoice.taxAmount,
        discountType:    invoice.discountType,
        discountValue:   invoice.discountValue,
        discountAmount:  invoice.discountAmount,
        total:           invoice.total,
        currency:        invoice.currency,
        notes:           invoice.notes,
        status:          'sent',
        recurring: {
          enabled:       true,
          interval:      recurring.interval,
          nextIssueDate: nextRecurringDate(recurring.interval, today),
          endDate:       recurring.endDate,
          occurrences:   recurring.occurrences + 1,
        },
      });

      await newInvoice.save();

      // Update the parent invoice's nextIssueDate and occurrences
      await Invoice.findByIdAndUpdate(invoice._id, {
        $set: {
          'recurring.nextIssueDate': nextRecurringDate(recurring.interval, today),
          'recurring.occurrences':   recurring.occurrences + 1,
        },
      });

      processed++;
    }

    return processed;
  }

  async getSummary(userId: string) {
    const [byStatus, totalOutstanding, overdueAmount] = await Promise.all([
      Invoice.aggregate([
        { $match: { userId } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { userId, status: { $in: ['sent', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { userId, status: 'overdue' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const statusMap: Record<string, { count: number; total: number }> = {};
    byStatus.forEach((s: any) => { statusMap[s._id] = { count: s.count, total: s.total }; });

    return {
      draft:           statusMap.draft    ?? { count: 0, total: 0 },
      sent:            statusMap.sent     ?? { count: 0, total: 0 },
      paid:            statusMap.paid     ?? { count: 0, total: 0 },
      overdue:         statusMap.overdue  ?? { count: 0, total: 0 },
      cancelled:       statusMap.cancelled ?? { count: 0, total: 0 },
      totalOutstanding: totalOutstanding[0]?.total ?? 0,
      overdueAmount:    overdueAmount[0]?.total    ?? 0,
    };
  }

}

export default new InvoiceService();
