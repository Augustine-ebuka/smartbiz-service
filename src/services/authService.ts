import { User, IUser } from '../models/user.model';
import { generateToken } from '../config/jwt';
import walletService from './walletService';
import emailService from './EmailService';
import otpService from './OtpService';
import ApiError from '../utils/ApiError';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface RegisterDTO {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  businessName: string;
  role?: IUser['role'];
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface LoginResult {
  user: ReturnType<IUser['toJSON']>;
  token: string;
  requiresEmailVerification: boolean;
  message: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AuthService {

  async register(payload: RegisterDTO) {
    const { firstName, lastName, email, password, phone, businessName, role } = payload;

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        throw new Error('An account with this email already exists.');
      }
      throw new Error('An account with this phone number already exists.');
    }

    const newUser = new User({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: role ?? 'business_owner',
      settings: { companyProfile: { businessName } },
    });

    await newUser.save();

    // Create wallet for the new user
    await walletService.createWallet(newUser._id.toString());

    // Generate OTP, store it, and send verification email
    const otp = await otpService.generateAndStore(newUser._id.toString());
    await emailService.sendOtp({ to: email, firstName, otp });

    const token = generateToken(newUser._id.toString());

    return {
      user: newUser.toJSON(),
      token,
      message: 'Account created. Please check your email for a 6-digit verification code.',
    };
  }
  async verifyEmail(userId: string, otp: string) {
    await otpService.verify(userId, otp);
 
    // Send welcome email after successful verification
    const user = await User.findById(userId).select('firstName email settings');
    if (user) {
      const businessName = user.settings?.companyProfile?.businessName ?? user.firstName + "'s Business";
      // Fire and forget — don't block the response if email fails
      emailService.sendWelcomeEmail({
        to:           user.email,
        firstName:    user.firstName,
        businessName,
      }).catch((err) => console.error('Welcome email failed:', err));
    }
 
    return { message: 'Email verified successfully.' };
  }

  async resendOtp(userId: string) {
    const user = await User.findById(userId).select('firstName email');
    if (!user) throw new Error('User not found.');

    const otp = await otpService.resend(userId);
    await emailService.sendOtp({ to: user.email, firstName: user.firstName, otp });

    return { message: 'A new verification code has been sent to your email.' };
  }

  async login({ email, password }: LoginDTO): Promise<LoginResult> {
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new Error('This account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password.');
    }

    const token = generateToken(user._id.toString());

    if (!user.isEmailVerified) {
      const otp = await otpService.generateAndStore(user._id.toString());
      await emailService.sendOtp({
        to: user.email,
        firstName: user.firstName,
        otp,
      });

      return {
        user: user.toJSON(),
        token,
        requiresEmailVerification: true,
        message: 'Account not verified. A new verification code has been sent to your email.',
      };
    }

    return {
      user: user.toJSON(),
      token,
      requiresEmailVerification: false,
      message: 'Logged in successfully.',
    };
  }

  async getProfile(userId: string) {
    const user = await User.findById(userId).select('-password -otp -otpExpiresAt');
    if (!user) throw new Error('User not found.');
    return user;
  }

  async updateProfile(
    userId: string,
    updates: Partial<Pick<IUser, 'firstName' | 'lastName' | 'middleName' | 'userName' | 'phone'>>
  ) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -otp -otpExpiresAt');

    if (!user) throw new Error('User not found.');
    return user;
  }

  async updateSettings(userId: string, settings: IUser['settings']) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: flattenSettings(settings) },
      { new: true, runValidators: true }
    ).select('-password -otp -otpExpiresAt');

    if (!user) throw new Error('User not found.');
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) throw new Error('Current password is incorrect.');

    user.password = newPassword;
    await user.save();

    return { message: 'Password updated successfully.' };
  }

  async requestReset(email: string): Promise<{ message: string }> {
    const user = await User.findOne({ email: email.toLowerCase() });
 
    if (user) {
      const otp = await otpService.generateAndStore(user._id.toString());
      await emailService.sendPasswordResetOtp({
        to: user.email,
        firstName: user.firstName,
        otp,
      });
    }
 
    return {
      message: 'If an account with that email exists, a reset code has been sent.',
    };
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new ApiError(400, 'Invalid or expired reset code.');
 
    await otpService.verifyPasswordResetOtp(user._id.toString(), otp);
 
    user.password = newPassword;   // pre-save hook re-hashes it
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
 
    return { message: 'Password reset successfully. You can now log in.' };
  }
   /**
   * Optional Step — Resend OTP if it expired.
   */
  async resendResetOtp(email: string): Promise<{ message: string }> {
    const user = await User.findOne({ email: email.toLowerCase() });
 
    if (user) {
      const otp = await otpService.generateAndStore(user._id.toString());
      await emailService.sendPasswordResetOtp({
        to: user.email,
        firstName: user.firstName,
        otp,
      });
    }
 
    return {
      message: 'If an account with that email exists, a new reset code has been sent.',
    };
  }

}



// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenSettings(
  settings: IUser['settings'],
  prefix = 'settings'
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  function walk(obj: Record<string, unknown>, path: string) {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = `${path}.${key}`;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, fullPath);
      } else {
        result[fullPath] = value;
      }
    }
  }

  if (settings) walk(settings as unknown as Record<string, unknown>, prefix);
  return result;
}

export default new AuthService();
