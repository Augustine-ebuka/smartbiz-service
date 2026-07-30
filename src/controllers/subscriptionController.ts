import { Request, Response, NextFunction } from 'express';
import subscriptionService from '../services/subscriptionService';
import { initializeTransaction } from '../utils/monnifyService';
import { PLANS, PlanId } from '../config/subscription.config';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { APP_FRONTEND_URL } from '../config/config';

class SubscriptionController {

  /**
   * GET /api/subscription
   * Returns current plan, limits, usage, and available plans
   */
  async getInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.businessOwnerId ?? req.userId) as string;
      const info   = await subscriptionService.getSubscriptionInfo(userId);
      res.status(200).json({
        success: true,
        message: 'Subscription info fetched.',
        data:    info,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/subscription/upgrade
   * Initialize a payment for a plan upgrade
   * Body: { planId: 'monthly' | 'yearly' }
   */
  async upgrade(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;
      const { planId } = req.body as { planId: PlanId };

      if (!planId || !PLANS[planId]) {
        res.status(400).json({ success: false, message: 'Invalid planId. Use "monthly" or "yearly".' });
        return;
      }

      if (planId === 'free') {
        res.status(400).json({ success: false, message: 'Cannot upgrade to the free plan.' });
        return;
      }

      const owner = await User.findById(userId).select('firstName lastName email');
      if (!owner) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }

      const plan   = PLANS[planId];
      const amount = plan.priceKobo / 100;   // convert kobo → naira for Monnify
      const paymentReference = `SUB-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const result = await initializeTransaction({
        amount,
        customerName:  `${owner.firstName} ${owner.lastName}`,
        customerEmail: owner.email,
        paymentDescription: `PayFlex ${plan.name} Subscription`,
        redirectUrl: `${APP_FRONTEND_URL}/subscription/callback`,
        paymentReference,
      });

      // Record it so the Monnify webhook can look it up by trans_ref and know
      // this is a subscription purchase (not a catalog sale) once it's paid.
      await Transaction.create({
        user_id:           userId,
        type:               'purchase',
        status:             'pending',
        amount,
        trans_ref:          result.transactionReference,
        payment_reference:  result.paymentReference,
        checkout_url:       result.checkoutUrl,
        purpose:            'subscription',
        metadata:            { planId },
        products:           [],
      });

      res.status(200).json({
        success: true,
        message: `Payment initialized for ${plan.name}. Redirect to checkoutUrl.`,
        data:    result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/subscription/cancel
   * Cancel subscription — user stays on current plan until endDate
   */
  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;

      await User.findByIdAndUpdate(userId, {
        $set: { 'subscription.status': 'cancelled' },
      });

      res.status(200).json({
        success: true,
        message: 'Subscription cancelled. You will retain access until your billing period ends.',
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin backdoor actions (grant/revoke/edit a user's subscription) now live
  // in adminController.ts under /v1/admin/users/:id/subscription/*, alongside
  // user listing — a coherent admin surface instead of split across two files.

}

export default new SubscriptionController();