import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import subscriptionService from '../services/subscriptionService';
import walletService from '../services/walletService';
import activityLogService from '../services/activityLogService';
import { PLANS, PlanId } from '../config/subscription.config';

class AdminController {

  /**
   * GET /api/admin/users?page=1&limit=20&search=&role=&isActive=
   * Lists every user on the platform. Admin-only.
   */
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '20', search, role, isActive } = req.query as Record<string, string>;
      const pageNum  = Math.max(Number(page) || 1, 1);
      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

      const query: Record<string, any> = {};
      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (search) {
        query.$or = [
          { email:     { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName:  { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (pageNum - 1) * limitNum;
      const now  = new Date();

      const [users, total, totalUsers, planCounts] = await Promise.all([
        User.find(query)
          .select('firstName lastName email phone role isActive isEmailVerified subscription createdAt lastActiveAt settings.companyProfile.businessName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(query),
        // Platform-wide totals — deliberately NOT scoped to the search/role/isActive
        // filters above, since this is a dashboard summary, not a count of this page.
        User.countDocuments({}),
        User.aggregate([
          {
            $project: {
              // A plan only counts as active if status is 'active' AND endDate
              // hasn't passed — subscriptions expire lazily (only synced to
              // 'free' on the user's next relevant request), so trusting the
              // raw stored plan/status directly would overcount paid users
              // who've actually already lapsed.
              effectivePlan: {
                $let: {
                  vars: {
                    plan:    { $ifNull: ['$subscription.plan', 'free'] },
                    status:  { $ifNull: ['$subscription.status', 'active'] },
                    endDate: '$subscription.endDate',
                  },
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$$plan', 'free'] },
                          { $eq: ['$$status', 'active'] },
                          { $gt: ['$$endDate', now] },
                        ],
                      },
                      '$$plan',
                      'free',
                    ],
                  },
                },
              },
            },
          },
          { $group: { _id: '$effectivePlan', count: { $sum: 1 } } },
        ]),
      ]);

      // businessName lives at settings.companyProfile.businessName — flatten it
      // onto each row so the admin list doesn't need to dig through nested settings.
      const data = users.map(({ settings, ...user }) => ({
        ...user,
        businessName: settings?.companyProfile?.businessName ?? null,
      }));

      const byPlan = { free: 0, monthly: 0, yearly: 0 };
      for (const row of planCounts) {
        if (row._id in byPlan) byPlan[row._id as keyof typeof byPlan] = row.count;
      }

      res.status(200).json({
        success: true,
        data,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        stats: {
          totalUsers,
          byPlan,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/users/:id
   * Full user detail plus their current subscription/usage info.
   */
  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await User.findById(req.params.id)
        .select('firstName lastName email phone role isActive isEmailVerified ownerId subscription createdAt lastActiveAt settings.companyProfile.businessName')
        .lean();
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      const subscriptionInfo = await subscriptionService.getSubscriptionInfo(user._id.toString());
      const { settings, ...userFields } = user;

      res.status(200).json({
        success: true,
        data: {
          user: { ...userFields, businessName: settings?.companyProfile?.businessName ?? null },
          subscription: subscriptionInfo,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/users/:id/subscription/activate
   * Grants a plan with no payment (comps, partners, support).
   * Body: { planId: 'monthly' | 'yearly', durationDays?: number, note?: string }
   */
  async activateSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = req.params;
      const { planId, durationDays, note } = req.body as {
        planId?: PlanId;
        durationDays?: number;
        note?: string;
      };

      if (!planId || !PLANS[planId] || planId === 'free') {
        res.status(400).json({ success: false, message: 'planId must be "monthly" or "yearly".' });
        return;
      }
      if (durationDays !== undefined && (typeof durationDays !== 'number' || durationDays <= 0)) {
        res.status(400).json({ success: false, message: 'durationDays must be a positive number.' });
        return;
      }

      const targetUser = await User.findById(userId).select('email');
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      const endDate = await subscriptionService.manualActivatePlan(userId, planId, durationDays);
      const plan    = PLANS[planId];

      await activityLogService.log({
        businessOwnerId: userId,
        actorId:   req.userId as string,
        actorName: `${req.user?.firstName ?? 'Admin'} ${req.user?.lastName ?? ''}`.trim(),
        actorRole: 'admin',
        action:    'subscription.manual_activate',
        description: `Manually activated ${plan.name} for ${targetUser.email}${note ? ` — ${note}` : ''}`,
        metadata:  { planId, durationDays: durationDays ?? plan.durationDays, note, endDate },
      });

      res.status(200).json({
        success: true,
        message: `${plan.name} manually activated for ${targetUser.email}, expires ${endDate.toISOString()}.`,
        data: { userId, planId, endDate },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/users/:id/subscription/revoke
   * Immediately moves a user to the free plan.
   * Body: { note?: string }
   */
  async revokeSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = req.params;
      const { note } = req.body as { note?: string };

      const targetUser = await User.findById(userId).select('email');
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      await subscriptionService.manualRevokePlan(userId);

      await activityLogService.log({
        businessOwnerId: userId,
        actorId:   req.userId as string,
        actorName: `${req.user?.firstName ?? 'Admin'} ${req.user?.lastName ?? ''}`.trim(),
        actorRole: 'admin',
        action:    'subscription.manual_revoke',
        description: `Manually reverted ${targetUser.email} to the free plan${note ? ` — ${note}` : ''}`,
        metadata:  { note },
      });

      res.status(200).json({ success: true, message: `${targetUser.email} moved to the free plan.` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/users/:id/subscription
   * Direct field-level edit — for correcting a wrong endDate, fixing the AI
   * usage counter, forcing a status, etc. Unlike activate/revoke, this does
   * NOT recompute dates automatically; only the fields you pass are touched.
   * Body: any subset of { plan, status, startDate, endDate, aiQueriesUsedToday, note }
   */
  async editSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = req.params;
      const { plan, status, startDate, endDate, aiQueriesUsedToday, note } = req.body as {
        plan?: 'free' | 'monthly' | 'yearly';
        status?: 'active' | 'expired' | 'cancelled';
        startDate?: string | null;
        endDate?: string | null;
        aiQueriesUsedToday?: number;
        note?: string;
      };

      if (plan !== undefined && !PLANS[plan]) {
        res.status(400).json({ success: false, message: 'Invalid plan.' });
        return;
      }
      if (status !== undefined && !['active', 'expired', 'cancelled'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status.' });
        return;
      }
      if (aiQueriesUsedToday !== undefined && (typeof aiQueriesUsedToday !== 'number' || aiQueriesUsedToday < 0)) {
        res.status(400).json({ success: false, message: 'aiQueriesUsedToday must be a non-negative number.' });
        return;
      }

      const targetUser = await User.findById(userId).select('email');
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      const update: Record<string, any> = {};
      if (plan !== undefined)               update['subscription.plan']               = plan;
      if (status !== undefined)             update['subscription.status']             = status;
      if (startDate !== undefined)          update['subscription.startDate']          = startDate ? new Date(startDate) : null;
      if (endDate !== undefined)            update['subscription.endDate']            = endDate ? new Date(endDate) : null;
      if (aiQueriesUsedToday !== undefined) update['subscription.aiQueriesUsedToday'] = aiQueriesUsedToday;

      if (Object.keys(update).length === 0) {
        res.status(400).json({ success: false, message: 'No fields to update.' });
        return;
      }

      await User.findByIdAndUpdate(userId, { $set: update });

      await activityLogService.log({
        businessOwnerId: userId,
        actorId:   req.userId as string,
        actorName: `${req.user?.firstName ?? 'Admin'} ${req.user?.lastName ?? ''}`.trim(),
        actorRole: 'admin',
        action:    'subscription.manual_edit',
        description: `Manually edited subscription fields for ${targetUser.email}${note ? ` — ${note}` : ''}`,
        metadata:  { ...update, note },
      });

      const info = await subscriptionService.getSubscriptionInfo(userId);
      res.status(200).json({
        success: true,
        message: `Subscription updated for ${targetUser.email}.`,
        data: info,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/users/:id/wallet/credit
   * Manually credits a user's wallet — no payment provider involved (comps,
   * refund corrections, offline top-ups). Sends the same "wallet funded"
   * email as an automatic deposit, tagged as a manual credit.
   * Body: { amount: number (naira), note?: string }
   */
  async creditWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: userId } = req.params;
      const { amount, note } = req.body as { amount?: number; note?: string };

      if (typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({ success: false, message: 'amount must be a positive number (in naira).' });
        return;
      }

      const targetUser = await User.findById(userId).select('email');
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      const { balance, reference } = await walletService.manualCredit(
        userId,
        Math.round(amount * 100),
        note,
        req.userId as string
      );

      res.status(200).json({
        success: true,
        message: `₦${amount.toLocaleString('en-NG')} credited to ${targetUser.email}'s wallet.`,
        data: { userId, amount, newBalance: balance, reference },
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new AdminController();
