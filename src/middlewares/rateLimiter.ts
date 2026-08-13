import rateLimit from 'express-rate-limit';

/**
 * Throttles login/register/OTP endpoints per IP to slow down credential
 * stuffing and OTP brute-forcing. These routes are unauthenticated by
 * design (that's the whole point of login/forgot-password/OTP), so IP-based
 * throttling is the only guard available before a request reaches a user
 * lookup.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});
