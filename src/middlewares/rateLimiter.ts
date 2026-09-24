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

/**
 * Throttles the public investor-report share view per IP. The token itself
 * is 256 bits of entropy (unguessable), but this still caps how fast a
 * scraper can hammer the endpoint once a link leaks.
 */
export const publicShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
