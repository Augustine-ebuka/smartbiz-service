import { Request, Response, NextFunction } from 'express';
import subscriptionService from '../services/subscriptionService';

type SubscriptionFeature =
  | 'income'
  | 'expense'
  | 'customers'
  | 'products'
  | 'bulk_import'
  | 'full_reports'
  | 'saleskeeper'
  | 'ai_query';

/**
 * checkSubscription middleware
 *
 * Usage:
 *   router.post('/income',      authenticate, checkSubscription('income'),      IncomeController.create);
 *   router.post('/ai/query',    authenticate, checkSubscription('ai_query'),    AiController.query);
 *   router.post('/bulk/import', authenticate, checkSubscription('bulk_import'), BulkController.import);
 */
export function checkSubscription(feature: SubscriptionFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.businessOwnerId ?? req.userId) as string;

      if (feature === 'ai_query') {
        await subscriptionService.checkAndIncrementAiUsage(userId);
      } else {
        await subscriptionService.checkLimit(userId, feature);
      }

      next();
    } catch (error: any) {
      res.status(403).json({
        success:       false,
        message:       error.message,
        upgradeRequired: true,     // FE can use this flag to show upgrade modal
      });
    }
  };
}