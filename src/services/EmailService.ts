import nodemailer, { Transporter } from 'nodemailer';

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

// ─── Transport ────────────────────────────────────────────────────────────────

function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

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

// ─── Service ──────────────────────────────────────────────────────────────────

class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = createTransport();
  }

async sendOtp({ to, firstName, otp }: SendOtpOptions) {
  console.log("Starting email send");

  const response = await this.transporter.sendMail({
    from: `"SmartBiz" <${process.env.EMAIL_USER}>`,
    to,
    subject: `${otp} is your verification code`,
    html: otpEmailTemplate(firstName, otp),
  });

  console.log("Email sent successfully", response);

  return response;
}

  async sendPasswordResetOtp({ to, firstName, otp }: SendPasswordResetOtpOptions): Promise<void> {
    await this.transporter.sendMail({
      from: `"SmartBiz" <${process.env.EMAIL_USER}>`,
      to,
      subject: `${otp} — your password reset code`,
      html: passwordResetEmailTemplate(firstName, otp),
    });
  }

  async sendWelcomeEmail({ to, firstName, businessName }: SendWelcomeEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: `"SmartBiz" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Welcome to SmartBiz, ${firstName}! 🎉`,
      html: welcomeEmailTemplate(firstName, businessName),
    });
  }

  async sendSaleskeeperInvite({ to, name, businessName, tempPassword }: SendSaleskeeperInviteOptions): Promise<void> {
    await this.transporter.sendMail({
      from: `"SmartBiz" <${process.env.EMAIL_USER}>`, 
      to,
      subject: `You have been invited to manage ${businessName}`,
      html: saleskeeperInviteTemplate(name, businessName, to, tempPassword),
    });
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

export default new EmailService();