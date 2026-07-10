import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';

/**
 * resolveBusinessOwner middleware
 *
 * Attaches `req.businessOwnerId` to every authenticated request:
 *  - For a business owner / admin → req.businessOwnerId = req.userId (their own data)
 *  - For a saleskeeper (role: staff with ownerId set) → req.businessOwnerId = their ownerId
 *
 * All services should use `req.businessOwnerId` instead of `req.userId` when
 * querying customers, products, income, expenses, etc.
 */
export async function resolveBusinessOwner(
  req: any,
  res: any,
  next: NextFunction
) {
  try {
    const userId = req.userId as string;

    const user = await User.findById(userId).select('role ownerId isActive');
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found.' });
      return;
    }

    console.log(user);

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
      return;
    }

    // Saleskeeper: scope to their owner's business
    if (user.role === 'staff' && user.ownerId) {
      req.businessOwnerId = user.ownerId;
    } else {
      // Owner / admin: scope to their own data
      req.businessOwnerId = userId;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * requireOwner middleware
 *
 * Use this on routes that only the business owner (not saleskeepers) should access.
 * e.g. inviting saleskeepers, viewing reports, changing settings.
 *
 * Must be used AFTER resolveBusinessOwner.
 */
export function requireOwner(req: any, res: any, next: NextFunction) {
  if (req.businessOwnerId !== req.userId) {
    res.status(403).json({
      success: false,
      message: 'Only the business owner can perform this action.',
    });
    return;
  }
  next();
}