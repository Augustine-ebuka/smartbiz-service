import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory =
  | 'billing'
  | 'technical'
  | 'account'
  | 'inventory'
  | 'payments'
  | 'reports'
  | 'other';

// ─── Reply Interface ──────────────────────────────────────────────────────────

export interface ITicketReply {
  _id:        mongoose.Types.ObjectId;
  senderId:   string;
  senderName: string;
  senderRole: 'user' | 'admin';
  message:    string;
  createdAt:  Date;
}

// ─── Ticket Interface ─────────────────────────────────────────────────────────

export interface ITicket extends Document {
  _id:          string;
  ticketId:     string;             // human-readable e.g. "TKT-00042"
  userId:       string;             // who submitted
  userName:     string;             // snapshot
  userEmail:    string;             // snapshot
  category:     TicketCategory;
  subject:      string;
  message:      string;             // initial message
  status:       TicketStatus;
  priority:     TicketPriority;
  assignedTo?:  string;             // admin userId
  assignedName?: string;
  replies:      ITicketReply[];
  resolvedAt?:  Date;
  closedAt?:    Date;
  firstReplyAt?: Date;              // for response time tracking
  // Unread counters — cheap to read in list views since they're plain stored
  // integers, not derived from `replies` (which list endpoints don't even fetch).
  userUnreadCount:  number;         // unread ADMIN replies, from the customer's side
  adminUnreadCount: number;         // unread CUSTOMER messages, from the admin's side
  createdAt:    Date;
  updatedAt:    Date;
}

// ─── Sub-Schema: Reply ────────────────────────────────────────────────────────

const TicketReplySchema = new Schema<ITicketReply>(
  {
    senderId:   { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ['user', 'admin'], required: true },
    message:    { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// ─── Schema ───────────────────────────────────────────────────────────────────

const TicketSchema = new Schema<ITicket>(
  {
    ticketId:     { type: String, unique: true },
    userId:       { type: String, required: true, index: true },
    userName:     { type: String, required: true },
    userEmail:    { type: String, required: true },
    category:     { type: String, required: true, enum: ['billing','technical','account','inventory','payments','reports','other'] },
    subject:      { type: String, required: true, trim: true },
    message:      { type: String, required: true, trim: true },
    status:       { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open' },
    priority:     { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
    assignedTo:   { type: String },
    assignedName: { type: String },
    replies:      [TicketReplySchema],
    resolvedAt:   { type: Date },
    closedAt:     { type: Date },
    firstReplyAt: { type: Date },
    userUnreadCount:  { type: Number, default: 0 },
    adminUnreadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Auto-generate human readable ticketId ────────────────────────────────────

TicketSchema.pre('save', async function (next) {
  if (!this.ticketId) {
    const count    = await mongoose.model('Ticket').countDocuments();
    this.ticketId  = `TKT-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

TicketSchema.index({ status: 1, priority: 1 });
TicketSchema.index({ userId: 1, status: 1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({ createdAt: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);