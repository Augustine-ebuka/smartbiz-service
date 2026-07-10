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
    req.userId = decoded.userId;
    next();
  } catch (error: any) {
    console.error('Auth Error:', error.message);
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}