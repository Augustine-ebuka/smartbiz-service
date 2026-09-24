import { Request, Response, NextFunction } from 'express';
import InvestorReportShareService from '../services/investorReportShareService';
import { DateRangeKey } from '../services/reportService';
import { User } from '../models/user.model';
import emailService from '../services/EmailService';
import activityLogService from '../services/activityLogService';

const VALID_RANGE_KEYS: DateRangeKey[] = ['this-month', 'last-month', 'this-year', 'custom'];

class InvestorReportShareController {

  /**
   * POST /api/v1/reports/share
   * Business owner generates a read-only, expiring link to their current
   * report (e.g. to send to a prospective investor).
   * Body: { range, startDate?, endDate?, recipientName?, recipientEmail? }
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = (req as any).businessOwnerId as string;
      const {
        range = 'this-month',
        startDate,
        endDate,
        recipientName,
        recipientEmail,
      } = req.body ?? {};

      if (!VALID_RANGE_KEYS.includes(range)) {
        res.status(400).json({
          success: false,
          message: `Invalid range. Must be one of: ${VALID_RANGE_KEYS.join(', ')}.`,
        });
        return;
      }

      if (range === 'custom' && (!startDate || !endDate)) {
        res.status(400).json({
          success: false,
          message: 'startDate and endDate are required when range is "custom".',
        });
        return;
      }

      const { shareUrl, expiresAt } = await InvestorReportShareService.createShare(ownerId, {
        rangeKey: range,
        startDate,
        endDate,
        recipientName,
        recipientEmail,
      });

      const owner = await User.findById(ownerId).lean();
      const ownerName = `${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim() || 'The business owner';
      const businessName = owner?.settings?.companyProfile?.businessName || 'the business';

      if (recipientEmail) {
        emailService.sendInvestorReportShare({
          to: recipientEmail,
          recipientName: recipientName || 'there',
          ownerName,
          businessName,
          shareUrl,
          expiresAt,
        }).catch((err) => console.error('Failed to send investor report share email:', err));
      }

      activityLogService.log({
        businessOwnerId: ownerId,
        actorId: ownerId,
        actorName: ownerName,
        actorRole: 'business_owner',
        action: 'report.share_created',
        description: `Shared a business report with ${recipientName || recipientEmail || 'a recipient'} (expires in 2 days)`,
      }).catch(() => {});

      res.status(201).json({
        success: true,
        message: recipientEmail
          ? 'Report link generated and emailed to the recipient.'
          : 'Report link generated successfully.',
        data: { shareUrl, expiresAt },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/reports/share — list links the owner has generated. */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = (req as any).businessOwnerId as string;
      const shares = await InvestorReportShareService.list(ownerId);
      res.status(200).json({ success: true, data: shares });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/reports/share/:id — revoke a link before it naturally expires. */
  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = (req as any).businessOwnerId as string;
      const { id } = req.params;

      await InvestorReportShareService.revoke(ownerId, id);

      const owner = await User.findById(ownerId).lean();
      const ownerName = `${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim() || 'The business owner';

      activityLogService.log({
        businessOwnerId: ownerId,
        actorId: ownerId,
        actorName: ownerName,
        actorRole: 'business_owner',
        action: 'report.share_revoked',
        description: 'Revoked a shared business report link',
        resourceId: id,
      }).catch(() => {});

      res.status(200).json({ success: true, message: 'Share link revoked.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/investor-reports/:token
   * Public, unauthenticated — the page a recipient lands on when they open
   * the shared link.
   */
  async view(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const data = await InvestorReportShareService.getByToken(token);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

}

export default new InvestorReportShareController();
