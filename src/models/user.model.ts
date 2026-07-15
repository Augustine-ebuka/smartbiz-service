import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

// ─── Nested Interfaces ────────────────────────────────────────────────────────

export interface IAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface IContactInfo {
  email?: string;
  phone?: string;
  website?: string;
  address?: IAddress;
}

export interface IBankingDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string; // IBAN for international
  routingOrSwift?: string;
}

export interface ICompanyProfile {
  businessName?: string;
  legalName?: string;
  industry?: string;
  currency?: string;         // e.g. "USD"
  taxId?: string;            // Tax ID / VAT
  registrationNumber?: string;
  logoUrl?: string;
  contact?: IContactInfo;
  banking?: IBankingDetails;
  invoiceFooterNote?: string;
}

export interface IAppPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: string;         // e.g. "en", "fr"
  timezone?: string;         // e.g. "America/New_York"
  dateFormat?: string;       // e.g. "MM/DD/YYYY"
  notificationsEnabled?: boolean;
}

export interface ISettings {
  companyProfile?: ICompanyProfile;
  appPreferences?: IAppPreferences;
}

// ─── User Role ────────────────────────────────────────────────────────────────

export const UserRole = {
  admin: 'admin',
  business_owner: 'business_owner',
  accountant: 'accountant',
  staff: 'staff',
  viewer: 'viewer',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── Main User Interface ──────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  userName?: string;
  phone: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  otp?: string;              // hashed OTP stored in DB
  otpExpiresAt?: Date;       // expiry timestamp
  settings?: ISettings;
  ownerId?: string;          // set for saleskeepers — points to the business owner's userId
  avatarUrl?: string;        // user profile avatar
  comparePassword(candidatePassword: string): Promise<boolean>;
  compareOtp(candidateOtp: string): Promise<boolean>;
}

// ─── Sub-Schemas ──────────────────────────────────────────────────────────────

const AddressSchema = new Schema<IAddress>(
  {
    line1:      { type: String, trim: true },
    line2:      { type: String, trim: true },
    city:       { type: String, trim: true },
    state:      { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country:    { type: String, trim: true },
  },
  { _id: false }
);

const ContactInfoSchema = new Schema<IContactInfo>(
  {
    email:   { type: String, trim: true, lowercase: true },
    phone:   { type: String, trim: true },
    website: { type: String, trim: true },
    address: { type: AddressSchema },
  },
  { _id: false }
);

const BankingDetailsSchema = new Schema<IBankingDetails>(
  {
    bankName:       { type: String, trim: true },
    accountName:    { type: String, trim: true },
    accountNumber:  { type: String, trim: true },  // plain text; encrypt at rest in production
    routingOrSwift: { type: String, trim: true },
  },
  { _id: false }
);

const CompanyProfileSchema = new Schema<ICompanyProfile>(
  {
    businessName:       { type: String, trim: true },
    legalName:          { type: String, trim: true },
    industry:           { type: String, trim: true },
    currency:           { type: String, trim: true, default: 'USD' },
    taxId:              { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    logoUrl:            { type: String, trim: true },
    contact:            { type: ContactInfoSchema },
    banking:            { type: BankingDetailsSchema },
    invoiceFooterNote:  { type: String, trim: true },
  },
  { _id: false }
);

const AppPreferencesSchema = new Schema<IAppPreferences>(
  {
    theme:                { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language:             { type: String, trim: true, default: 'en' },
    timezone:             { type: String, trim: true, default: 'UTC' },
    dateFormat:           { type: String, trim: true, default: 'MM/DD/YYYY' },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    companyProfile:  { type: CompanyProfileSchema },
    appPreferences:  { type: AppPreferencesSchema },
  },
  { _id: false }
);

// ─── User Schema ──────────────────────────────────────────────────────────────

const UserSchema = new Schema<IUser>(
  {
    firstName:  { type: String, required: true, trim: true },
    lastName:   { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    userName:   { type: String, trim: true, unique: true, sparse: true },
    phone:      { type: String, required: true, unique: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:   { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'business_owner', 'accountant', 'staff', 'viewer'] satisfies UserRole[],
      default: 'staff',
    },
    isActive:         { type: Boolean, default: true },
    isEmailVerified:  { type: Boolean, default: false },
    ownerId:          { type: String, index: true, trim: true },
    avatarUrl:        { type: String, trim: true },
    otp:              { type: String },           // bcrypt-hashed OTP
    otpExpiresAt:     { type: Date },
    settings: { type: SettingsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });

// ─── Hooks ───────────────────────────────────────────────────────────────────

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Strip sensitive fields from JSON output
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.otp;
    delete ret.otpExpiresAt;
    delete ret.__v;
    return ret;
  },
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.compareOtp = async function (
  candidateOtp: string
): Promise<boolean> {
  if (!this.otp) return false;
  return bcrypt.compare(candidateOtp, this.otp);
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const User = mongoose.model<IUser>('User', UserSchema);
