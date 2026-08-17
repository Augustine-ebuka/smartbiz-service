import crypto from 'crypto';
import { Invoice } from '../models/invoice.model';
import { InvoiceClaim, IInvoiceClaim } from '../models/invoiceClaim.model';
import { APP_FRONTEND_URL } from '../config/config';

const CLAIM_HMAC_KEY = process.env.CLAIM_TOKEN_HMAC_KEY || process.env.JWT_SECRET || 'default-claim-key';

function hashToken(token: string) {
  return crypto.createHmac('sha256', CLAIM_HMAC_KEY).update(token).digest('hex');
}

class InvoiceClaimService {
  async generateToken(invoiceId: string, ownerId: string, opts?: { expiryDays?: number; maxUses?: number }) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (String(invoice.userId) !== String(ownerId)) throw new Error('Not authorized to generate token for this invoice');

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiryDays = opts?.expiryDays ?? 7;
    const maxUses = opts?.maxUses ?? 1;

    const claim = new InvoiceClaim({
      invoiceId: invoice._id,
      tokenHash,
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      maxUses,
      uses: 0,
      status: 'pending',
      createdBy: ownerId,
    });

    await claim.save();

    const claimUrl = `${APP_FRONTEND_URL.replace(/\/$/, '')}/receipt/claim/${token}`;
    return { token, claimUrl, claim };
  }

  async findByToken(token: string): Promise<{ claim: IInvoiceClaim | null; invoice: any | null }> {
    const tokenHash = hashToken(token);
    const claim = await InvoiceClaim.findOne({ tokenHash });
    if (!claim) return { claim: null, invoice: null };
    const now = new Date();
    if (claim.expiresAt < now) return { claim: null, invoice: null };
    const invoice = await Invoice.findById(claim.invoiceId).lean();
    return { claim, invoice };
  }

  async submitClaim(token: string, data: { name?: string; email?: string; metadata?: any }, proofUrl?: string) {
    const tokenHash = hashToken(token);

    // Atomically find and increment uses if not expired and uses < maxUses
    const now = new Date();
    const claim = await InvoiceClaim.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: now }, uses: { $lt: (await InvoiceClaim.findOne({ tokenHash }))?.maxUses ?? 1 } },
      { $inc: { uses: 1 }, $set: { claimantName: data.name, claimantEmail: data.email, proofUrl, metadata: data.metadata, status: 'submitted' } },
      { new: true }
    );

    if (!claim) throw new Error('Invalid, expired, or exhausted token');

    // If uses reached maxUses, mark revoked
    if (claim.uses >= claim.maxUses) {
      claim.status = 'paid';
      await claim.save();
    }

    return claim;
  }
}

export default new InvoiceClaimService();
