import crypto from 'crypto';
import { InvestorReportShare } from '../models/investorReportShare.model';
import { User } from '../models/user.model';
import ReportsService, { DateRangeKey } from './reportService';
import ApiError from '../utils/ApiError';
import { APP_FRONTEND_URL } from '../config/config';

// ─── Config ───────────────────────────────────────────────────────────────────

const SHARE_HMAC_KEY = process.env.REPORT_SHARE_HMAC_KEY || process.env.JWT_SECRET || 'default-report-share-key';
const SHARE_TTL_DAYS = 2;

function hashToken(token: string): string {
  return crypto.createHmac('sha256', SHARE_HMAC_KEY).update(token).digest('hex');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateShareOptions {
  rangeKey: DateRangeKey;
  startDate?: string;
  endDate?: string;
  recipientName?: string;
  recipientEmail?: string;
}

export interface ShareView {
  business: {
    businessName: string;
    legalName?: string;
    industry?: string;
    currency: string;
    logoUrl?: string;
  };
  range: { key: string; startDate: string; endDate: string };
  report: Record<string, any>;
  expiresAt: Date;
  sharedWith?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class InvestorReportShareService {

  /** Snapshot the current report data and mint a fresh, unguessable share token for it. */
  async createShare(ownerId: string, opts: CreateShareOptions) {
    const owner = await User.findById(ownerId).lean();
    if (!owner) throw new ApiError(404, 'Business owner not found.');

    const reportSnapshot = await ReportsService.getReports(
      ownerId,
      opts.rangeKey,
      opts.startDate,
      opts.endDate
    );

    const profile = owner.settings?.companyProfile;
    const businessSnapshot = {
      businessName: profile?.businessName || `${owner.firstName} ${owner.lastName}`.trim(),
      legalName:    profile?.legalName,
      industry:     profile?.industry,
      currency:     profile?.currency || 'NGN',
      logoUrl:      profile?.logoUrl,
    };

    const token     = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const share = await InvestorReportShare.create({
      ownerId,
      tokenHash,
      recipientName:  opts.recipientName,
      recipientEmail: opts.recipientEmail,
      range:          reportSnapshot.range,
      reportSnapshot,
      businessSnapshot,
      status:    'active',
      expiresAt,
      createdBy: ownerId,
    });

    const shareUrl = `${APP_FRONTEND_URL.replace(/\/$/, '')}/investor-report/${token}`;
    return { token, shareUrl, expiresAt, share };
  }

  /** Resolve a public token into the frozen snapshot, or throw if dead/revoked/expired. */
  async getByToken(token: string): Promise<ShareView> {
    const tokenHash = hashToken(token);
    const share = await InvestorReportShare.findOne({ tokenHash });

    if (!share) throw new ApiError(404, 'This report link is invalid or no longer exists.');
    if (share.status === 'revoked') throw new ApiError(410, 'This report link has been revoked by the business owner.');
    if (share.expiresAt.getTime() < Date.now()) throw new ApiError(410, 'This report link has expired.');

    share.viewCount    += 1;
    share.lastViewedAt = new Date();
    await share.save();

    return {
      business:   share.businessSnapshot,
      range:      share.range,
      report:     share.reportSnapshot,
      expiresAt:  share.expiresAt,
      sharedWith: share.recipientName,
    };
  }

  /** List share links created by this business owner (management view — no payload/token leaked). */
  async list(ownerId: string) {
    return InvestorReportShare.find({ ownerId })
      .select('-reportSnapshot -businessSnapshot -tokenHash')
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Revoke a share link before its natural expiry. */
  async revoke(ownerId: string, shareId: string) {
    const share = await InvestorReportShare.findOne({ _id: shareId, ownerId });
    if (!share) throw new ApiError(404, 'Share link not found.');

    share.status = 'revoked';
    await share.save();
    return share;
  }

}

export default new InvestorReportShareService();
