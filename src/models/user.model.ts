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
  subAccountCode?: string;
  merchantStatus?: boolean;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type PlanId = 'free' | 'monthly' | 'yearly';
 
export interface ISubscription {
  plan:               PlanId;
  status:             SubscriptionStatus;
  startDate?:         Date;
  endDate?:           Date;              // null for free plan
  aiQueriesUsedToday: number;
  lastAiQueryDate?:   Date;             // used to reset counter daily
}
 
export interface ISettings {
  companyProfile?: ICompanyProfile;
  appPreferences?: IAppPreferences;
}

// ─── Employee / Payroll Profile ────────────────────────────────────────────────
// Attached to a staff account (role: 'staff') to enable payroll — deliberately
// on the same User doc rather than a separate Employee collection, since a
// staff member and an employee are the same person/account. Bank details reuse
// the same shape as IBankingDetails (company banking) for consistency.

export type PayFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface IEmployeeProfile {
  employeeCode?:  string;        // auto-generated e.g. "EMP-00001"
  jobTitle?:      string;
  department?:    string;
  salary?:        number;        // base pay per pay period
  payFrequency?:  PayFrequency;
  hireDate?:      Date;
  bankDetails?:   IBankingDetails;
  taxId?:         string;        // TIN
  pensionId?:     string;        // PFA / RSA number
  emergencyContactName?:  string;
  emergencyContactPhone?: string;
}

// ─── Payroll Preferences ────────────────────────────────────────────────────
// Business-wide statutory deduction settings — applied to every employee's
// payslip when a payroll run is created. Nigeria-specific (PAYE bands, Pension
// Reform Act, National Housing Fund).

export interface IPayrollPreferences {
  payeEnabled:          boolean;  // Nigeria's progressive tax bands — no rate to set, it's law
  pensionEnabled:       boolean;
  pensionEmployeeRate:  number;   // % of gross salary, statutory minimum is 8
  nhfEnabled:            boolean;
  nhfEmployeeRate:       number;  // % of gross salary, statutory rate is 2.5
}

export const DEFAULT_PAYROLL_PREFERENCES: IPayrollPreferences = {
  payeEnabled:         true,
  pensionEnabled:      true,
  pensionEmployeeRate: 8,
  nhfEnabled:           true,
  nhfEmployeeRate:      2.5,
};

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
  payrollPreferences?: IPayrollPreferences;
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
  subscription?: ISubscription;
  ownerId?: string;          // set for saleskeepers — points to the business owner's userId
  avatarUrl?: string;        // user profile avatar
  lastActiveAt?: Date;       // updated (throttled) on authenticated requests — see authMiddleware
  employeeProfile?: IEmployeeProfile;  // payroll info — only set for staff accounts
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
    subAccountCode:     { type: String, trim: true },
    merchantStatus:     { type: Boolean, default: false },
  },
  { _id: false }
);

 
const SubscriptionSchema = new Schema<ISubscription>(
  {
    plan:               { type: String, enum: ['free', 'monthly', 'yearly'], default: 'free' },
    status:             { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
    startDate:          { type: Date },
    endDate:            { type: Date },
    aiQueriesUsedToday: { type: Number, default: 0 },
    lastAiQueryDate:    { type: Date },
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

const PayrollPreferencesSchema = new Schema<IPayrollPreferences>(
  {
    payeEnabled:         { type: Boolean, default: true },
    pensionEnabled:      { type: Boolean, default: true },
    pensionEmployeeRate: { type: Number, default: 8, min: 0, max: 100 },
    nhfEnabled:           { type: Boolean, default: true },
    nhfEmployeeRate:      { type: Number, default: 2.5, min: 0, max: 100 },
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    companyProfile:      { type: CompanyProfileSchema },
    appPreferences:      { type: AppPreferencesSchema },
    payrollPreferences:  { type: PayrollPreferencesSchema },
  },
  { _id: false }
);

const EmployeeProfileSchema = new Schema<IEmployeeProfile>(
  {
    employeeCode: { type: String, trim: true },
    jobTitle:     { type: String, trim: true },
    department:   { type: String, trim: true },
    salary:       { type: Number, min: 0 },
    payFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'] },
    hireDate:     { type: Date },
    bankDetails:  { type: BankingDetailsSchema },
    taxId:        { type: String, trim: true },
    pensionId:    { type: String, trim: true },
    emergencyContactName:  { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
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
    lastActiveAt:     { type: Date },
    employeeProfile:  { type: EmployeeProfileSchema },
    settings: { type: SettingsSchema, default: () => ({}) },
    subscription: { type: SubscriptionSchema, default: () => ({ plan: 'free', status: 'active', aiQueriesUsedToday: 0 }) },
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

// Auto-generate an employee code the first time a staff member is given payroll
// data (salary set) — not just for being staff, since not every staff member
// is necessarily run through payroll.
UserSchema.pre<IUser>('save', async function (next) {
  if (this.employeeProfile?.salary && !this.employeeProfile.employeeCode) {
    const count = await mongoose.model('User').countDocuments({ 'employeeProfile.employeeCode': { $exists: true } });
    this.employeeProfile.employeeCode = `EMP-${String(count + 1).padStart(5, '0')}`;
  }
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
