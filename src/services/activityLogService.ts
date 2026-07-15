import { ActivityLog, ActivityAction, IActivityLog } from '../models/activity.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogActivityDTO {
  businessOwnerId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: ActivityAction;
  description: string;
  resourceId?: string;
  amount?: number;
  metadata?: Record<string, any>;
}

export interface ActivityLogFilterDTO {
  actorId?: string;
  action?: ActivityAction;
  startDate?: string;
  endDate?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ActivityLogService {

  /**
   * Record an activity. Always fire-and-forget from controllers —
   * never let a logging failure break the actual operation.
   */
  async log(dto: LogActivityDTO): Promise<void> {
    try {
      await ActivityLog.create(dto);
    } catch (err) {
      // Log to console but never throw — activity logging must never break core features
      console.error('[ActivityLog] Failed to write log:', err);
    }
  }

  async getAll(
    businessOwnerId: string,
    filters: ActivityLogFilterDTO = {},
    page = 1,
    limit = 20
  ): Promise<{ logs: IActivityLog[]; total: number; page: number; totalPages: number }> {
    const query: Record<string, any> = { businessOwnerId };

    if (filters.actorId) query.actorId = filters.actorId;
    if (filters.action)  query.action  = filters.action;

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate)   query.createdAt.$lte = new Date(`${filters.endDate}T23:59:59.999Z`);
    }

    const skip  = (page - 1) * limit;
    const total = await ActivityLog.countDocuments(query);

    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getByActor(businessOwnerId: string, actorId: string, limit = 10): Promise<IActivityLog[]> {
    return ActivityLog.find({ businessOwnerId, actorId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

}

export default new ActivityLogService();