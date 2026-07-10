import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../config/jwt';
import { User } from '../models/user.model';

type AllowedRole = string;

type AuthorizedRequest = Request & {
  userId?: string;
  user?: Awaited<ReturnType<typeof User.findById>>;
};

export const authorizationMiddleware = (allowedRoles: AllowedRole[] = []) => {
  return async (req: any, res: any, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : undefined;

      if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(401).json({ message: 'Access denied. User not found.' });
      }
      
      if (!user.isActive) {
        return res.status(403).json({ message: 'This account has been deactivated.' });
      }

      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          message: 'You are not authorized to perform this action.',
        });
      }

      req.userId = user._id.toString();
      req.user = user;
      next();
    } catch (error: any) {
      const statusCode = error?.message === 'Invalid token' ? 403 : 500;
      const message = error?.message === 'Invalid token'
        ? 'Invalid or expired token.'
        : 'Authorization failed.';

      return res.status(statusCode).json({ message });
    }
  };
};

export const unless = (
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  ...paths: string[]
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (paths.includes(req.path)) {
      return next();
    }

    return middleware(req, res, next);
  };
};
