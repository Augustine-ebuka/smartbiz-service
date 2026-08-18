import { Resend } from 'resend';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendOtpOptions {
  to: string;
  firstName: string;
  otp: string;
}

interface SendPasswordResetOtpOptions {
  to: string;
  firstName: string;
  otp: string;
}

interface SendWelcomeEmailOptions {
  to: string;
  firstName: string;
  businessName: string;
}

interface SendSaleskeeperInviteOptions {
  to: string;
  name: string;
  businessName: string;
  tempPassword: string;
}


interface SendSaleNotificationOptions {
  to: string;                      // business owner email
  ownerName: string;
  businessName: string;
  customerName: string;
  products: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  paymentReference: string;
  paidAt: Date;
}

interface SendPurchaseReceiptOptions {
  to: string;                      // customer email
  customerName: string;
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  products: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  paymentReference: string;
  paidAt: Date;
}

interface InvoiceLineItem {
  description: string;
  quantity:    number;
  unitPrice:   number;
  amount:      number;
}

interface SendInvoiceOptions {
  to: string;                      // customer email
  invoiceNumber: string;
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  customerName: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  notes?: string;
  pdfBuffer?: Buffer;   // when present, attached to the email as a downloadable PDF
}

interface SendWalletFundedOptions {
  to: string;
  firstName: string;
  amount: number;          // in naira, not kobo
  newBalance: number;      // in naira, not kobo
  reference: string;
  source: 'automatic' | 'manual';
  fundedAt: Date;
}

// ─── Resend client ────────────────────────────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);

// Sender address — must match your verified domain in Resend dashboard
// e.g. "Your Business App <no-reply@yourdomain.com>"
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'Your Business App <onboarding@resend.dev>';

// ─── Templates ────────────────────────────────────────────────────────────────

