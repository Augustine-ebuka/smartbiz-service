import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/user.model';
import ApiError from '../utils/ApiError';

const OTP_LENGTH       = 6;
const OTP_TTL_MINUTES  = 10;
const OTP_HASH_ROUNDS  = 10;

class OtpService {

  /** Generate a numeric OTP, hash it, persist it on the user, return the plain OTP to send. */
  async generateAndStore(userId: string): Promise<string> {
    const plainOtp = crypto
      .randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH)
      .toString();

    const hashed = await bcrypt.hash(plainOtp, OTP_HASH_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
      otp: hashed,
      otpExpiresAt: expiresAt,
    });

    return plainOtp;
  }

  /** Verify a submitted OTP against the stored hash. Clears it on success. */
  async verify(userId: string, candidateOtp: string): Promise<void> {
    const user = await User.findById(userId).select('+otp +otpExpiresAt');
    if (!user) throw new ApiError(404, 'User not found.');

    if (user.isEmailVerified) {
      throw new ApiError(400, 'Email is already verified.');
    }

    if (!user.otp || !user.otpExpiresAt) {
      throw new ApiError(400, 'No verification code found. Please request a new one.');
    }

    if (user.otpExpiresAt < new Date()) {
      throw new ApiError(400, 'Verification code has expired. Please request a new one.');
    }

    const isMatch = await user.compareOtp(candidateOtp);
    if (!isMatch) {
      throw new ApiError(400, 'Invalid verification code.');
    }

    // Clear OTP and mark email as verified
    await User.findByIdAndUpdate(userId, {
      isEmailVerified: true,
      otp: undefined,
      otpExpiresAt: undefined,
    });
  }

  async verifyPasswordResetOtp(userId: string, candidateOtp: string): Promise<void> {
    const user = await User.findById(userId).select('+otp +otpExpiresAt');
    if (!user) throw new ApiError(404, 'User not found.');

    if (!user.otp || !user.otpExpiresAt) {
      throw new ApiError(400, 'No reset code found. Please request a new one.');
    }

    if (user.otpExpiresAt < new Date()) {
      throw new ApiError(400, 'Reset code has expired. Please request a new one.');
    }

    const isMatch = await user.compareOtp(candidateOtp);
    if (!isMatch) {
      throw new ApiError(400, 'Invalid or expired reset code.');
    }
  }

  /** Resend: generate a fresh OTP only if email is not yet verified. */
  async resend(userId: string): Promise<string> {
    const user = await User.findById(userId).select('isEmailVerified');
    if (!user) throw new ApiError(404, 'User not found.');

    if (user.isEmailVerified) {
      throw new ApiError(400, 'Email is already verified.');
    }

    return this.generateAndStore(userId);
  }

}

export default new OtpService();
