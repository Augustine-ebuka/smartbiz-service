import PDFDocument from 'pdfkit';
import { IInvoice } from '../models/invoice.model';

interface BusinessInfo {
  businessName: string;
  email?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

const BLUE   = '#1d4ed8';
const DARK   = '#111827';
const GRAY   = '#6b7280';
const LIGHT  = '#f3f4f6';

function fmtMoney(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-NG', { dateStyle: 'long', timeZone: 'Africa/Lagos' });
}

// Builds the invoice PDF in-memory and resolves with the full buffer once the
// document stream ends — callers don't need to know this runs on a stream.
export function buildInvoicePdf(invoice: IInvoice, business: BusinessInfo): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor(DARK).font('Helvetica-Bold').text(business.businessName);
    doc.fontSize(10).fillColor(GRAY).font('Helvetica');
    if (business.email) doc.text(business.email);
    if (business.phone) doc.text(business.phone);

    doc.fontSize(22).fillColor(BLUE).font('Helvetica-Bold')
      .text(`INVOICE`, 0, 50, { align: 'right' });
    doc.fontSize(11).fillColor(GRAY).font('Helvetica')
      .text(`#${invoice.invoiceNumber}`, { align: 'right' });

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LIGHT).stroke();
    doc.moveDown(1);

    // ── Bill to / dates ─────────────────────────────────────────────────────
    const infoTop = doc.y;

    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('BILL TO', 50, infoTop);
    doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold').text(invoice.customerName, 50, infoTop + 14);
    doc.fontSize(10).fillColor(GRAY).font('Helvetica');
    let y = infoTop + 30;
    if (invoice.customerEmail) { doc.text(invoice.customerEmail, 50, y); y += 14; }
    if (invoice.customerPhone) { doc.text(invoice.customerPhone, 50, y); y += 14; }
    if (invoice.customerAddress) { doc.text(invoice.customerAddress, 50, y, { width: 220 }); }

    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('ISSUE DATE', 350, infoTop, { width: 145, align: 'right' });
    doc.fontSize(11).fillColor(DARK).font('Helvetica').text(fmtDate(invoice.issueDate), 350, infoTop + 14, { width: 145, align: 'right' });
    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('DUE DATE', 350, infoTop + 36, { width: 145, align: 'right' });
    doc.fontSize(11).fillColor(DARK).font('Helvetica').text(fmtDate(invoice.dueDate), 350, infoTop + 50, { width: 145, align: 'right' });

    doc.y = Math.max(y, infoTop + 70) + 20;

    // ── Line items table ────────────────────────────────────────────────────
    const tableTop = doc.y;
    const col = { desc: 50, qty: 320, price: 390, total: 470 };

    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold');
    doc.text('ITEM', col.desc, tableTop);
    doc.text('QTY', col.qty, tableTop, { width: 50, align: 'right' });
    doc.text('PRICE', col.price, tableTop, { width: 70, align: 'right' });
    doc.text('TOTAL', col.total, tableTop, { width: 75, align: 'right' });
    doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor(LIGHT).stroke();

    let rowY = tableTop + 26;
    doc.font('Helvetica').fontSize(10).fillColor(DARK);
    for (const item of invoice.lineItems) {
      const rowHeight = doc.heightOfString(item.description, { width: 260 });
      doc.text(item.description, col.desc, rowY, { width: 260 });
      doc.text(String(item.quantity), col.qty, rowY, { width: 50, align: 'right' });
      doc.text(fmtMoney(invoice.currency, item.unitPrice), col.price, rowY, { width: 70, align: 'right' });
      doc.text(fmtMoney(invoice.currency, item.amount), col.total, rowY, { width: 75, align: 'right' });
      rowY += Math.max(rowHeight, 14) + 10;
      doc.moveTo(50, rowY - 6).lineTo(545, rowY - 6).strokeColor(LIGHT).stroke();
    }

    // ── Totals ──────────────────────────────────────────────────────────────
    let totalsY = rowY + 10;
    const totalsLabelX = 350, totalsValueX = 470;

    doc.fontSize(10).fillColor(GRAY).font('Helvetica');
    doc.text('Subtotal', totalsLabelX, totalsY, { width: 120, align: 'left' });
    doc.text(fmtMoney(invoice.currency, invoice.subtotal), totalsValueX, totalsY, { width: 75, align: 'right' });
    totalsY += 18;

    if (invoice.taxAmount) {
      doc.text(`Tax (${invoice.taxPercent}%)`, totalsLabelX, totalsY, { width: 120, align: 'left' });
      doc.text(fmtMoney(invoice.currency, invoice.taxAmount), totalsValueX, totalsY, { width: 75, align: 'right' });
      totalsY += 18;
    }

    if (invoice.discountAmount) {
      doc.text('Discount', totalsLabelX, totalsY, { width: 120, align: 'left' });
      doc.text(`-${fmtMoney(invoice.currency, invoice.discountAmount)}`, totalsValueX, totalsY, { width: 75, align: 'right' });
      totalsY += 18;
    }

    doc.moveTo(totalsLabelX, totalsY).lineTo(545, totalsY).strokeColor(LIGHT).stroke();
    totalsY += 10;

    doc.fontSize(12).fillColor(BLUE).font('Helvetica-Bold');
    doc.text('Total Due', totalsLabelX, totalsY, { width: 120, align: 'left' });
    doc.text(fmtMoney(invoice.currency, invoice.total), totalsValueX, totalsY, { width: 75, align: 'right' });
    totalsY += 30;

    // ── Payment details (bank account to pay into) ─────────────────────────
    if (business.bankName || business.accountNumber) {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('PAYMENT DETAILS', 50, totalsY);
      let payY = totalsY + 14;
      doc.fontSize(10).fillColor(DARK).font('Helvetica');
      if (business.bankName)      { doc.text(`Bank: ${business.bankName}`, 50, payY); payY += 14; }
      if (business.accountName)   { doc.text(`Account Name: ${business.accountName}`, 50, payY); payY += 14; }
      if (business.accountNumber) { doc.text(`Account Number: ${business.accountNumber}`, 50, payY); payY += 14; }
      totalsY = payY + 10;
    }

    // ── Notes ───────────────────────────────────────────────────────────────
    if (invoice.notes) {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('NOTES', 50, totalsY);
      doc.fontSize(10).fillColor(DARK).font('Helvetica').text(invoice.notes, 50, totalsY + 14, { width: 495 });
    }

    doc.end();
  });
}
