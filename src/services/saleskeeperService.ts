import crypto from 'crypto';
import { Invite, IInvite } from '../models/invite.model';
import { User } from '../models/user.model';
import emailService from './EmailService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a readable temporary password:
 * e.g. "Kf7#mP2x"  — 8 chars, upper + lower + digit + symbol
 */
function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const symbols = '#@!$';

  const pick = (set: string) => set[crypto.randomInt(0, set.length)];

  // Guarantee at least one of each type
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  // Fill the rest randomly from all chars
  const all = upper + lower + digits + symbols;
  const rest = Array.from({ length: 4 }, () => pick(all));

  // Shuffle so the guaranteed chars aren't always at the start
  return [...required, ...rest]
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join('');
}

// ─── Service ──────────────────────────────────────────────────────────────────

class SaleskeeperService {

  /**
   * Send an invite — create the saleskeeper account + send email with credentials.
   */
  async invite(ownerId: string, name: string, email: string): Promise<IInvite> {
    // Check if this owner already invited this email
    const existingInvite = await Invite.findOne({ ownerId, email });
    if (existingInvite) {
      if (existingInvite.status === 'revoked') {
        throw new Error('This saleskeeper was previously revoked. Reinstate them instead of re-inviting.');
      }
      throw new Error('An invite has already been sent to this email.');
    }

    // Check if email is already registered as a user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error('A user with this email already exists.');
    }

    // Get owner's business name for the email
    const owner = await User.findById(ownerId).select('settings firstName');
    if (!owner) throw new Error('Owner not found.');

    const businessName = owner.settings?.companyProfile?.businessName ?? `${owner.firstName}'s Business`;

    // Split name into first + last (best effort)
    const [firstName, ...rest] = name.trim().split(' ');
    const lastName = rest.join(' ') || 'User';

    const tempPassword = generateTempPassword();

    // Create the saleskeeper user account
    const saleskeeperUser = new User({
      firstName,
      lastName,
      email,
      phone:           `invite-${Date.now()}`,  // placeholder — they can update after login
      password:        tempPassword,             // pre-save hook will hash it
      role:            'staff',
      ownerId,                                   // scopes them to the owner's business
      isActive:        true,
      isEmailVerified: true,                     // no OTP needed — we're creating the account for them
    });

    await saleskeeperUser.save();

    // Create invite record
    const invite = new Invite({
      ownerId,
      inviteeUserId: saleskeeperUser._id.toString(),
      name,
      email,
      status: 'accepted',   // account already created, no pending state needed
    });

    await invite.save();

    // Send invite email with credentials
    await emailService.sendSaleskeeperInvite({
      to:           email,
      name:         firstName,
      businessName,
      tempPassword,
    });

    return invite;
  }

  /**
   * Get all saleskeepers invited by this owner.
   */
  async getAll(ownerId: string): Promise<IInvite[]> {
    return Invite.find({ ownerId }).sort({ createdAt: -1 });
  }

  /**
   * Revoke a saleskeeper's access — deactivates their account.
   */
  async revoke(ownerId: string, inviteId: string): Promise<IInvite> {
    const invite = await Invite.findOne({ _id: inviteId, ownerId });
    if (!invite) throw new Error('Invite not found.');
    if (invite.status === 'revoked') throw new Error('Access already revoked.');

    // Deactivate their user account
    if (invite.inviteeUserId) {
      await User.findByIdAndUpdate(invite.inviteeUserId, { isActive: false });
    }

    invite.status = 'revoked';
    return invite.save();
  }

  /**
   * Reinstate a previously revoked saleskeeper.
   */
  async reinstate(ownerId: string, inviteId: string): Promise<IInvite> {
    const invite = await Invite.findOne({ _id: inviteId, ownerId });
    if (!invite) throw new Error('Invite not found.');
    if (invite.status !== 'revoked') throw new Error('Saleskeeper is already active.');

    if (invite.inviteeUserId) {
      await User.findByIdAndUpdate(invite.inviteeUserId, { isActive: true });
    }

    invite.status = 'accepted';
    return invite.save();
  }

  /**
   * Remove a saleskeeper entirely — deletes their account and invite record.
   */
  async remove(ownerId: string, inviteId: string): Promise<void> {
    const invite = await Invite.findOne({ _id: inviteId, ownerId });
    if (!invite) throw new Error('Invite not found.');

    if (invite.inviteeUserId) {
      await User.findByIdAndDelete(invite.inviteeUserId);
    }

    await Invite.findByIdAndDelete(inviteId);
  }

}

export default new SaleskeeperService();