import { Request, Response, NextFunction } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { Product } from '../models/product.model';
import { Customer } from '../models/customer.model';
import { Income } from '../models/income.model';
import { Expense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
// ─── Multer — memory storage (no disk write) ──────────────────────────────────

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed.'));
    }
  },
}).single('file');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(value: any): Date {
  if (!value) return new Date();
  // Excel stores dates as serial numbers
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  return new Date(value);
}

function toNumber(value: any): number {
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Controller ───────────────────────────────────────────────────────────────

class BulkImportController {

  /**
   * GET /api/bulk/template/income
   * Returns a downloadable Excel template for income
   */
  async downloadIncomeTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string || '';

      // Fetch this user's products and customers to show in a reference sheet
      const [products, customers] = await Promise.all([
        Product.find({ userId }).select('name type price').lean(),
        Customer.find({ userId }).select('name email').lean(),
      ]);

      const wb = XLSX.utils.book_new();

      // ── Main import sheet ──────────────────────────────────────────────────
      const incomeData = [
        // Headers
        ['product_name', 'unit', 'amount', 'customer_name', 'payment_method', 'date', 'note'],
        // Sample row
        ['Office Chair', 2, 90000, 'Emeka Nwosu', 'Cash', '2026-07-01', 'Sample row — delete this'],
      ];
      const incomeSheet = XLSX.utils.aoa_to_sheet(incomeData);

      // Column widths
      incomeSheet['!cols'] = [
        { wch: 25 }, { wch: 8 }, { wch: 12 }, { wch: 25 },
        { wch: 18 }, { wch: 14 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, incomeSheet, 'Income Import');

      // ── Products reference sheet ───────────────────────────────────────────
      const productRows = [
        ['product_name', 'type', 'price'],
        ...products.map(p => [p.name, p.type, p.price]),
      ];
      const productSheet = XLSX.utils.aoa_to_sheet(productRows);
      productSheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, productSheet, 'Your Products (Reference)');

      // ── Customers reference sheet ──────────────────────────────────────────
      const customerRows = [
        ['customer_name', 'email'],
        ...customers.map(c => [c.name, c.email ?? '']),
      ];
      const customerSheet = XLSX.utils.aoa_to_sheet(customerRows);
      customerSheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, customerSheet, 'Your Customers (Reference)');

      // ── Payment methods reference ──────────────────────────────────────────
      const methodSheet = XLSX.utils.aoa_to_sheet([
        ['payment_method (use exactly as shown)'],
        ['Cash'], ['Bank Transfer'], ['Card'], ['Mobile Money'], ['Cheque'], ['Other'],
      ]);
      XLSX.utils.book_append_sheet(wb, methodSheet, 'Payment Methods (Reference)');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="income_import_template.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/bulk/template/expense
   * Returns a downloadable Excel template for expenses
   */
  async downloadExpenseTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string || '';

      const categories = await ExpenseCategory.find({ userId }).select('name').lean();

      const wb = XLSX.utils.book_new();

      // ── Main import sheet ──────────────────────────────────────────────────
      const expenseData = [
        ['amount', 'category_name', 'date', 'vendor', 'note'],
        [15000, 'Rent', '2026-07-01', 'Office Landlord', 'Sample row — delete this'],
      ];
      const expenseSheet = XLSX.utils.aoa_to_sheet(expenseData);
      expenseSheet['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, expenseSheet, 'Expense Import');

      // ── Categories reference sheet ─────────────────────────────────────────
      const catRows = [
        ['category_name (use exactly as shown)'],
        ...categories.map(c => [c.name]),
        ['Uncategorized'],  // always include fallback
      ];
      const catSheet = XLSX.utils.aoa_to_sheet(catRows);
      catSheet['!cols'] = [{ wch: 30 }];
      XLSX.utils.book_append_sheet(wb, catSheet, 'Categories (Reference)');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="expense_import_template.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/bulk/import/income
   * Multipart — field: "file" (.xlsx)
   */
  async importIncome(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const userId = (req as any).businessOwnerId as string || '';
      

      // Parse Excel from buffer
      const wb      = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheet   = wb.Sheets[wb.SheetNames[0]];
      const rows    = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      if (rows.length === 0) {
        res.status(400).json({ success: false, message: 'The sheet is empty.' });
        return;
      }

      // Pre-fetch all products and customers for this user — resolve names → IDs
      const [products, customers] = await Promise.all([
        Product.find({ userId }).select('_id name').lean(),
        Customer.find({ userId }).select('_id name').lean(),
      ]);

      // Build lookup maps (lowercase for case-insensitive matching)
      const productMap  = new Map(products.map(p  => [p.name.toLowerCase(),  p._id]));
      const customerMap = new Map(customers.map(c => [c.name.toLowerCase(), c._id]));

      const validRows:   any[] = [];
      const errorRows:   { row: number; error: string }[] = [];
      const VALID_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque', 'Other','Monnify'];

      rows.forEach((row: any, index: number) => {
        const rowNum = index + 2;  // +2 because row 1 is headers

        const amount = toNumber(row['amount']);
        if (!amount || amount <= 0) {
          errorRows.push({ row: rowNum, error: 'amount is missing or invalid.' });
          return;
        }

        const paymentMethod = String(row['payment_method'] ?? 'Cash').trim();
        if (!VALID_METHODS.includes(paymentMethod)) {
          errorRows.push({ row: rowNum, error: `Invalid payment_method "${paymentMethod}". Check the Payment Methods sheet.` });
          return;
        }

        // Resolve product name → ID (optional)
        const productName = String(row['product_name'] ?? '').trim().toLowerCase();
        const productId   = productName ? productMap.get(productName) : undefined;
        if (productName && !productId) {
          errorRows.push({ row: rowNum, error: `Product "${row['product_name']}" not found in your catalog.` });
          return;
        }

        // Resolve customer name → ID (optional)
        const customerName = String(row['customer_name'] ?? '').trim().toLowerCase();
        const customerId   = customerName ? customerMap.get(customerName) : undefined;
        // Don't block on missing customer — just skip the link

        validRows.push({
          userId,
          productId,
          customerId,
          unit:          toNumber(row['unit'])  || 1,
          amount,
          paymentMethod,
          date:          parseDate(row['date']),
          note:          String(row['note'] ?? '').trim() || undefined,
        });
      });

      // Bulk insert all valid rows
      let inserted = 0;
      if (validRows.length > 0) {
        await Income.insertMany(validRows, { ordered: false });
        inserted = validRows.length;
      }

      res.status(200).json({
        success: true,
        message: `Import complete. ${inserted} records imported${errorRows.length > 0 ? `, ${errorRows.length} rows had errors.` : '.'}`,
        data: {
          imported: inserted,
          failed:   errorRows.length,
          errors:   errorRows,    // send back row-level errors so FE can show them
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/bulk/import/expense
   * Multipart — field: "file" (.xlsx)
   */
  async importExpense(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const userId = (req as any).businessOwnerId as string || '';

      const wb    = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      if (rows.length === 0) {
        res.status(400).json({ success: false, message: 'The sheet is empty.' });
        return;
      }

      const categories = await ExpenseCategory.find({ userId }).select('_id name').lean();
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c._id]));

      const validRows:  any[] = [];
      const errorRows:  { row: number; error: string }[] = [];

      rows.forEach((row: any, index: number) => {
        const rowNum = index + 2;

        const amount = toNumber(row['amount']);
        if (!amount || amount <= 0) {
          errorRows.push({ row: rowNum, error: 'amount is missing or invalid.' });
          return;
        }

        // Resolve category name → ID (optional — falls back to uncategorized)
        const categoryName = String(row['category_name'] ?? '').trim().toLowerCase();
        const categoryId   = categoryName ? categoryMap.get(categoryName) : undefined;
        if (categoryName && categoryName !== 'uncategorized' && !categoryId) {
          errorRows.push({ row: rowNum, error: `Category "${row['category_name']}" not found. Check the Categories sheet.` });
          return;
        }

        validRows.push({
          userId,
          categoryId,
          amount,
          date:   parseDate(row['date']),
          vendor: String(row['vendor'] ?? '').trim() || undefined,
          note:   String(row['note']   ?? '').trim() || undefined,
        });
      });

      let inserted = 0;
      if (validRows.length > 0) {
        await Expense.insertMany(validRows, { ordered: false });
        inserted = validRows.length;
      }

      res.status(200).json({
        success: true,
        message: `Import complete. ${inserted} records imported${errorRows.length > 0 ? `, ${errorRows.length} rows had errors.` : '.'}`,
        data: {
          imported: inserted,
          failed:   errorRows.length,
          errors:   errorRows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
// ADD THESE TWO METHODS inside the BulkImportController class
// ─────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/bulk/template/customers
   * Returns a downloadable Excel template for customer bulk upload
   */
  async downloadCustomerTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const wb = XLSX.utils.book_new();

      // ── Main import sheet ──────────────────────────────────────────────────
      const customerData = [
        // Headers
        ['name', 'email', 'phone', 'address', 'notes'],
        // Sample rows
        ['Emeka Nwosu',   'emeka@gmail.com',    '+2348031234567', '14 Allen Avenue, Ikeja, Lagos',  'VIP customer'],
        ['Chidinma Obi',  'chidinma@yahoo.com', '+2348056789012', '22 Aba Road, Port Harcourt',     ''],
        ['Tunde Fashola', '',                   '+2348099990000', '',                                'Prefers cash'],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(customerData);

      // Column widths
      sheet['!cols'] = [
        { wch: 25 },  // name
        { wch: 30 },  // email
        { wch: 18 },  // phone
        { wch: 40 },  // address
        { wch: 30 },  // notes
      ];

      XLSX.utils.book_append_sheet(wb, sheet, 'Customer Import');

      // ── Instructions sheet ─────────────────────────────────────────────────
      const instructions = [
        ['INSTRUCTIONS'],
        [''],
        ['1. Fill in the "Customer Import" sheet with your customer data'],
        ['2. Only "name" is required — all other fields are optional'],
        ['3. Delete the 3 sample rows before uploading'],
        ['4. Do not change or delete the header row'],
        ['5. Duplicate emails will be skipped automatically'],
        ['6. Save as .xlsx before uploading'],
      ];
      const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
      instrSheet['!cols'] = [{ wch: 55 }];
      XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="customer_import_template.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/bulk/import/customers
   * Multipart — field: "file" (.xlsx)
   */
  async importCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const userId = (req as any).businessOwnerId as string || '';

      const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      if (rows.length === 0) {
        res.status(400).json({ success: false, message: 'The sheet is empty.' });
        return;
      }

      // Pre-fetch existing emails for this user to skip duplicates
      const existingCustomers = await Customer.find({ userId }).select('email phone').lean();
      const existingEmails    = new Set(existingCustomers.map(c => c.email?.toLowerCase()).filter(Boolean));
      const existingPhones    = new Set(existingCustomers.map(c => c.phone?.trim()).filter(Boolean));

      const validRows:    any[]                                  = [];
      const errorRows:    { row: number; error: string }[]       = [];
      const skippedRows:  { row: number; reason: string }[]      = [];

      rows.forEach((row: any, index: number) => {
        const rowNum = index + 2;  // +2 because row 1 is headers

        const name = String(row['name'] ?? '').trim();
        if (!name) {
          errorRows.push({ row: rowNum, error: 'name is required.' });
          return;
        }

        const email = String(row['email'] ?? '').trim().toLowerCase() || undefined;
        const phone = String(row['phone'] ?? '').trim() || undefined;

        // Skip duplicate emails
        if (email && existingEmails.has(email)) {
          skippedRows.push({ row: rowNum, reason: `Customer with email "${email}" already exists.` });
          return;
        }

        // Skip duplicate phones
        if (phone && existingPhones.has(phone)) {
          skippedRows.push({ row: rowNum, reason: `Customer with phone "${phone}" already exists.` });
          return;
        }

        // Track within this batch to catch duplicates in the same sheet
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);

        validRows.push({
          userId,
          name,
          email,
          phone,
          address: String(row['address'] ?? '').trim() || undefined,
          notes:   String(row['notes']   ?? '').trim() || undefined,
        });
      });

      let inserted = 0;
      if (validRows.length > 0) {
        await Customer.insertMany(validRows, { ordered: false });
        inserted = validRows.length;
      }

      res.status(200).json({
        success: true,
        message: `Import complete. ${inserted} customers imported${
          errorRows.length   > 0 ? `, ${errorRows.length} rows had errors`     : ''
        }${
          skippedRows.length > 0 ? `, ${skippedRows.length} duplicates skipped` : ''
        }.`,
        data: {
          imported: inserted,
          failed:   errorRows.length,
          skipped:  skippedRows.length,
          errors:   errorRows,
          skippedDetails: skippedRows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new BulkImportController();