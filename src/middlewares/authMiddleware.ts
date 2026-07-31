import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { User } from '../models/user.model';
import ApiError from '../utils/ApiError';



export async function authenticateToken(req: Request | any, res: Response | any, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
      return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded?.userId);
    if (!user) {
        return res.status(401).json({ error: "Access denied. User not found!" });
    }

    // Throttled "last active" tracking — only write if it's been 10+ minutes
    // since the last recorded activity, and never block the request on it.
    const ACTIVITY_THROTTLE_MS = 10 * 60 * 1000;
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVITY_THROTTLE_MS) {
      User.findByIdAndUpdate(user._id, { $set: { lastActiveAt: new Date() } })
        .catch((err) => console.error('[Activity] Failed to update lastActiveAt:', err));
    }

    req.userId = decoded.userId;
    next();
  } catch (error: any) {
    console.error('Auth Error:', error.message);
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}