function otpEmailTemplate(firstName: string, otp: string): string {
  return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif}
      .wrapper{max-width:520px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .header{background:#1d4ed8;padding:32px;text-align:center}.header h1{margin:0;color:#fff;font-size:22px}
      .body{padding:36px 40px}.body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
      .otp-box{margin:28px 0;text-align:center}
      .otp-code{display:inline-block;background:#eff6ff;border:2px dashed #1d4ed8;border-radius:8px;padding:16px 40px;font-size:36px;font-weight:700;letter-spacing:10px;color:#1d4ed8}
      .expiry{color:#6b7280;font-size:13px;text-align:center;margin-top:-12px}
      .footer{background:#f9fafb;padding:20px 40px;text-align:center}.footer p{color:#9ca3af;font-size:12px;margin:0}
    </style></head><body>
    <div class="wrapper">
      <div class="header"><h1>Email Verification</h1></div>
      <div class="body">
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to verify your email. It expires in <strong>10 minutes</strong>.</p>
        <div class="otp-box"><span class="otp-code">${otp}</span></div>
        <p class="expiry">Expires in 10 minutes</p>
        <p>If you did not create an account, you can safely ignore this email.</p>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} Your Business App. All rights reserved.</p></div>
    </div>
    </body></html>
  `;
}

function passwordResetEmailTemplate(firstName: string, otp: string): string {
  return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif}
      .wrapper{max-width:520px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .header{background:#dc2626;padding:32px;text-align:center}.header h1{margin:0;color:#fff;font-size:22px}
      .body{padding:36px 40px}.body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
      .otp-box{margin:28px 0;text-align:center}
      .otp-code{display:inline-block;background:#fef2f2;border:2px dashed #dc2626;border-radius:8px;padding:16px 40px;font-size:36px;font-weight:700;letter-spacing:10px;color:#dc2626}
      .expiry{color:#6b7280;font-size:13px;text-align:center;margin-top:-12px}
      .warning{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-top:8px}
      .warning p{color:#92400e;font-size:13px;margin:0}
      .footer{background:#f9fafb;padding:20px 40px;text-align:center}.footer p{color:#9ca3af;font-size:12px;margin:0}
    </style></head><body>
    <div class="wrapper">
      <div class="header"><h1>Password Reset</h1></div>
      <div class="body">
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div class="otp-box"><span class="otp-code">${otp}</span></div>
        <p class="expiry">Expires in 10 minutes</p>
        <div class="warning"><p>⚠️ If you did not request a password reset, ignore this email. Your account is safe.</p></div>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} Your Business App. All rights reserved.</p></div>
    </div>
    </body></html>
  `;
}

function welcomeEmailTemplate(firstName: string, businessName: string): string {
  const appUrl = process.env.APP_URL ?? '#';
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Welcome</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#f4f4f5;font-family:Arial,sans-serif}
        .wrapper{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}

        /* Hero */
        .hero{background:linear-gradient(135deg,#1d4ed8 0%,#0f172a 100%);padding:48px 40px;text-align:center}
        .hero h1{color:#fff;font-size:26px;margin-bottom:8px}
        .hero p{color:#bfdbfe;font-size:15px}

        /* Body */
        .body{padding:36px 40px}
        .intro{color:#374151;font-size:15px;line-height:1.7;margin-bottom:28px}

        /* Features */
        .features-title{color:#111827;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
        .feature{display:flex;gap:14px;align-items:flex-start;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f3f4f6}
        .feature:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
        .icon{width:42px;height:42px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
        .feature-text h3{color:#111827;font-size:14px;font-weight:700;margin-bottom:3px}
        .feature-text p{color:#6b7280;font-size:13px;line-height:1.5}

        /* CTA */
        .cta{text-align:center;margin:32px 0 24px}
        .cta a{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:50px}

        /* Tips */
        .tips{background:#f8fafc;border-radius:10px;padding:20px 24px;margin-top:8px}
        .tips-title{color:#111827;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
        .tips ul{padding-left:20px}
        .tips ul li{color:#374151;font-size:13px;line-height:1.8}

        /* Footer */
        .footer{background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #f3f4f6}
        .footer p{color:#9ca3af;font-size:12px;line-height:1.6}
      </style>
    </head>
    <body>
      <div class="wrapper">

        <div class="hero">
          <h1>Welcome aboard, ${firstName}! 🎉</h1>
          <p>Your business account is verified and ready to go.</p>
        </div>

        <div class="body">
          <p class="intro">
            Hi <strong>${firstName}</strong>, welcome to <strong>Your Business App</strong>!<br/><br/>
            You have successfully verified <strong>${businessName}</strong>.
            Here is everything you can now do to run and grow your business smarter.
          </p>

          <p class="features-title">What you can do</p>

          <div class="feature">
            <div class="icon">💰</div>
            <div class="feature-text">
              <h3>Track Income & Expenses</h3>
              <p>Log every sale and business spend in seconds. Know exactly where your money is coming from and going to — in real time.</p>
            </div>
          </div>

          <div class="feature">
            <div class="icon">📊</div>
            <div class="feature-text">
              <h3>Business Reports</h3>
              <p>Get instant Profit & Loss, Cash Flow, and Expense breakdown reports. Filter by this month, last month, this year, or any custom date range.</p>
            </div>
          </div>

          <div class="feature">
            <div class="icon">🧑‍🤝‍🧑</div>
            <div class="feature-text">
              <h3>Customer Management</h3>
              <p>Build your full customer catalog. Store contacts, addresses, and notes all in one organised place.</p>
            </div>
          </div>

          <div class="feature">
            <div class="icon">📦</div>
            <div class="feature-text">
              <h3>Products & Services</h3>
              <p>Add your products and services with prices so you can quickly attach them when logging income — no need to retype details every time.</p>
            </div>
          </div>

          <div class="feature">
            <div class="icon">🏷️</div>
            <div class="feature-text">
              <h3>Expense Categories</h3>
              <p>Create custom expense categories like Rent, Transport, or Supplies to keep your spending organised and easy to analyse.</p>
            </div>
          </div>

          <div class="feature">
            <div class="icon">👥</div>
            <div class="feature-text">
              <h3>Sales Keeper Access</h3>
              <p>Invite a sales keeper to manage the account on your behalf — they log sales and expenses while you stay in control.</p>
            </div>
          </div>

          <div class="cta">
            <a href="${appUrl}">Go to your dashboard →</a>
          </div>

          <div class="tips">
            <p class="tips-title">🚀 Get started in 3 steps</p>
            <ul>
              <li>Set up your <strong>company profile</strong> — add your logo, address, and banking details</li>
              <li>Add your <strong>products or services</strong> to your catalog</li>
              <li>Log your first <strong>income or expense</strong></li>
            </ul>
          </div>
        </div>

        <div class="footer">
          <p>
            You are receiving this because you just verified your account on <strong>Your Business App</strong>.<br/>
            © ${new Date().getFullYear()} Your Business App. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

function saleskeeperInviteTemplate(name: string, businessName: string, email: string, tempPassword: string): string {
  return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif}
      .wrapper{max-width:520px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .header{background:#1d4ed8;padding:32px;text-align:center}.header h1{margin:0;color:#fff;font-size:22px}.header p{margin:8px 0 0;color:#bfdbfe;font-size:14px}
      .body{padding:36px 40px}.body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
      .credentials{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px 24px;margin:24px 0}
      .credentials p{margin:6px 0;font-size:14px;color:#0c4a6e}.credentials strong{display:inline-block;min-width:110px;color:#075985}
      .credentials .password{font-size:22px;font-weight:700;letter-spacing:4px;color:#1d4ed8;margin-top:8px}
      .warning{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-top:4px}
      .warning p{color:#92400e;font-size:13px;margin:0}
      .footer{background:#f9fafb;padding:20px 40px;text-align:center}.footer p{color:#9ca3af;font-size:12px;margin:0}
    </style></head><body>
    <div class="wrapper">
      <div class="header"><h1>You have been invited!</h1><p>Sales Keeper Access — ${businessName}</p></div>
      <div class="body">
        <p>Hi <strong>${name}</strong>,</p>
        <p>You have been invited to manage sales for <strong>${businessName}</strong>. Use the credentials below to log in.</p>
        <div class="credentials">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Password:</strong></p>
          <p class="password">${tempPassword}</p>
        </div>
        <div class="warning"><p>⚠️ Please change your password after your first login for security.</p></div>
      </div>
      <div class="footer"><p>© ${new Date().getFullYear()} Your Business App. All rights reserved.</p></div>
    </div>
    </body></html>
  `;
}

// ─── Sale Notification Template (to business owner) ──────────────────────────

function saleNotificationTemplate(
  ownerName: string,
  businessName: string,
  customerName: string,
  products: Array<{ name: string; quantity: number; price: number }>,
  totalAmount: number,
  paymentReference: string,
  paidAt: Date
): string {
  const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const dateStr = new Date(paidAt).toLocaleString('en-NG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos',
  });

  const productRows = products.map(p => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px">${p.name}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;text-align:center">${p.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;text-align:right">${fmt(p.price)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:right;font-weight:600">${fmt(p.quantity * p.price)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>New Sale</title></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#16a34a 0%,#064e3b 100%);padding:32px 40px">
          <div style="font-size:32px;margin-bottom:8px">💰</div>
          <h1 style="margin:0;color:#fff;font-size:22px">New Sale!</h1>
          <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px">${businessName}</p>
        </div>

        <!-- Body -->
        <div style="padding:32px 40px">
          <p style="color:#374151;font-size:15px;margin:0 0 8px">Hi <strong>${ownerName}</strong>,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 24px">
            You just made a sale! <strong>${customerName}</strong> completed a payment on your store.
          </p>

          <!-- Amount highlight -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;text-align:center;margin-bottom:28px">
            <p style="margin:0 0 4px;color:#166534;font-size:13px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Amount Received</p>
            <p style="margin:0;color:#15803d;font-size:36px;font-weight:800">${fmt(totalAmount)}</p>
          </div>

          <!-- Products table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
              <tr>
                <th style="text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #f3f4f6">Item</th>
                <th style="text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #f3f4f6">Qty</th>
                <th style="text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #f3f4f6">Unit Price</th>
                <th style="text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #f3f4f6">Subtotal</th>
              </tr>
            </thead>
            <tbody>${productRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding-top:12px;font-size:14px;font-weight:700;color:#111827;text-align:right;padding-right:16px">Total</td>
                <td style="padding-top:12px;font-size:16px;font-weight:800;color:#15803d;text-align:right">${fmt(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Meta -->
          <div style="background:#f9fafb;border-radius:8px;padding:16px 20px">
            <p style="margin:0 0 8px;font-size:13px;color:#374151"><strong>Customer:</strong> ${customerName}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151"><strong>Reference:</strong> ${paymentReference}</p>
            <p style="margin:0;font-size:13px;color:#374151"><strong>Paid at:</strong> ${dateStr}</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6">
          <p style="color:#9ca3af;font-size:12px;margin:0">© ${new Date().getFullYear()} PayFlex. All rights reserved.</p>
        </div>

      </div>
    </body>
    </html>
  `;
}

// ─── Purchase Receipt Template (to customer) ──────────────────────────────────

function purchaseReceiptTemplate(
  customerName: string,
  businessName: string,
  businessEmail: string | undefined,
  businessPhone: string | undefined,
  products: Array<{ name: string; quantity: number; price: number }>,
  totalAmount: number,
  paymentReference: string,
  paidAt: Date
): string {
  const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const dateStr = new Date(paidAt).toLocaleString('en-NG', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Lagos',
  });

  const productRows = products.map(p => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px">${p.name}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;text-align:center">${p.quantity}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;text-align:right">${fmt(p.price)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:right;font-weight:600">${fmt(p.quantity * p.price)}</td>
    </tr>
  `).join('');

  const contactLine = [businessEmail, businessPhone].filter(Boolean).join(' · ');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>Your Receipt</title></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1d4ed8 0%,#0f172a 100%);padding:32px 40px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🧾</div>
          <h1 style="margin:0;color:#fff;font-size:22px">Payment Receipt</h1>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px">${businessName}</p>
        </div>

        <!-- Body -->
        <div style="padding:32px 40px">

          <p style="color:#374151;font-size:15px;margin:0 0 4px">Hi <strong>${customerName}</strong>,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 28px">
            Thank you for your purchase from <strong>${businessName}</strong>. Here is your receipt.
          </p>

          <!-- Receipt details -->
          <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px">

            <!-- Date + Reference -->
            <div style="background:#f9fafb;padding:14px 20px;display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb">
              <div>
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Date</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#111827">${dateStr}</p>
              </div>
              <div style="text-align:right">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Reference</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#111827;font-family:monospace">${paymentReference}</p>
              </div>
            </div>

            <!-- Products table -->
            <div style="padding:0 20px">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Item</th>
                    <th style="text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Qty</th>
                    <th style="text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Price</th>
                    <th style="text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Total</th>
                  </tr>
                </thead>
                <tbody>${productRows}</tbody>
              </table>
            </div>

            <!-- Total -->
            <div style="background:#1d4ed8;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
              <span style="color:#bfdbfe;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Total Paid</span>
              <span style="color:#fff;font-size:22px;font-weight:800">${fmt(totalAmount)}</span>
            </div>
          </div>

          <!-- Status badge -->
          <div style="text-align:center;margin-bottom:28px">
            <span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:13px;font-weight:700;padding:8px 20px;border-radius:50px;letter-spacing:.5px">
              ✅ PAYMENT CONFIRMED
            </span>
          </div>

          <!-- Business contact -->
          ${contactLine ? `
          <div style="border-top:1px solid #f3f4f6;padding-top:20px;text-align:center">
            <p style="margin:0;font-size:13px;color:#6b7280">Questions? Contact <strong>${businessName}</strong></p>
            <p style="margin:6px 0 0;font-size:13px;color:#1d4ed8">${contactLine}</p>
          </div>` : ''}

        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            This is an automated receipt. Please keep it for your records.<br/>
            © ${new Date().getFullYear()} PayFlex. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

// ─── Invoice Template (to customer) ────────────────────────────────────────────

function invoiceEmailTemplate(
  invoiceNumber: string,
  businessName: string,
  businessEmail: string | undefined,
  businessPhone: string | undefined,
  customerName: string,
  issueDate: Date,
  dueDate: Date,
  lineItems: InvoiceLineItem[],
  subtotal: number,
  taxPercent: number,
  taxAmount: number,
  discountAmount: number,
  total: number,
  currency: string,
  notes: string | undefined
): string {
  const fmt = (n: number) => `${currency} ${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-NG', { dateStyle: 'long', timeZone: 'Africa/Lagos' });

  const productRows = lineItems.map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px">${item.description}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;text-align:center">${item.quantity}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;text-align:right">${fmt(item.unitPrice)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:right;font-weight:600">${fmt(item.amount)}</td>
    </tr>
  `).join('');

  const contactLine = [businessEmail, businessPhone].filter(Boolean).join(' · ');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>Invoice ${invoiceNumber}</title></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1d4ed8 0%,#0f172a 100%);padding:32px 40px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🧾</div>
          <h1 style="margin:0;color:#fff;font-size:22px">Invoice ${invoiceNumber}</h1>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px">${businessName}</p>
        </div>

        <!-- Body -->
        <div style="padding:32px 40px">

          <p style="color:#374151;font-size:15px;margin:0 0 4px">Hi <strong>${customerName}</strong>,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 28px">
            Please find your invoice from <strong>${businessName}</strong> below.
          </p>

          <!-- Invoice details -->
          <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px">

            <!-- Dates -->
            <div style="background:#f9fafb;padding:14px 20px;display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb">
              <div>
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Issue Date</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#111827">${fmtDate(issueDate)}</p>
              </div>
              <div style="text-align:right">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Due Date</p>
                <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#111827">${fmtDate(dueDate)}</p>
              </div>
            </div>

            <!-- Line items table -->
            <div style="padding:0 20px">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Item</th>
                    <th style="text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Qty</th>
                    <th style="text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Price</th>
                    <th style="text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;padding:12px 0 8px;border-bottom:2px solid #f3f4f6">Total</th>
                  </tr>
                </thead>
                <tbody>${productRows}</tbody>
              </table>
            </div>

            <!-- Totals breakdown -->
            <div style="padding:16px 20px 4px">
              <div style="display:flex;justify-content:space-between;padding:6px 0;color:#6b7280;font-size:13px">
                <span>Subtotal</span><span>${fmt(subtotal)}</span>
              </div>
              ${taxAmount ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;color:#6b7280;font-size:13px">
                <span>Tax (${taxPercent}%)</span><span>${fmt(taxAmount)}</span>
              </div>` : ''}
              ${discountAmount ? `
              <div style="display:flex;justify-content:space-between;padding:6px 0;color:#6b7280;font-size:13px">
                <span>Discount</span><span>-${fmt(discountAmount)}</span>
              </div>` : ''}
            </div>

            <!-- Total -->
            <div style="background:#1d4ed8;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
              <span style="color:#bfdbfe;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Total Due</span>
              <span style="color:#fff;font-size:22px;font-weight:800">${fmt(total)}</span>
            </div>
          </div>

          ${notes ? `
          <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Notes</p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${notes}</p>
          </div>` : ''}

          <!-- Business contact -->
          ${contactLine ? `
          <div style="border-top:1px solid #f3f4f6;padding-top:20px;text-align:center">
            <p style="margin:0;font-size:13px;color:#6b7280">Questions? Contact <strong>${businessName}</strong></p>
            <p style="margin:6px 0 0;font-size:13px;color:#1d4ed8">${contactLine}</p>
          </div>` : ''}

        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            © ${new Date().getFullYear()} ${businessName}. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

// ─── Wallet Funded Template ────────────────────────────────────────────────────

function walletFundedTemplate(
  firstName: string,
  amount: number,
  newBalance: number,
  reference: string,
  source: 'automatic' | 'manual',
  fundedAt: Date
): string {
  const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const dateStr = new Date(fundedAt).toLocaleString('en-NG', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Lagos',
  });
  const sourceLabel = source === 'manual' ? 'Manual credit' : 'Bank transfer / card deposit';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>Wallet Funded</title></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#16a34a 0%,#0f172a 100%);padding:32px 40px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">💰</div>
          <h1 style="margin:0;color:#fff;font-size:22px">Wallet Funded</h1>
        </div>

        <!-- Body -->
        <div style="padding:32px 40px">

          <p style="color:#374151;font-size:15px;margin:0 0 4px">Hi <strong>${firstName}</strong>,</p>
          <p style="color:#374151;font-size:15px;margin:0 0 28px">
            Your wallet has just been credited. Here are the details.
          </p>

          <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px">

            <div style="background:#16a34a;padding:20px;text-align:center">
              <p style="margin:0;color:#bbf7d0;font-size:12px;text-transform:uppercase;letter-spacing:.5px;font-weight:600">Amount Credited</p>
              <p style="margin:6px 0 0;color:#fff;font-size:28px;font-weight:800">+${fmt(amount)}</p>
            </div>

            <div style="padding:0 20px">
              <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f3f4f6">
                <span style="color:#6b7280;font-size:13px">New Balance</span>
                <span style="color:#111827;font-size:13px;font-weight:700">${fmt(newBalance)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f3f4f6">
                <span style="color:#6b7280;font-size:13px">Source</span>
                <span style="color:#111827;font-size:13px;font-weight:600">${sourceLabel}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f3f4f6">
                <span style="color:#6b7280;font-size:13px">Reference</span>
                <span style="color:#111827;font-size:13px;font-weight:600;font-family:monospace">${reference}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:14px 0">
                <span style="color:#6b7280;font-size:13px">Date</span>
                <span style="color:#111827;font-size:13px;font-weight:600">${dateStr}</span>
              </div>
            </div>
          </div>

          <p style="color:#6b7280;font-size:13px;text-align:center;margin:0">
            If you don't recognize this transaction, please contact support immediately.
          </p>

        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            © ${new Date().getFullYear()} Your Business App. All rights reserved.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class EmailService {

  async sendOtp({ to, firstName, otp }: SendOtpOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `${otp} is your verification code`,
      html:    otpEmailTemplate(firstName, otp),
    });
  }

  async sendPasswordResetOtp({ to, firstName, otp }: SendPasswordResetOtpOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `${otp} — your password reset code`,
      html:    passwordResetEmailTemplate(firstName, otp),
    });
  }

  async sendWelcomeEmail({ to, firstName, businessName }: SendWelcomeEmailOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `Welcome to Your Business App, ${firstName}! 🎉`,
      html:    welcomeEmailTemplate(firstName, businessName),
    });
  }

  async sendSaleskeeperInvite({ to, name, businessName, tempPassword }: SendSaleskeeperInviteOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `You have been invited to manage ${businessName}`,
      html:    saleskeeperInviteTemplate(name, businessName, to, tempPassword),
    });
  }

  async sendSaleNotification({
    to, ownerName, businessName, customerName,
    products, totalAmount, paymentReference, paidAt,
  }: SendSaleNotificationOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `💰 New sale — ${customerName} paid ₦${totalAmount.toLocaleString('en-NG')}`,
      html:    saleNotificationTemplate(ownerName, businessName, customerName, products, totalAmount, paymentReference, paidAt),
    });
  }

  async sendPurchaseReceipt({
    to, customerName, businessName, businessEmail, businessPhone,
    products, totalAmount, paymentReference, paidAt,
  }: SendPurchaseReceiptOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `Your receipt from ${businessName} — ₦${totalAmount.toLocaleString('en-NG')}`,
      html:    purchaseReceiptTemplate(customerName, businessName, businessEmail, businessPhone, products, totalAmount, paymentReference, paidAt),
    });
  }

  async sendInvoice({
    to, invoiceNumber, businessName, businessEmail, businessPhone, customerName,
    issueDate, dueDate, lineItems, subtotal, taxPercent, taxAmount, discountAmount, total, currency, notes, pdfBuffer,
  }: SendInvoiceOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `Invoice ${invoiceNumber} from ${businessName} — ${currency} ${total.toLocaleString('en-NG')}`,
      html:    invoiceEmailTemplate(
        invoiceNumber, businessName, businessEmail, businessPhone, customerName,
        issueDate, dueDate, lineItems, subtotal, taxPercent, taxAmount, discountAmount, total, currency, notes
      ),
      ...(pdfBuffer ? { attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] } : {}),
    });
  }

  async sendInvoiceClaimNotification({
    to, ownerName, invoiceNumber, claimantName, claimantEmail, proofUrl, total, claimedAt,
  }: {
    to: string;
    ownerName: string;
    invoiceNumber: string;
    claimantName?: string;
    claimantEmail?: string;
    proofUrl?: string;
    total?: number;
    claimedAt: Date;
  }): Promise<void> {
    const html = `
      <p>Hi ${ownerName},</p>
      <p>A claim was submitted for invoice <strong>${invoiceNumber}</strong> on ${claimedAt.toISOString()}.</p>
      <p><strong>Claimant:</strong> ${claimantName ?? 'Anonymous'} (${claimantEmail ?? 'no email provided'})</p>
      <p><strong>Amount:</strong> ${total != null ? '₦' + total.toLocaleString('en-NG') : 'N/A'}</p>
      ${proofUrl ? `<p>Proof: <a href="${proofUrl}">View proof</a></p>` : ''}
      <p>Visit the dashboard to review and respond to this claim.</p>
    `;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Claim submitted for invoice ${invoiceNumber}`,
      html,
    });
  }

  async sendWalletFunded({
    to, firstName, amount, newBalance, reference, source, fundedAt,
  }: SendWalletFundedOptions): Promise<void> {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to,
      subject: `💰 Your wallet was credited with ₦${amount.toLocaleString('en-NG')}`,
      html:    walletFundedTemplate(firstName, amount, newBalance, reference, source, fundedAt),
    });
  }

}

export default new EmailService();