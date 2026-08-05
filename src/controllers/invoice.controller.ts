import { Request, Response, NextFunction } from 'express';
import InvoiceService from '../services/invoice.service';

// The frontend's invoice form uses its own field names (items, taxRate,
// discount, discountType: 'flat'|'percent') that don't match the backend's
// internal DTO (lineItems, taxPercent, discountValue, discountType:
// 'NGN'|'percentage'). Normalize at the controller boundary so the
// service/model layer keeps one clean internal shape. Native field names are
// honored first, so this stays backward-compatible with any caller already
// using the backend's own naming.
const DISCOUNT_TYPE_ALIASES: Record<string, 'NGN' | 'percentage'> = {
  flat: 'NGN',
  fixed: 'NGN',
  ngn: 'NGN',
  percent: 'percentage',
  percentage: 'percentage',
};

function normalizeInvoicePayload(body: any) {
  const normalized = { ...body };

  if (normalized.lineItems === undefined && Array.isArray(normalized.items)) {
    normalized.lineItems = normalized.items.map((item: any) => ({
      description: item.description,
      quantity:    item.quantity,
      unitPrice:   item.unitPrice,
      productId:   item.productId,
    }));
  }

  // taxRate and taxPercent are both plain percentage numbers (20 = 20%) — just a naming difference.
  if (normalized.taxPercent === undefined && typeof normalized.taxRate === 'number') {
    normalized.taxPercent = normalized.taxRate;
  }

  if (normalized.discountValue === undefined && typeof normalized.discount === 'number') {
    normalized.discountValue = normalized.discount;
  }

  if (typeof normalized.discountType === 'string') {
    const mapped = DISCOUNT_TYPE_ALIASES[normalized.discountType.toLowerCase()];
    if (mapped) normalized.discountType = mapped;
  }

  return normalized;
}

class InvoiceController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const payload = normalizeInvoicePayload(req.body);
      const { customerName, dueDate, lineItems } = payload;

      if (!customerName || !dueDate || !lineItems?.length) {
        res.status(400).json({ success: false, message: 'customerName, dueDate and at least one lineItem are required.' });
        return;
      }

      const invoice = await InvoiceService.create(userId, payload);
      res.status(201).json({ success: true, message: 'Invoice created.', data: invoice });
    } catch (error) { next(error); }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;
      const page   = parseInt(req.query.page  as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const result = await InvoiceService.getAll(userId, req.query as any, page, limit);
      res.status(200).json({ success: true, message: 'Invoices fetched.', data: result });
    } catch (error) { next(error); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const invoice = await InvoiceService.getById(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Invoice fetched.', data: invoice });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const payload = normalizeInvoicePayload(req.body);
      const invoice = await InvoiceService.update(userId, req.params.id, payload);
      res.status(200).json({ success: true, message: 'Invoice updated.', data: invoice });
    } catch (error) { next(error); }
  }

  async markAsPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const invoice = await InvoiceService.markAsPaid(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Invoice marked as paid.', data: invoice });
    } catch (error) { next(error); }
  }

  async markAsSent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const invoice = await InvoiceService.markAsSent(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Invoice marked as sent.', data: invoice });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const invoice = await InvoiceService.cancel(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Invoice cancelled.', data: invoice });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;
      await InvoiceService.delete(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Invoice deleted.' });
    } catch (error) { next(error); }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = req.businessOwnerId as string;
      const summary = await InvoiceService.getSummary(userId);
      res.status(200).json({ success: true, message: 'Invoice summary fetched.', data: summary });
    } catch (error) { next(error); }
  }

}

export default new InvoiceController();
