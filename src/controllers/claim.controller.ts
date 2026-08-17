import { Request, Response, NextFunction } from 'express';
import InvoiceClaimService from '../services/invoiceClaim.service';
import ApiError from '../utils/ApiError';
import path from 'path';
import { Invoice } from '../models/invoice.model';
import { User } from '../models/user.model';
import activityLogService from '../services/activityLogService';
import emailService from '../services/EmailService';

class ClaimController {
  async generateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.userId as string;
      const invoiceId = req.params.id as string;
      const { expiryDays, maxUses, returnUrl } = req.body || {};

      const { token, claimUrl } = await InvoiceClaimService.generateToken(invoiceId, ownerId, { expiryDays, maxUses });

      // Prefer returning claimUrl; also include token for API clients
      res.status(201).json({ success: true, data: { claimUrl, token } });
    } catch (error) {
      next(error);
    }
  }

  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.query.token as string;
      if (!token) throw new ApiError(400, 'token is required');

      const { claim, invoice } = await InvoiceClaimService.findByToken(token);
      if (!claim) return next(new ApiError(404, 'Token not found or expired'));

      // Return invoice summary suitable for public claim page
      const invoiceSummary = invoice ? {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        total: invoice.total,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        status: invoice.status,
      } : null;

      res.status(200).json({ success: true, data: { invoice: invoiceSummary, claim: { expiresAt: claim.expiresAt, uses: claim.uses, maxUses: claim.maxUses } } });
    } catch (error) { next(error); }
  }

  async submitClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.body.token as string || req.body?.token;
      if (!token) throw new ApiError(400, 'token is required');

      const name = req.body.name as string;
      const email = req.body.email as string;
      let proofUrl: string | undefined;

      if (req.file) {
        // store path relative to project root
        proofUrl = path.join('/', req.file.path).replace(/\\/g, '/');
      }

      const claim = await InvoiceClaimService.submitClaim(token, { name, email, metadata: null }, proofUrl);

      // Fetch invoice and owner to create audit and notify owner
      const invoice = await Invoice.findById(claim.invoiceId).lean();
      if (invoice) {
        const owner = await User.findById(invoice.userId).lean();
        // Log activity (fire-and-forget)
        activityLogService.log({
          businessOwnerId: String(invoice.userId),
          actorId: owner?._id?.toString() ?? 'public',
          actorName: name ?? 'Anonymous',
          actorRole: 'public',
          action: 'invoice.update',
          description: `Claim submitted for invoice ${invoice.invoiceNumber} by ${name ?? 'anonymous'}`,
          resourceId: String(invoice._id),
          amount: invoice.total,
        }).catch(() => {});

        // Email owner with claim details (fire-and-forget)
        if (owner?.email) {
          emailService.sendInvoiceClaimNotification({
            to: owner.email,
            ownerName: `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || 'Owner',
            invoiceNumber: invoice.invoiceNumber,
            claimantName: name,
            claimantEmail: email,
            proofUrl: claim.proofUrl ?? proofUrl,
            total: invoice.total,
            claimedAt: new Date(),
          }).catch((err) => console.error('Failed to send claim email:', err));
        }
      }

      res.status(200).json({ success: true, data: { claimId: claim._id, status: claim.status } });
    } catch (error) { next(error); }
  }
}

export default new ClaimController();
