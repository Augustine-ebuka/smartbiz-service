import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

// ─── Permissions Interface ────────────────────────────────────────────────────

export interface IPermissions {
  canLogIncome:       boolean;
  canViewIncome:      boolean;
  canLogExpense:      boolean;
  canViewExpenses:    boolean;
  canManageCustomers: boolean;
  canManageProducts:  boolean;
}

// ─── Default permissions for a new saleskeeper ───────────────────────────────

export const DEFAULT_PERMISSIONS: IPermissions = {
  canLogIncome:       true,
  canViewIncome:      true,
  canLogExpense:      true,
  canViewExpenses:    true,
  canManageCustomers: true,
  canManageProducts:  false,   // only owner manages the catalog by default
};

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IInvite extends Document {
  _id: string;
  ownerId: string;
  inviteeUserId?: string;
  name: string;
  email: string;
  status: InviteStatus;
  permissions: IPermissions;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-Schema ───────────────────────────────────────────────────────────────

const PermissionsSchema = new Schema<IPermissions>(
  {
    canLogIncome:       { type: Boolean, default: true },
    canViewIncome:      { type: Boolean, default: true },
    canLogExpense:      { type: Boolean, default: true },
    canViewExpenses:    { type: Boolean, default: true },
    canManageCustomers: { type: Boolean, default: true },
    canManageProducts:  { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Schema ───────────────────────────────────────────────────────────────────

const InviteSchema = new Schema<IInvite>(
  {
    ownerId:       { type: String, required: true, index: true },
    inviteeUserId: { type: String },
    name:          { type: String, required: true, trim: true },
    email:         { type: String, required: true, trim: true, lowercase: true },
    status:        { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    permissions:   { type: PermissionsSchema, default: () => ({ ...DEFAULT_PERMISSIONS }) },
  },
  { timestamps: true }
);

InviteSchema.index({ ownerId: 1, email: 1 }, { unique: true });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Invite = mongoose.model<IInvite>('Invite', InviteSchema);