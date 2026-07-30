import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { PLANS, getPlan, PlanId } from '../config/subscription.config';

class SubscriptionService {

  /**
   * Sets plan/status/dates on the user doc, extending from the current
   * endDate if they already have unexpired paid access. Shared by both the
   * real payment path and the admin manual-grant backdoor.
   */
  private async grantPlan(userId: string, planId: PlanId, durationDays: number): Promise<Date> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');

    const now     = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + durationDays);

    if (
      user.subscription?.status === 'active' &&
      user.subscription?.endDate &&
      user.subscription.endDate > now
    ) {
      endDate.setTime(user.subscription.endDate.getTime());
      endDate.setDate(endDate.getDate() + durationDays);
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.plan':      planId,
        'subscription.status':    'active',
        'subscription.startDate': now,
        'subscription.endDate':   endDate,
      },
    });

    return endDate;
  }

  /**
   * Called after Monnify webhook confirms payment for purpose='subscription'
   * Activates the plan on the user's account
   */
  async activatePlan(userId: string, planId: PlanId, transactionReference: string): Promise<void> {
    const plan = getPlan(planId);
    if (plan.priceKobo === 0) throw new Error('Cannot activate free plan via payment.');

    await this.grantPlan(userId, planId, plan.durationDays);

    // Mark the transaction as linked to this subscription
    await Transaction.findOneAndUpdate(
      { trans_ref: transactionReference },
      { $set: { metadata: { planId, activatedAt: new Date() } } }
    );
  }

  /**
   * Admin backdoor — grants a plan with no payment involved (comps, partner
   * accounts, support/testing). `durationDays` can override the plan's normal
   * length, e.g. a 7-day trial of the monthly plan. Caller must log this via
   * activityLogService — this method only touches the subscription itself.
   */
  async manualActivatePlan(userId: string, planId: PlanId, durationDays?: number): Promise<Date> {
    const plan = getPlan(planId);
    if (plan.id === 'free') throw new Error('Use manualRevokePlan to move a user to the free plan.');
    return this.grantPlan(userId, planId, durationDays ?? plan.durationDays);
  }

  /**
   * Admin backdoor — immediately moves a user to the free plan, reversing a
   * manual grant (or any plan) without waiting for endDate.
   */
  async manualRevokePlan(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');

    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.plan':    'free',
        'subscription.status':  'active',
        'subscription.endDate': null,
      },
    });
  }



  /**
   * Check if subscription has expired and downgrade if needed
   * Called at login or on each request via middleware
   */
  async syncSubscriptionStatus(userId: string): Promise<void> {
    const user = await User.findById(userId).select('subscription');
    if (!user) return;

    const sub = user.subscription;
    if (!sub || sub.plan === 'free') return;
    if (sub.status !== 'active') return;

    // If endDate has passed → downgrade to free
    if (sub.endDate && sub.endDate < new Date()) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'subscription.plan':    'free',
          'subscription.status':  'expired',
          'subscription.endDate': null,
        },
      });
    }
  }

  /**
   * Track and validate AI query usage
   * Returns true if allowed, throws if limit reached
   */
  async checkAndIncrementAiUsage(userId: string): Promise<void> {
    const user = await User.findById(userId).select('subscription');
    if (!user) throw new Error('User not found.');

    await this.syncSubscriptionStatus(userId);

    const plan   = getPlan(user.subscription?.plan ?? 'free');
    const limits = plan.limits;
    const sub    = user.subscription;

    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const lastDate = sub?.lastAiQueryDate
      ? new Date(sub.lastAiQueryDate).toISOString().split('T')[0]
      : null;

    // Reset counter if it's a new day
    const queriesUsedToday = lastDate === todayStr ? (sub?.aiQueriesUsedToday ?? 0) : 0;

    if (limits.aiQueriesPerDay !== -1 && queriesUsedToday >= limits.aiQueriesPerDay) {
      throw new Error(
        `You have reached your daily AI limit of ${limits.aiQueriesPerDay} queries. ` +
        (user.subscription?.plan === 'free'
          ? 'Upgrade to Pro for 15 queries per day.'
          : 'Your limit resets tomorrow.')
      );
    }

    // Increment usage
    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.aiQueriesUsedToday': queriesUsedToday + 1,
        'subscription.lastAiQueryDate':    today,
      },
    });
  }

  /**
   * Check any feature limit — used by checkSubscription middleware
   */
  async checkLimit(
    userId: string,
    feature: 'income' | 'expense' | 'customers' | 'products' | 'bulk_import' | 'full_reports' | 'saleskeeper'
  ): Promise<void> {
    const user = await User.findById(userId).select('subscription');
    if (!user) throw new Error('User not found.');

    await this.syncSubscriptionStatus(userId);

    const planId = user.subscription?.plan ?? 'free';
    const plan   = getPlan(planId);
    const limits = plan.limits;
    const now    = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    switch (feature) {
      case 'income': {
        if (limits.incomePerMonth === -1) return;
        const { Income } = await import('../models/income.model');
        const count = await Income.countDocuments({ userId, createdAt: { $gte: monthStart } });
        if (count >= limits.incomePerMonth) {
          throw new Error(`Free plan limit: ${limits.incomePerMonth} income records per month. Upgrade to Pro for unlimited.`);
        }
        break;
      }

      case 'expense': {
        if (limits.expensePerMonth === -1) return;
        const { Expense } = await import('../models/expense.model');
        const count = await Expense.countDocuments({ userId, createdAt: { $gte: monthStart } });
        if (count >= limits.expensePerMonth) {
          throw new Error(`Free plan limit: ${limits.expensePerMonth} expense records per month. Upgrade to Pro for unlimited.`);
        }
        break;
      }

      case 'customers': {
        if (limits.customers === -1) return;
        const { Customer } = await import('../models/customer.model');
        const count = await Customer.countDocuments({ userId });
        if (count >= limits.customers) {
          throw new Error(`Free plan limit: ${limits.customers} customers. Upgrade to Pro for unlimited.`);
        }
        break;
      }

      case 'products': {
        if (limits.products === -1) return;
        const { Product } = await import('../models/product.model');
        const count = await Product.countDocuments({ userId });
        if (count >= limits.products) {
          throw new Error(`Free plan limit: ${limits.products} products. Upgrade to Pro for unlimited.`);
        }
        break;
      }

      case 'saleskeeper': {
        if (limits.saleskeeperInvites === -1) return;
        const { Invite } = await import('../models/invite.model');
        const count = await Invite.countDocuments({ ownerId: userId, status: { $ne: 'revoked' } });
        if (count >= limits.saleskeeperInvites) {
          throw new Error(`Free plan limit: ${limits.saleskeeperInvites} saleskeeper invite. Upgrade to Pro for more.`);
        }
        break;
      }

      case 'bulk_import': {
        if (!limits.bulkImport) {
          throw new Error('Bulk import is a Pro feature. Upgrade to unlock it.');
        }
        break;
      }

      case 'full_reports': {
        if (!limits.fullReports) {
          throw new Error('Full reports are a Pro feature. Upgrade to unlock them.');
        }
        break;
      }
    }
  }

  /**
   * Get current subscription info + usage stats for the user
   */
  async getSubscriptionInfo(userId: string) {
    const user = await User.findById(userId).select('subscription');
    if (!user) throw new Error('User not found.');

    await this.syncSubscriptionStatus(userId);

    const planId  = user.subscription?.plan ?? 'free';
    const plan    = getPlan(planId);
    const sub     = user.subscription;

    const today     = new Date();
    const todayStr  = today.toISOString().split('T')[0];
    const lastDate  = sub?.lastAiQueryDate
      ? new Date(sub.lastAiQueryDate).toISOString().split('T')[0]
      : null;

    const aiUsedToday = lastDate === todayStr ? (sub?.aiQueriesUsedToday ?? 0) : 0;

    return {
      plan:             plan.name,
      planId,
      status:           sub?.status ?? 'active',
      startDate:        sub?.startDate,
      endDate:          sub?.endDate,
      daysRemaining:    sub?.endDate
        ? Math.max(0, Math.ceil((sub.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
        : null,
      limits:           plan.limits,
      usage: {
        aiQueriesUsedToday: aiUsedToday,
        aiQueriesLimit:     plan.limits.aiQueriesPerDay,
      },
      availablePlans: Object.values(PLANS).map(p => ({
        id:    p.id,
        name:  p.name,
        price: p.priceKobo / 100,  // convert kobo to naira for display
        durationDays: p.durationDays,
        limits: p.limits,
      })),
    };
  }

}

export default new SubscriptionService();